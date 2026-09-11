import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

// The hook's module reaches for the router, auth and storage at import time;
// none loads under `testEnvironment: node` and `syncInterests` touches none.
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getProfileInterests: jest.fn(),
    addProfileInterests: jest.fn(),
    removeProfileInterests: jest.fn(),
  },
}))
jest.mock('../lib/logger', () => ({
  Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() },
}))
jest.mock('expo-router', () => ({ router: {} }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: null }) }))
jest.mock('../lib/onboardingStorage', () => ({}))

import { syncInterests } from '../lib/useOnboarding'

const mockApi = jest.requireMock('../lib/apiClient').apiClient as Record<
  'getProfileInterests' | 'addProfileInterests' | 'removeProfileInterests',
  jest.Mock
>

beforeEach(() => {
  mockApi.getProfileInterests.mockReset()
  mockApi.addProfileInterests.mockReset()
  mockApi.removeProfileInterests.mockReset()
})

/**
 * Onboarding writes the interest GRAPH, not just the names.
 *
 * ## The bug this pins
 *
 * The `details` step committed `{ interests, bio }` — free-text names — and the
 * profile PUT wrote them to `profiles.interests`. Nothing ever created a
 * `user_interests` row, which is the structured graph.
 *
 * The consequence was concrete rather than tidy: `lib/board.ts` gates posting on
 * `interestCount >= MIN_INTERESTS_TO_RANK` (2), fed from
 * `db.user_interests.count(...)` — so **a person who completed onboarding could
 * not post on the pre-event board or send a board request**, and matched weakly
 * because ranking's dominant term is the graph.
 *
 * Measured on staging when it was found: 36 profiles with free text, 29 with a
 * graph, and the two sets **disjoint** — the 29 were seeded, and every account
 * that came through onboarding had an empty graph.
 *
 * ## Why it hid
 *
 * Every surface renders the free-text array — the onboarding summary and the
 * admin Users list both showed "Theatre · Film screenings" — so the screens
 * looked right. Only the column nothing displays was empty.
 *
 * Structural rather than behavioural because the write is three files apart
 * (picker → draft → hook) and the failure mode is a value silently not being
 * carried, which a mocked API client would happily accept either way.
 */
describe('the details step carries category ids, not only names', () => {
  it('toggles on the id as well as the name', () => {
    const src = read('app/onboarding/details.tsx')

    // The picker has had `item.id` all along; the screen used only `item.name`.
    expect(src).toMatch(/onPress=\{\(\) => toggle\(item\.id, item\.name\)\}/)
    expect(src).toMatch(/setInterestIds\(/)
    // And both are committed, because both are still read.
    expect(src).toMatch(/commit\(\{ interests, interestIds, bio: bio\.trim\(\) \}\)/)
  })

  it('rehydrates the ids from the draft, so going back does not drop them', () => {
    // Names rehydrated and ids did not would be the same bug with one more step
    // in front of it.
    expect(read('app/onboarding/details.tsx')).toMatch(/setInterestIds\(draft\.interestIds \?\? \[\]\)/)
  })
})

describe('the hook writes the graph', () => {
  it('syncs on the details step, and syncs again in finish()', () => {
    /*
     * `interestIds` is not a profile field: `updateProfileSchema` on the server
     * has no such key and strips it. So the per-step profile PUT can never
     * carry it, and "everything is re-sent on the final save" was false for the
     * one field whose absence is silent. The first version of this file claimed
     * the backstop and did not have it — the comment said `finish()` re-sent
     * the graph, and `finish()` called `updateProfile` and nothing else.
     */
    const src = read('lib/useOnboarding.ts')
    expect(src).toMatch(/if \(step === 'details' && merged\.interestIds\) \{/)

    const finishStart = src.indexOf('const finish = useCallback(')
    const sync = src.indexOf('syncInterests(userId, draft.interestIds)', finishStart)
    const profile = src.indexOf('apiClient.updateProfile(userId, { ...draft, onboarded: true })', finishStart)
    expect(sync).toBeGreaterThan(finishStart)
    expect(sync).toBeLessThan(profile)
  })

  it('writes the graph BEFORE the profile, and inside the try', () => {
    // Order, for the reason `app/about-you.tsx` argues: idempotent and
    // re-runnable, so a profile write failing after it loses nothing. Inside
    // the `try` because that block is what stops a throw pinning the button.
    const src = read('lib/useOnboarding.ts')
    const tryStart = src.indexOf('      try {')
    const interests = src.indexOf('syncInterests(userId, merged.interestIds)')
    const profile = src.indexOf('apiClient.updateProfile(userId, body)')

    expect(tryStart).toBeGreaterThan(-1)
    expect(interests).toBeGreaterThan(tryStart)
    expect(interests).toBeLessThan(profile)
  })
})

describe('syncInterests makes the server match the picker', () => {
  /*
   * Behavioural, because the diff is logic and a structural pin on "calls
   * addProfileInterests" passed against a version that never removed anything.
   * POST is additive and DELETE removes; there is no replace, so un-ticking an
   * interest and pressing Continue used to leave it on the server for ever.
   */
  const held = (ids: string[]) => ({
    success: true,
    data: { interests: ids.map((id) => ({ id, name: id, slug: id })) },
  })

  it('adds what is missing and removes what was un-ticked', async () => {
    mockApi.getProfileInterests.mockResolvedValue(held(['a', 'b']))
    mockApi.addProfileInterests.mockResolvedValue({ success: true, data: {} })
    mockApi.removeProfileInterests.mockResolvedValue({ success: true })

    await expect(syncInterests('u1', ['b', 'c'])).resolves.toBe(true)
    expect(mockApi.addProfileInterests).toHaveBeenCalledWith('u1', ['c'])
    expect(mockApi.removeProfileInterests).toHaveBeenCalledWith('u1', ['a'])
  })

  it('sends nothing when the server already matches', async () => {
    mockApi.getProfileInterests.mockResolvedValue(held(['a', 'b']))
    await expect(syncInterests('u1', ['a', 'b'])).resolves.toBe(true)
    expect(mockApi.addProfileInterests).not.toHaveBeenCalled()
    expect(mockApi.removeProfileInterests).not.toHaveBeenCalled()
  })

  it('reports failure rather than throwing when a write is refused', async () => {
    // Both callers sit under "a failed server save does not block anyone".
    mockApi.getProfileInterests.mockResolvedValue(held([]))
    mockApi.addProfileInterests.mockResolvedValue({ success: false, error: 'nope' })
    await expect(syncInterests('u1', ['a'])).resolves.toBe(false)
  })

  it('reports failure when the add held but the remove was refused', async () => {
    mockApi.getProfileInterests.mockResolvedValue(held(['a']))
    mockApi.addProfileInterests.mockResolvedValue({ success: true, data: {} })
    mockApi.removeProfileInterests.mockResolvedValue({ success: false, error: 'nope' })
    await expect(syncInterests('u1', ['b'])).resolves.toBe(false)
    expect(mockApi.addProfileInterests).toHaveBeenCalledWith('u1', ['b'])
  })

  it('sends a duplicated pick once', async () => {
    mockApi.getProfileInterests.mockResolvedValue(held([]))
    mockApi.addProfileInterests.mockResolvedValue({ success: true, data: {} })
    await syncInterests('u1', ['a', 'a'])
    expect(mockApi.addProfileInterests).toHaveBeenCalledWith('u1', ['a'])
  })

  it('reads the wrapped shape the server actually returns', async () => {
    // `getProfileInterests` was typed as a bare array for as long as nothing
    // called it. The route returns `{ interests: [...] }`.
    mockApi.getProfileInterests.mockResolvedValue(held(['a']))
    mockApi.removeProfileInterests.mockResolvedValue({ success: true })
    await syncInterests('u1', [])
    expect(mockApi.removeProfileInterests).toHaveBeenCalledWith('u1', ['a'])
  })
})

describe('"Maybe later" is an answer, and gets recorded', () => {
  it.each([
    ['app/onboarding/notifications.tsx', 'push_enabled'],
    ['app/onboarding/location.tsx', 'share_location'],
  ])('%s records false rather than skipping', (file, field) => {
    /*
     * Both columns are `@default(true)`, and both screens called `skip()` on
     * the decline path — which writes progress and draft and nothing else. So
     * the profile said this person wants push notifications and wants to share
     * their location, when they had said neither.
     *
     * `notifications.tsx`'s own docstring has always claimed the opposite:
     * "push_enabled records the answer either way." One more comment describing
     * behaviour the code did not have.
     */
    const src = read(file)
    expect(src).toMatch(new RegExp(`onSecondary=\\{\\(\\) => void commit\\(\\{ ${field}: false \\}\\)\\}`))
    // And the decline path no longer reaches `skip`, which is what wrote nothing.
    expect(src).not.toMatch(/onSecondary=\{\(\) => void skip\(\)\}/)
  })
})

describe('the first screen does not ask again for something already given', () => {
  it('seeds the name from the account when there is no draft', () => {
    /*
     * Sign-up creates the account WITH a name. This screen rendered the field
     * empty with the placeholder "e.g. Julian Ember", so somebody typed their
     * name, tapped Create account, and was asked for it again seconds later.
     *
     * Draft first: a draft value is something typed HERE and may be a
     * correction of the account name.
     */
    expect(read('app/onboarding/basics.tsx')).toMatch(
      /setName\(draft\.name \?\? user\?\.name \?\? ''\)/
    )
  })
})

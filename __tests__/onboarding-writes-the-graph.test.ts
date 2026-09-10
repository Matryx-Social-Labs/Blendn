import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

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
  it('calls addProfileInterests when the draft carries ids', () => {
    const src = read('lib/useOnboarding.ts')
    expect(src).toMatch(/if \(merged\.interestIds\?\.length\) \{/)
    expect(src).toMatch(/apiClient\.addProfileInterests\(userId, merged\.interestIds\)/)
  })

  it('writes the graph BEFORE the profile, and inside the try', () => {
    /*
     * Order, for the reason `app/about-you.tsx` argues: this call is idempotent
     * and re-runnable from edit-profile, so if the profile write fails after it
     * nothing is permanently lost.
     *
     * Inside the `try`, because that block is load-bearing here — the file's own
     * rule is "a failed server save does not block anyone", and a throw outside
     * it would leave the Continue button spinning with no way past.
     */
    const src = read('lib/useOnboarding.ts')
    const tryStart = src.indexOf('      try {')
    const interests = src.indexOf('apiClient.addProfileInterests')
    const profile = src.indexOf('apiClient.updateProfile(userId, body)')

    expect(tryStart).toBeGreaterThan(-1)
    expect(interests).toBeGreaterThan(tryStart)
    expect(interests).toBeLessThan(profile)
  })

  it('does not block anyone when the graph write fails', () => {
    // A warning, not a throw. The last step re-sends the draft, so the recovery
    // is automatic and the cost of failing here is a few minutes' delay.
    const src = read('lib/useOnboarding.ts')
    expect(src).toMatch(/Onboarding could not save the interest graph/)
    expect(src).not.toMatch(/throw new Error\(added\.error/)
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

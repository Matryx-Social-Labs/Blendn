/**
 * Blendn+ as the app shows it (plan v2 step 11): the server's status, the wait
 * for the webhook after a purchase, what Plus is said to be, and the history
 * row for nights kept behind it.
 */
jest.mock('../lib/apiClient', () => ({ apiClient: { getMyPlus: jest.fn() } }))

/* eslint-disable import/first */
import { apiClient } from '../lib/apiClient'
import { PLUS_FEATURES, PLUS_POLL_EVERY_MS, plusStatusLine, waitForPlus } from '../lib/plus'
import { lockedNightsLabel, withLockedNights, type GoingItem } from '../lib/savedEvents'
/* eslint-enable import/first */

const getMyPlus = apiClient.getMyPlus as jest.Mock
const inactive = { success: true, data: { active: false, gated: true, product: null, source: null, expiresAt: null } }
const active = { success: true, data: { active: true, gated: true, product: 'plus', source: 'apple', expiresAt: '2026-11-10T10:00:00.000Z' } }

describe('the status line', () => {
  it('says nothing without Plus; names the product and when it ends', () => {
    expect(plusStatusLine(null)).toBeNull()
    expect(plusStatusLine(inactive.data as never)).toBeNull()
    expect(plusStatusLine(active.data as never)).toMatch(/^Blendn\+ until .*2026/)
    // A pass shows its day as well as its time: passes stack, and the hour alone could be any day's (review LOW).
    expect(plusStatusLine({ active: true, gated: true, product: 'night_pass', source: 'grant', expiresAt: '2026-10-11T00:30:00.000Z' })).toMatch(
      /^Night Pass until .*2026, \d{1,2}:\d{2}/
    )
    expect(plusStatusLine({ active: true, gated: true, product: 'plus', source: 'grant', expiresAt: null })).toBe('You have Blendn+')
  })
})

describe('after a purchase, the server is asked until the webhook has landed', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('every 3 seconds, and returns the server\'s answer once it says active', async () => {
    getMyPlus.mockResolvedValueOnce(inactive).mockResolvedValueOnce(inactive).mockResolvedValue(active)
    const done = waitForPlus()
    await jest.advanceTimersByTimeAsync(3000)
    await jest.advanceTimersByTimeAsync(3000)
    await expect(done).resolves.toEqual(active.data)
    expect(getMyPlus).toHaveBeenCalledTimes(3)
    expect(PLUS_POLL_EVERY_MS).toBe(3000)
  })

  it('gives up after about a minute (null: "taking longer than usual")', async () => {
    getMyPlus.mockResolvedValue(inactive)
    let settled: unknown = 'pending'
    void waitForPlus().then((r) => { settled = r })
    await jest.advanceTimersByTimeAsync(57_000)
    expect(settled).toBe('pending')
    await jest.advanceTimersByTimeAsync(3_000)
    expect(settled).toBeNull()
    expect(getMyPlus.mock.calls.length).toBeGreaterThanOrEqual(20)
    expect(getMyPlus.mock.calls.length).toBeLessThanOrEqual(21)
  })

  it('takes a failed ask as "not yet", never as the end of the wait (review MEDIUM)', async () => {
    getMyPlus.mockRejectedValueOnce(new Error('queue cleared')).mockResolvedValue(active)
    const done = waitForPlus()
    await jest.advanceTimersByTimeAsync(3000)
    await expect(done).resolves.toEqual(active.data)
  })

  it('stops when the screen has closed', async () => {
    getMyPlus.mockResolvedValue(inactive)
    let closed = false
    const done = waitForPlus(() => closed)
    await jest.advanceTimersByTimeAsync(0)
    closed = true
    await jest.advanceTimersByTimeAsync(3000)
    await expect(done).resolves.toBeNull()
    expect(getMyPlus).toHaveBeenCalledTimes(1)
  })
})

describe('what Plus is said to be', () => {
  it('only what exists today — no "coming soon" — and nothing from the never-sold list (review H2)', () => {
    expect(PLUS_FEATURES.map((f) => f.title)).toEqual(["Stay live while I'm here", 'Your full night history'])
    expect(PLUS_FEATURES.map((f) => f.detail).join(' ').toLowerCase()).not.toContain('coming soon')
    const said = PLUS_FEATURES.map((f) => `${f.title} ${f.detail}`).join(' ').toLowerCase()
    for (const never of ['liked you', 'likes', 'unlimited', 'boost', 'reveal', 'without going live', 'more asks', 'more waves']) {
      expect(said).not.toContain(never)
    }
  })
})

describe('nights kept behind Blendn+ (lockedCount)', () => {
  const past: GoingItem[] = [
    { kind: 'header', key: 'h:past', title: 'Past' },
    { kind: 'past', key: 'p:1', row: {} as never },
  ]

  it('one row after Past, only when the server kept some back', () => {
    expect(withLockedNights(past, 0)).toBe(past)
    expect(withLockedNights(past, undefined)).toBe(past)
    expect(withLockedNights(past, 4).map((i) => i.key)).toEqual(['h:past', 'p:1', 'locked'])
  })

  it('under its own Past heading when none of the shown nights has ended', () => {
    expect(withLockedNights([], 2).map((i) => i.key)).toEqual(['h:past', 'locked'])
  })

  it('"{n} more nights with Blendn+"', () => {
    expect(lockedNightsLabel(4)).toBe('4 more nights with Blendn+')
    expect(lockedNightsLabel(1)).toBe('1 more night with Blendn+')
  })
})

describe('Going re-reads when the app comes back (review MEDIUM: a pending payment confirmed while away)', () => {
  it('reloads on focus and on AppState active', () => {
    const going = require('fs').readFileSync(require('path').join(__dirname, '..', 'app', '(tabs)', 'going.tsx'), 'utf8')
    expect(going).toMatch(/useFocusEffect\(\s*useCallback\(\(\) => \{\s*if \(authUser\) void loadInterestedEvents\(\)/)
    expect(going).toMatch(/AppState\.addEventListener\('change', \(state\) => \{\s*if \(state === 'active' && authUser\) void loadInterestedEvents\(\)/)
  })
})


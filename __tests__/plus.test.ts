/**
 * Blendn+ as the app shows it (plan v2 step 11): the server's status, the wait
 * for the webhook after a purchase, what Plus is said to be, and the history
 * row for nights kept behind it.
 */
jest.mock('../lib/apiClient', () => ({ apiClient: { getMyPlus: jest.fn() } }))

/* eslint-disable import/first */
import { apiClient } from '../lib/apiClient'
import {
  ctaLabel,
  ctaParts,
  planSubline,
  defaultPick,
  dockMode,
  GST_LINE,
  grantManageLine,
  storeManageHint,
  taxLine,
  PLUS_COMING_SOON,
  PLUS_FEATURES,
  PLUS_POLL_EVERY_MS,
  plusStatusLine,
  waitForPlus,
} from '../lib/plus'
import { lockedNightsLabel, withLockedNights, type GoingItem } from '../lib/savedEvents'
/* eslint-enable import/first */

const getMyPlus = apiClient.getMyPlus as jest.Mock
const inactive = { success: true, data: { active: false, gated: true, product: null, source: null, expiresAt: null } }
const active = { success: true, data: { active: true, gated: true, product: 'plus', source: 'apple', expiresAt: '2026-11-10T10:00:00.000Z' } }

describe('the status line', () => {
  it('says nothing without Plus; names the product and when it ends', () => {
    expect(plusStatusLine(null)).toBeNull()
    expect(plusStatusLine(inactive.data as never)).toBeNull()
    // The phone's own day and clock (local times), on 23 Oct 2026: the year only when it is not this one (review L6).
    jest.useFakeTimers({ now: new Date(2026, 9, 23, 12) })
    try {
      const local = (...p: [number, number, number, number, number?]) => new Date(...p).toISOString()
      expect(plusStatusLine({ ...active.data, expiresAt: local(2026, 10, 10, 15) } as never)).toBe('Blend’n+ until 10 Nov')
      expect(plusStatusLine({ ...active.data, expiresAt: local(2027, 9, 23, 15) } as never)).toBe('Blend’n+ until 23 Oct 2027')
      // A pass shows its day as well as its time: passes stack, and the hour alone could be any day's (review LOW).
      expect(plusStatusLine({ active: true, gated: true, product: 'night_pass', source: 'grant', expiresAt: local(2026, 9, 24, 4, 30) })).toBe(
        'Night Pass until 24 Oct, 4:30 AM'
      )
    } finally {
      jest.useRealTimers()
    }
    expect(plusStatusLine({ active: true, gated: true, product: 'plus', source: 'grant', expiresAt: null })).toBe('You have Blend’n+')
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
    expect(PLUS_FEATURES.map((f) => f.title)).toEqual(['Stay live while you’re there', 'Your full night history'])
    expect(PLUS_FEATURES.map((f) => f.detail).join(' ').toLowerCase()).not.toContain('coming soon')
    const said = PLUS_FEATURES.map((f) => `${f.title} ${f.detail}`).join(' ').toLowerCase()
    for (const never of ['liked you', 'likes', 'unlimited', 'boost', 'reveal', 'without going live', 'more asks', 'more waves']) {
      expect(said).not.toContain(never)
    }
  })
})

describe('the page\'s own rules', () => {
  const offer = (id: string, price: string) => ({ pkg: { identifier: id }, title: id, length: '', price }) as never
  const monthly = offer('$rc_monthly', '₹199.00')
  const night = offer('night_pass', '₹49.00')

  it('what is promised but not served is only ever the On the way line, never a live feature', () => {
    expect(PLUS_COMING_SOON.map((f) => f.title)).toEqual(['Partner perks', 'Cosmetics', 'Crew extras'])
    expect(PLUS_FEATURES.map((f) => f.title).join(' ')).not.toMatch(/perks|crew/i)
  })

  // D2. Negative control: a GST line for any currency (the old hard-coded footer) fails the USD and mixed cases.
  it('states GST only when every offer is priced in rupees', () => {
    const priced = (currencyCode: string) => ({ pkg: { identifier: 'x', product: { currencyCode } }, title: '', length: '', price: '' }) as never
    expect(taxLine([priced('INR'), priced('INR')])).toBe(GST_LINE)
    expect(taxLine([priced('USD')])).toBeNull()
    expect(taxLine([priced('INR'), priced('CAD')])).toBeNull()
    expect(taxLine([])).toBeNull()
    expect(taxLine(null)).toBeNull()
  })

  it('says what each store can do, and that a grant has nothing to manage (D4)', () => {
    expect(storeManageHint('ios')).toBe('Change plan or cancel · one tap')
    expect(storeManageHint('android')).toBe('Change plan, pause or cancel · one tap')
    expect(grantManageLine(null)).toBe('Free for now · nothing to manage')
  })

  it('savings are the store’s own numbers: the monthly equivalent and the percent against Monthly; none for Monthly', () => {
    const sub = (id: string, price: number, perMonth: number, each: string) =>
      ({ pkg: { identifier: id, product: { price, pricePerMonth: perMonth, pricePerMonthString: each } }, title: id, length: '', price: String(price) }) as never
    const m = sub('$rc_monthly', 199, 199, '₹199')
    const q = sub('$rc_three_month', 499, 166.33, '₹166')
    const y = sub('$rc_annual', 1499, 124.92, '₹125')
    const all = [m, q, y]
    expect(planSubline(m, all)).toBeNull()
    expect(planSubline(q, all)).toBe('About ₹166 a month · Save\u00A016%')
    expect(planSubline(y, all)).toBe('About ₹125 a month · Save\u00A037%')
    // The store does not say it saves: no "Save".
    expect(planSubline(sub('$rc_three_month', 600, 200, '₹200'), all)).toBe('About ₹200 a month')
    // No monthly figure from the store: no line at all.
    expect(planSubline(sub('$rc_annual', 1499, 124.92, ''), all)).toBeNull()
    expect(planSubline(sub('night_pass', 49, 49, '₹49'), all)).toBeNull()
  })

  it('the dock’s price is split out for Geist Mono, and the whole is still what is read', () => {
    expect(ctaParts(monthly)).toEqual({ lead: 'Start Blend’n+ —', price: { amount: '₹199.00', per: '/ month' }, spoken: 'Start Blend’n+ — ₹199.00 / month' })
    expect(ctaParts(night)).toEqual({ lead: 'Get the Night Pass —', price: { amount: '₹49.00', per: undefined }, spoken: 'Get the Night Pass — ₹49.00' })
  })

  it('Monthly is picked first; the Night Pass only when it is all there is; nothing, when nothing is sold', () => {
    expect(defaultPick([night, monthly])).toBe('$rc_monthly')
    expect(defaultPick([night])).toBe('night_pass')
    expect(defaultPick([])).toBeNull()
  })

  it('the dock button carries the price of what is picked, in the store\'s string', () => {
    expect(ctaLabel(monthly)).toBe('Start Blend’n+ — ₹199.00 / month')
    expect(ctaLabel(night)).toBe('Get the Night Pass — ₹49.00')
    expect(ctaLabel(undefined)).toBe('Start Blend’n+')
  })

  it('only a subscription the stores run is managed in the store; a grant and a pass keep the buy button', () => {
    const at = (product: 'plus' | 'night_pass' | null, source: 'apple' | 'google' | 'grant' | null, active = true) =>
      dockMode({ active, gated: true, product, source, expiresAt: null })
    expect(at('plus', 'apple')).toBe('manage')
    expect(at('plus', 'google')).toBe('manage')
    expect(at('plus', 'grant')).toBe('buy')
    expect(at('night_pass', 'google')).toBe('buy')
    expect(at('plus', 'apple', false)).toBe('buy')
    expect(dockMode(null)).toBe('buy')
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

  it('"{n} more nights with Blend’n+"', () => {
    expect(lockedNightsLabel(4)).toBe('4 more nights with Blend’n+')
    expect(lockedNightsLabel(1)).toBe('1 more night with Blend’n+')
  })
})

describe('Going re-reads when the app comes back (review MEDIUM: a pending payment confirmed while away)', () => {
  it('reloads on focus and on AppState active', () => {
    const going = require('fs').readFileSync(require('path').join(__dirname, '..', 'app', '(tabs)', 'going.tsx'), 'utf8')
    expect(going).toMatch(/useFocusEffect\(\s*useCallback\(\(\) => \{\s*if \(authUser\) void loadInterestedEvents\(\)/)
    expect(going).toMatch(/AppState\.addEventListener\('change', \(state\) => \{\s*if \(state === 'active' && authUser\) void loadInterestedEvents\(\)/)
  })
})


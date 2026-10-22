/**
 * Manage's card for every status (Flow 12 · 12.3, R4.1 12.2 · 12.3). The server describes today:
 * active or not, the product, where it was bought, until when; `state` and `grant` are read
 * when they come and never guessed. Dates are written out as fixtures, not computed.
 *
 * Negative controls (the client keeps no registry): letting a grant of unknown kind through as
 * `trial` fails "a gift we cannot tell apart is not called a trial"; dropping the `gated` test
 * from the launch branch fails "nothing to manage for somebody who never had it".
 */
import { hasSomethingToManage, manageCard, shortDate, startsAgain } from '../lib/plusManage'
import type { PlusStatus } from '../lib/plus'

const NOW = Date.parse('2026-10-22T12:00:00')
const base: PlusStatus = { active: true, gated: true, product: 'plus', source: 'google', expiresAt: '2026-11-03T12:00:00' }
const card = (patch: Partial<PlusStatus>, store: 'ios' | 'android' = 'android') => manageCard({ ...base, ...patch }, store, NOW)

describe('short dates', () => {
  it('"3 Nov" this year, with the year in another', () => {
    expect(shortDate('2026-11-03T12:00:00', NOW)).toMatch(/3\s*Nov|Nov\s*3/)
    expect(shortDate('2027-02-03T12:00:00', NOW)).toMatch(/2027/)
    expect(shortDate(null, NOW)).toBeNull()
    expect(shortDate('nope', NOW)).toBeNull()
  })
})

describe('what the server says today', () => {
  it('a subscription is active, with its renewal date and the store it was bought in', () => {
    expect(card({})).toEqual({ status: 'active', sentence: expect.stringMatching(/^Renews .*Nov.* · Google Play$/) })
    expect(card({ source: 'apple' })?.sentence).toMatch(/ · App Store$/)
  })

  it('a subscription with no date still says it is on', () => {
    expect(card({ expiresAt: null, source: null })).toEqual({ status: 'active', sentence: 'Blend’n+ is on' })
  })

  it('a Night Pass says until when, that it doesn’t renew, and that another adds 24 hours', () => {
    const c = card({ product: 'night_pass', source: 'google', expiresAt: '2026-10-23T21:42:00' })
    expect(c?.status).toBe('night')
    expect(c?.sentence).toMatch(/^Until .*Oct.*\. It doesn’t renew; another one adds 24 hours\.$/)
  })

  it('a gift we cannot tell apart is not called a trial: until its date, nothing renews', () => {
    const c = card({ source: 'grant', expiresAt: '2026-10-29T12:00:00' })
    expect(c?.status).toBe('active')
    expect(c?.sentence).toMatch(/^Blend’n\+ until .*29.* · nothing renews$/)
  })

  it('a launch season: free for everybody, nothing renews', () => {
    expect(manageCard({ active: false, gated: false, product: null, source: null, expiresAt: null }, 'ios', NOW)).toEqual({
      status: 'launch',
      sentence: 'Everything’s unlocked in your city for now. Nothing to pay, nothing renews.',
    })
  })

  it('nothing to manage for somebody who never had it, or has not loaded', () => {
    expect(manageCard({ active: false, gated: true, product: null, source: null, expiresAt: null }, 'ios', NOW)).toBeNull()
    expect(manageCard(null, 'ios', NOW)).toBeNull()
    expect(manageCard(undefined, 'ios', NOW)).toBeNull()
    expect(hasSomethingToManage({ active: false, gated: true, product: null, source: null, expiresAt: null })).toBe(false)
    expect(hasSomethingToManage(base)).toBe(true)
  })
})

describe('what it will say when the server sends `state` and `grant`', () => {
  it.each([
    ['cancelled', /^You keep Blend’n\+ until .*Nov.*\. Nothing renews after that\.$/],
    ['grace', /^You still have Blend’n\+\. Fix it in Google Play to keep Blend’n\+ after .*Nov.*\.$/],
    ['hold', /^Blend’n\+ is paused until the payment is fixed in Google Play\.$/],
    ['paused', /^You paused Blend’n\+ in Google Play\.$/],
  ] as const)('%s', (state, sentence) => {
    expect(card({ state })).toEqual({ status: state, sentence: expect.stringMatching(sentence) })
  })

  it('names the App Store on iOS', () => {
    expect(card({ state: 'grace' }, 'ios')?.sentence).toContain('Fix it in the App Store')
  })

  it('a trial and a referral month say which, and that nothing renews', () => {
    expect(card({ source: 'grant', grant: 'trial', expiresAt: '2026-10-29T12:00:00' })?.status).toBe('trial')
    const referral = card({ source: 'grant', grant: 'referral', expiresAt: '2026-11-04T12:00:00' })
    expect(referral?.status).toBe('referral')
    expect(referral?.sentence).toMatch(/^Your referral month runs until .*4.*\. Nothing renews unless you choose a plan\.$/)
  })

  it('ended and refunded are said without blame, and are the two that sell again', () => {
    const expired = manageCard({ active: false, gated: true, product: null, source: null, expiresAt: '2026-11-03T12:00:00', state: 'expired' }, 'ios', NOW)
    expect(expired?.sentence).toMatch(/^It ended .*Nov.*\. Everything you had is still yours to see; the extras are locked\.$/)
    const refunded = manageCard({ active: false, gated: true, product: null, source: null, expiresAt: null, state: 'refunded' }, 'ios', NOW)
    expect(refunded?.sentence).toBe('The store refunded this, so Blend’n+ is off. You can start again anytime.')
    expect(startsAgain('expired')).toBe(true)
    expect(startsAgain('refunded')).toBe(true)
    for (const s of ['active', 'cancelled', 'grace', 'hold', 'paused', 'trial', 'night', 'launch', 'referral'] as const) expect(startsAgain(s)).toBe(false)
  })
})

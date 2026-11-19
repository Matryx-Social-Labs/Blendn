import type { PlusStatus } from '../lib/plus'
import { plusRowLine, showsPlus } from '../lib/mePlus'

const status = (over: Partial<PlusStatus> = {}): PlusStatus => ({ active: false, gated: true, product: null, source: null, expiresAt: null, ...over })

describe('the line under Blend’n+ on Me and in Settings (D23: one helper)', () => {
  it('not loaded yet: nothing, never a guess', () => {
    expect(plusRowLine(null, '₹199', 'ios')).toBe(null)
  })

  // D-LM14: three surfaces said three things. Negative control: the old "₹199 a month" / nothing fails it.
  it('never subscribed: "from" the store’s price once it has answered, "See plans" while it is silent', () => {
    expect(plusRowLine(status(), '₹199', 'ios')).toBe('from ₹199 a month')
    expect(plusRowLine(status(), null, 'ios')).toBe('See plans')
  })

  // D-L25: "Blend’n+ / Blend’n+ until 23 Oct 2027" said the name twice. Negative control: the card's sentence fails it.
  it('a gift of ours says it is active and until when, without the name again', () => {
    expect(plusRowLine(status({ active: true, product: 'plus', source: 'grant', expiresAt: '2027-10-23T12:00:00Z' }), null, 'ios')).toBe('Active until 23 Oct 2027')
    expect(plusRowLine(status({ active: true, product: 'plus', source: 'grant' }), null, 'ios')).toBe('Active for now')
  })


  it('a subscription: the renewal, and where it was bought', () => {
    const line = plusRowLine(status({ active: true, product: 'plus', source: 'apple', state: 'active', expiresAt: '2099-01-03T00:00:00Z' }), '₹199', 'ios')
    expect(line).toBe('Renews 3 Jan 2099 · App Store')
  })

  it('a pass says it does not renew; a payment on hold says so, never the price', () => {
    expect(plusRowLine(status({ active: true, product: 'night_pass', source: 'google', expiresAt: '2099-01-03T22:00:00Z' }), '₹199', 'android')).toMatch(/doesn’t renew/)
    expect(plusRowLine(status({ active: false, state: 'hold', source: 'google' }), '₹199', 'android')).toMatch(/payment is fixed in Google Play/)
  })
})

/*
 * Owner ruling 2026-11-18: "keep the app completely free to use for the client app users". Blend'n+ shows on Me and in
 * Settings only where the server says it is sold (`gated`, staging); prod's PLUS_GATING is unset, so nobody sees it there.
 */
describe('where Blend’n+ shows at all', () => {
  it('only in a gated city', () => {
    expect(showsPlus(status({ gated: true }))).toBe(true)
  })

  it.each([
    ['an ungated city', status({ gated: false })],
    ['an ungated city with a grant of ours', status({ gated: false, active: true, product: 'plus', source: 'grant' })],
    ['not loaded', null],
  ] as const)('never in %s', (_name, s) => {
    expect(showsPlus(s)).toBe(false)
  })
})

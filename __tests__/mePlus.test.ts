import type { PlusStatus } from '../lib/plus'
import { plusRowLine } from '../lib/mePlus'

const status = (over: Partial<PlusStatus> = {}): PlusStatus => ({ active: false, gated: true, product: null, source: null, expiresAt: null, ...over })

describe('the line under Blend’n+ on Me and in Settings (D23: one helper)', () => {
  it('not loaded yet: nothing, never a guess', () => {
    expect(plusRowLine(null, '₹199', 'ios')).toEqual({ hint: null, free: false })
  })

  // D-LM14: three surfaces said three things. Negative control: the old "₹199 a month" / nothing fails it.
  it('never subscribed: "from" the store’s price once it has answered, "See plans" while it is silent', () => {
    expect(plusRowLine(status(), '₹199', 'ios')).toEqual({ hint: 'from ₹199 a month', free: false })
    expect(plusRowLine(status(), null, 'ios')).toEqual({ hint: 'See plans', free: false })
  })

  // D-L25: "Blend’n+ / Blend’n+ until 23 Oct 2027" said the name twice. Negative control: the card's sentence fails it.
  it('a gift of ours says it is active and until when, without the name again', () => {
    expect(plusRowLine(status({ active: true, product: 'plus', source: 'grant', expiresAt: '2027-10-23T12:00:00Z' }), null, 'ios').hint).toBe('Active until 23 Oct 2027')
    expect(plusRowLine(status({ active: true, product: 'plus', source: 'grant' }), null, 'ios').hint).toBe('Active for now')
  })

  it('a launch season (not for sale here): free, and the row opens the sheet that says so, with no price drawn', () => {
    expect(plusRowLine(status({ gated: false }), '₹199', 'ios')).toEqual({ hint: 'Free during launch in your city', free: true })
  })

  it('a subscription: the renewal, and where it was bought', () => {
    const line = plusRowLine(status({ active: true, product: 'plus', source: 'apple', state: 'active', expiresAt: '2099-01-03T00:00:00Z' }), '₹199', 'ios')
    expect(line.hint).toBe('Renews 3 Jan 2099 · App Store')
    expect(line.free).toBe(false)
  })

  it('a pass says it does not renew; a payment on hold says so, never the price', () => {
    expect(plusRowLine(status({ active: true, product: 'night_pass', source: 'google', expiresAt: '2099-01-03T22:00:00Z' }), '₹199', 'android').hint).toMatch(/doesn’t renew/)
    expect(plusRowLine(status({ active: false, state: 'hold', source: 'google' }), '₹199', 'android').hint).toMatch(/payment is fixed in Google Play/)
  })
})

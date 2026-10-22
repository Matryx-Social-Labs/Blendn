import type { PlusStatus } from '../lib/plus'
import { mePlusLine } from '../lib/mePlus'

const status = (over: Partial<PlusStatus> = {}): PlusStatus => ({ active: false, gated: true, product: null, source: null, expiresAt: null, ...over })

describe('the line under Blend’n+ on Me', () => {
  it('not loaded yet: nothing, never a guess', () => {
    expect(mePlusLine(null, '₹199', 'ios')).toEqual({ hint: null, free: false })
  })

  it('never subscribed: the store’s price, once it has answered, and nothing before', () => {
    expect(mePlusLine(status(), '₹199', 'ios')).toEqual({ hint: '₹199 a month', free: false })
    expect(mePlusLine(status(), null, 'ios')).toEqual({ hint: null, free: false })
  })

  it('a launch season (not for sale here): free, and the row opens the sheet that says so, with no price drawn', () => {
    expect(mePlusLine(status({ gated: false }), '₹199', 'ios')).toEqual({ hint: 'Free during launch in your city', free: true })
  })

  it('a subscription: the renewal, and where it was bought', () => {
    const line = mePlusLine(status({ active: true, product: 'plus', source: 'apple', state: 'active', expiresAt: '2099-01-03T00:00:00Z' }), '₹199', 'ios')
    expect(line.hint).toBe('Renews 3 Jan 2099 · App Store')
    expect(line.free).toBe(false)
  })

  it('a pass says it does not renew; a payment on hold says so, never the price', () => {
    expect(mePlusLine(status({ active: true, product: 'night_pass', source: 'google', expiresAt: '2099-01-03T22:00:00Z' }), '₹199', 'android').hint).toMatch(/doesn’t renew/)
    expect(mePlusLine(status({ active: false, state: 'hold', source: 'google' }), '₹199', 'android').hint).toMatch(/payment is fixed in Google Play/)
  })
})

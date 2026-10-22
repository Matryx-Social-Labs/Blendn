/**
 * The Tonight sheet's decisions (Flow 12 · 12.1), pure. The mapping to a paywall
 * trigger is written out as literals: the cooldowns and the server's analytics are
 * per trigger, so a drift here must fail this file, not move it.
 *
 * Negative controls (the client keeps no registry; recorded here and in the commit):
 * mapping `night` to `profile` fails "the earlier nights count as recap"; dropping the
 * `typeof price === 'number'` guard in `lowestPrice` fails "ignores a package with no number".
 */
import { PURCHASES_ERROR_CODE } from 'react-native-purchases'

import { PAYWALL_TRIGGERS } from '../lib/paywallPolicy'
import { NIGHT_PASS_ID, purchaseFailure, type PlusOffer } from '../lib/purchases'
import { GENERIC_FAILURE, goesLiveWhenUnlocked, isGenericFailure, lowestPrice, paywallTriggerFor, purchasedToast, tonightOffers } from '../lib/tonight'

const offer = (identifier: string, price: unknown, priceString: string) => ({ pkg: { identifier, product: { price, priceString } }, title: '', length: '', price: priceString }) as unknown as PlusOffer

describe('which paywall trigger the sheet counts as', () => {
  it.each([
    ['stay', 'go_live_expiry'],
    ['expiry', 'go_live_expiry'],
    ['night', 'recap'],
    ['perk', 'perk'],
  ] as const)('%s counts as %s', (trigger, expected) => {
    expect(paywallTriggerFor(trigger)).toBe(expected)
    expect(PAYWALL_TRIGGERS).toContain(expected)
  })
})

describe('what it sells', () => {
  const night = offer(NIGHT_PASS_ID, 49, '₹49')
  const monthly = offer('$rc_monthly', 199, '₹199')
  const yearly = offer('$rc_annual', 1499, '₹1,499')

  it('the Night Pass and Monthly, at the store’s strings; either missing is nothing to sell', () => {
    expect(tonightOffers([yearly, monthly, night])).toEqual({ night, monthly })
    expect(tonightOffers([monthly, yearly])).toBeNull()
    expect(tonightOffers([night])).toBeNull()
    expect(tonightOffers([])).toBeNull()
    expect(tonightOffers(null)).toBeNull()
    expect(tonightOffers(undefined)).toBeNull()
  })

  it('"from" is the store’s string for the least anyone would pay', () => {
    expect(lowestPrice([monthly, night, yearly])).toBe('₹49')
    expect(lowestPrice([yearly, monthly])).toBe('₹199')
    expect(lowestPrice([])).toBeNull()
    expect(lowestPrice(null)).toBeNull()
  })

  it('ignores a package with no number', () => {
    expect(lowestPrice([offer('$rc_monthly', undefined, '₹?'), yearly])).toBe('₹1,499')
    expect(lowestPrice([offer('$rc_monthly', Number.NaN, '₹?')])).toBeNull()
  })
})

describe('what it says after', () => {
  it('a purchase names what was bought; the Night Pass says 24 hours', () => {
    expect(purchasedToast('night')).toBe('Blend’n+ · Night Pass · 24 hours')
    expect(purchasedToast('monthly')).toBe('Blend’n+ · Monthly')
  })

  it('only a stay-shaped lock goes live by itself once it is unlocked', () => {
    expect(goesLiveWhenUnlocked('stay')).toBe(true)
    expect(goesLiveWhenUnlocked('expiry')).toBe(true)
    expect(goesLiveWhenUnlocked('night')).toBe(false)
    expect(goesLiveWhenUnlocked('perk')).toBe(false)
  })

  it('a generic failure is the store layer’s own default sentence, and no other', () => {
    expect(GENERIC_FAILURE).toBe(purchaseFailure(undefined).message)
    expect(isGenericFailure(purchaseFailure(undefined).message)).toBe(true)
    expect(isGenericFailure(purchaseFailure(PURCHASES_ERROR_CODE.NETWORK_ERROR).message)).toBe(false)
    expect(isGenericFailure(purchaseFailure(PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR).message)).toBe(false)
  })
})

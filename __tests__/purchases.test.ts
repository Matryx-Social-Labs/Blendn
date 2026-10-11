/**
 * RevenueCat on the app (plan v2 step 11): it buys as our user and nobody
 * else, it is off without a key, and nothing it says unlocks anything. The
 * SDK is the global mock in `jest.setup.js`; each test drives the calls.
 */
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))

type Mod = typeof import('../lib/purchases')
type RC = { [k: string]: jest.Mock }

/** A fresh module (it holds whether RevenueCat is configured) and the SDK mock it talks to. */
function load(appleKey: string | null = 'appl_public'): { m: Mod; rc: RC } {
  if (appleKey === null) delete process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY
  else process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY = appleKey
  let m!: Mod
  let rc!: RC
  jest.isolateModules(() => {
    m = require('../lib/purchases')
    rc = require('react-native-purchases').default
  })
  return { m, rc }
}

const pkg = (identifier: string, priceString: string) => ({ identifier, product: { priceString } }) as never

afterAll(() => {
  delete process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY
})

describe('the key', () => {
  it('takes only the platform\'s public SDK key — never an sk_ secret, never the other platform\'s', () => {
    expect(load().m.revenueCatKey('ios', 'appl_abc', 'goog_xyz')).toBe('appl_abc')
    const { m } = load()
    expect(m.revenueCatKey('android', 'appl_abc', 'goog_xyz')).toBe('goog_xyz')
    expect(m.revenueCatKey('ios', 'sk_secret', undefined)).toBeNull()
    expect(m.revenueCatKey('ios', 'goog_xyz', undefined)).toBeNull()
    expect(m.revenueCatKey('ios', '  ', undefined)).toBeNull()
    expect(m.revenueCatKey('web', 'appl_abc', 'goog_xyz')).toBeNull()
  })

  it('unset: never configured, nothing to sell, no buying, the store page for Manage', async () => {
    const { m, rc } = load(null)
    expect(m.purchasesAvailable()).toBe(false)
    await m.syncPurchasesUser('u1')
    expect(rc.configure).not.toHaveBeenCalled()
    expect(await m.canBuyAs('u1')).toBe(false)
    expect(await m.loadPlusOffers()).toEqual([])
    expect(await m.restore('u1')).toEqual({ kind: 'failed', message: "Purchases aren't available yet." })
    expect(await m.manageSubscriptionUrl('ios')).toBe('https://apps.apple.com/account/subscriptions')
    expect(await m.manageSubscriptionUrl('android')).toBe(
      'https://play.google.com/store/account/subscriptions?package=com.matryxsociallabs.blendn'
    )
  })
})

describe('RevenueCat follows the account', () => {
  it('configures as the first account (no anonymous id), then logs in and out as it changes', async () => {
    const { m, rc } = load()
    await m.syncPurchasesUser(null)
    expect(rc.configure).not.toHaveBeenCalled()

    await m.syncPurchasesUser('u1')
    // No device identifiers for attribution (review LOW: App Privacy, Data safety).
    expect(rc.configure).toHaveBeenCalledWith({ apiKey: 'appl_public', appUserID: 'u1', automaticDeviceIdentifierCollectionEnabled: false })

    await m.syncPurchasesUser('u2')
    expect(rc.logIn).toHaveBeenCalledWith('u2')

    rc.isAnonymous.mockResolvedValueOnce(false)
    await m.syncPurchasesUser(null)
    expect(rc.logOut).toHaveBeenCalledTimes(1)
  })

  it('skips logOut for an anonymous user (it throws there)', async () => {
    const { m, rc } = load()
    await m.syncPurchasesUser('u1')
    rc.isAnonymous.mockResolvedValueOnce(true)
    await m.syncPurchasesUser(null)
    expect(rc.logOut).not.toHaveBeenCalled()
  })

  it('in order: a sign-out queued behind a slow sign-in lands after it', async () => {
    const { m, rc } = load()
    await m.syncPurchasesUser('u1')
    const order: string[] = []
    rc.logIn.mockImplementationOnce(async () => { await new Promise((r) => setTimeout(r, 5)); order.push('in') })
    rc.isAnonymous.mockResolvedValueOnce(false)
    rc.logOut.mockImplementationOnce(async () => { order.push('out') })
    void m.syncPurchasesUser('u2')
    await m.syncPurchasesUser(null)
    expect(order).toEqual(['in', 'out'])
  })

  it('a failing SDK never throws into sign-in', async () => {
    const { m, rc } = load()
    await m.syncPurchasesUser('u1')
    rc.logIn.mockRejectedValueOnce(new Error('network'))
    await expect(m.syncPurchasesUser('u2')).resolves.toBeUndefined()
  })
})

describe('never buy anonymously (canBuyAs)', () => {
  it('true only when RevenueCat\'s current user IS this account', async () => {
    const { m, rc } = load()
    await m.syncPurchasesUser('u1')
    rc.getAppUserID.mockResolvedValueOnce('u1')
    expect(await m.canBuyAs('u1')).toBe(true)
    rc.getAppUserID.mockResolvedValueOnce('$RCAnonymousID:abc')
    expect(await m.canBuyAs('u1')).toBe(false)
    rc.getAppUserID.mockResolvedValueOnce('u2')
    expect(await m.canBuyAs('u1')).toBe(false)
    expect(await m.canBuyAs(null)).toBe(false)
  })

  it('a mismatch gets one more logIn before the answer (review MEDIUM)', async () => {
    const { m, rc } = load()
    await m.syncPurchasesUser('u1')
    rc.logIn.mockClear()
    rc.getAppUserID.mockResolvedValueOnce('$RCAnonymousID:abc').mockResolvedValueOnce('u1')
    expect(await m.canBuyAs('u1')).toBe(true)
    expect(rc.logIn).toHaveBeenCalledWith('u1')
  })

  it('false before RevenueCat is configured', async () => {
    const { m, rc } = load()
    rc.getAppUserID.mockResolvedValueOnce('u1')
    expect(await m.canBuyAs('u1')).toBe(false)
  })
})

describe('what is sold', () => {
  it('our four packages in our order, at the store\'s own price strings; anything else is left out', () => {
    const { m } = load()
    const offers = m.plusOffers([
      pkg('night_pass', '₹49.00'),
      pkg('$rc_annual', '₹1,499.00'),
      pkg('$rc_lifetime', '₹9,999.00'),
      pkg('$rc_monthly', '₹199.00'),
      pkg('$rc_three_month', '₹499.00'),
    ])
    expect(offers.map((o) => [o.title, o.length, o.price])).toEqual([
      ['Blendn+ · Monthly', '1 month, renews monthly', '₹199.00'],
      ['Blendn+ · 3 months', '3 months, renews every 3 months', '₹499.00'],
      ['Blendn+ · Yearly', '1 year, renews yearly', '₹1,499.00'],
      ['Night Pass · 24 hours', '24 hours, does not renew', '₹49.00'],
    ])
  })

  it('reads the current offering, falling back to "default"', async () => {
    const { m, rc } = load()
    await m.syncPurchasesUser('u1')
    rc.getOfferings.mockResolvedValueOnce({ current: null, all: { default: { availablePackages: [pkg('$rc_monthly', '₹199.00')] } } })
    expect((await m.loadPlusOffers())!.map((o) => o.price)).toEqual(['₹199.00'])
  })

  it('null when the store cannot be reached ("Couldn\'t load prices"), not an empty shelf', async () => {
    const { m, rc } = load()
    await m.syncPurchasesUser('u1')
    rc.getOfferings.mockRejectedValueOnce(new Error('offline'))
    expect(await m.loadPlusOffers()).toBeNull()
  })
})

describe('buying and restoring say what happened, nothing more', () => {
  /** Configured and signed in as u1, as at a real purchase. */
  const asU1 = async () => {
    const loaded = load()
    await loaded.m.syncPurchasesUser('u1')
    loaded.rc.getAppUserID.mockResolvedValue('u1')
    return loaded
  }

  it('purchased · cancelled (by its code) · pending (UPI, Ask to Buy) · failed', async () => {
    const { m, rc } = await asU1()
    rc.purchasePackage.mockResolvedValueOnce({})
    expect(await m.buyPackage(pkg('$rc_monthly', 'x'), 'u1')).toEqual({ kind: 'purchased' })
    rc.purchasePackage.mockRejectedValueOnce({ userCancelled: null, code: '1' })
    expect(await m.buyPackage(pkg('$rc_monthly', 'x'), 'u1')).toEqual({ kind: 'cancelled' })
    rc.purchasePackage.mockRejectedValueOnce({ userCancelled: false, code: '20' })
    expect(await m.buyPackage(pkg('$rc_monthly', 'x'), 'u1')).toEqual({ kind: 'pending' })
    rc.purchasePackage.mockRejectedValueOnce({ userCancelled: false, code: '2' })
    expect((await m.buyPackage(pkg('$rc_monthly', 'x'), 'u1')).kind).toBe('failed')
  })

  it.each([
    ['6', /already have this/, true],
    ['7', /belongs to another Blendn account/, undefined],
    ['3', /aren't allowed on this device/, undefined],
    ['10', /No connection/, undefined],
  ])('says what code %s means (review MEDIUM)', async (code, words, manage) => {
    const { m, rc } = await asU1()
    rc.purchasePackage.mockRejectedValueOnce({ userCancelled: false, code })
    const out = await m.buyPackage(pkg('$rc_monthly', 'x'), 'u1')
    expect(out).toMatchObject({ kind: 'failed', message: expect.stringMatching(words) })
    expect((out as { manage?: boolean }).manage).toBe(manage)
  })

  it('asks again at the purchase who RevenueCat thinks is buying, and buys nothing as someone else', async () => {
    const { m, rc } = await asU1()
    rc.getAppUserID.mockResolvedValue('u2')
    expect((await m.buyPackage(pkg('$rc_monthly', 'x'), 'u1')).kind).toBe('failed')
    expect((await m.restore('u1')).kind).toBe('failed')
    expect(rc.purchasePackage).not.toHaveBeenCalled()
    expect(rc.restorePurchases).not.toHaveBeenCalled()
  })

  it('restore: "nothing" when the store account has nothing active', async () => {
    const { m, rc } = await asU1()
    expect(await m.restore('u1')).toEqual({ kind: 'nothing' })
    rc.restorePurchases.mockResolvedValueOnce({ entitlements: { active: { plus: {} } }, activeSubscriptions: ['plus_monthly'] })
    expect(await m.restore('u1')).toEqual({ kind: 'restored' })
  })

  it('Manage: RevenueCat\'s management URL when it is a store\'s own page — anything else is ignored (review LOW)', async () => {
    const { m, rc } = load()
    await m.syncPurchasesUser('u1')
    rc.getCustomerInfo.mockResolvedValueOnce({ managementURL: 'https://apps.apple.com/account/subscriptions?x=1' })
    expect(await m.manageSubscriptionUrl('ios')).toBe('https://apps.apple.com/account/subscriptions?x=1')
    for (const url of ['https://evil.example/apps.apple.com', 'http://apps.apple.com/account', 'javascript:alert(1)']) {
      rc.getCustomerInfo.mockResolvedValueOnce({ managementURL: url })
      expect(await m.manageSubscriptionUrl('ios')).toBe('https://apps.apple.com/account/subscriptions')
    }
  })
})

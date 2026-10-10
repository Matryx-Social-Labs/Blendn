import { Platform } from 'react-native'
import Purchases, { PURCHASES_ERROR_CODE, type CustomerInfo, type PurchasesPackage } from 'react-native-purchases'

import { Logger } from './logger'

/**
 * RevenueCat, for Blendn+ (plan v2 step 11, §5). The store sells; the server
 * decides. Nothing here unlocks anything: the RevenueCat webhook writes the
 * entitlement on the server, and every gate reads it there (`GET /me/plus`).
 *
 * - **Who buys is our user id.** RevenueCat's `app_user_id` is the account's
 *   id — the webhook takes the person from it and nothing else — so the app
 *   logs in right after sign-in or a restored session and out at sign-out
 *   (`syncPurchasesUser`, called from `lib/useAuth.ts`), and the buy buttons
 *   stay off unless RevenueCat's current id IS that account (`canBuyAs`).
 *   Never anonymously: an anonymous purchase names nobody we know.
 * - **No key, no purchases.** The public SDK keys
 *   (`EXPO_PUBLIC_REVENUECAT_APPLE_KEY` `appl_…`, `EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY`
 *   `goog_…`) unset or of the wrong shape: the SDK is never configured, the
 *   paywall still opens and says purchases aren't available yet.
 * - **The stores only**: no other payment provider, no web checkout (App
 *   Store 3.1.1; MN-G03, `__tests__/paywallGuards.test.ts`).
 */

/** The public SDK key for this platform, or null: unset, or not the platform's shape (never an `sk_` secret). */
export function revenueCatKey(
  os: string = Platform.OS,
  apple: string | undefined = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY,
  google: string | undefined = process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY
): string | null {
  const [key, prefix] = os === 'ios' ? [apple, 'appl_'] : os === 'android' ? [google, 'goog_'] : [undefined, '']
  const trimmed = key?.trim()
  return trimmed && trimmed.startsWith(prefix) ? trimmed : null
}

export function purchasesAvailable(): boolean {
  return revenueCatKey() !== null
}

let configured = false
/** One sync at a time, in order: a sign-out racing a sign-in must not land first. */
let syncChain: Promise<void> = Promise.resolve()

/**
 * RevenueCat follows the signed-in account. Configured on the first account
 * (as that account, so no anonymous id is ever made for it), then `logIn` /
 * `logOut` as the account changes. `logOut` throws on an anonymous user, so it
 * is skipped then. Never throws.
 */
export function syncPurchasesUser(userId: string | null): Promise<void> {
  syncChain = syncChain.then(() => applyUser(userId))
  return syncChain
}

async function applyUser(userId: string | null): Promise<void> {
  const key = revenueCatKey()
  if (!key) return
  try {
    if (!configured) {
      // Nobody signed in and never configured: there is no one to forget.
      if (!userId) return
      Purchases.configure({ apiKey: key, appUserID: userId })
      configured = true
      return
    }
    if (userId) {
      await Purchases.logIn(userId)
    } else if (!(await Purchases.isAnonymous())) {
      await Purchases.logOut()
    }
  } catch (error) {
    Logger.warn('plus', 'RevenueCat could not follow the account', { error: String(error) })
  }
}

/** True only when RevenueCat is configured AND its current user is this account. */
export async function canBuyAs(userId: string | null | undefined): Promise<boolean> {
  if (!userId || !configured) return false
  try {
    await syncChain
    return (await Purchases.getAppUserID()) === userId
  } catch {
    return false
  }
}

/** The packages the paywall sells, in this order. Anything else in the offering is not shown. */
export const PLUS_PACKAGES = [
  { id: '$rc_monthly', title: 'Blendn+ · Monthly', length: '1 month, renews monthly' },
  { id: '$rc_three_month', title: 'Blendn+ · 3 months', length: '3 months, renews every 3 months' },
  { id: '$rc_annual', title: 'Blendn+ · Yearly', length: '1 year, renews yearly' },
  { id: 'night_pass', title: 'Night Pass · 24 hours', length: '24 hours, does not renew' },
] as const

export type PlusOffer = { pkg: PurchasesPackage; title: string; length: string; price: string }

/** The current offering's packages we sell, priced by the store. Empty when purchases are off or the store has none. */
export async function loadPlusOffers(): Promise<PlusOffer[]> {
  if (!configured) return []
  try {
    const offerings = await Purchases.getOfferings()
    return plusOffers((offerings.current ?? offerings.all.default)?.availablePackages ?? [])
  } catch (error) {
    Logger.warn('plus', 'Could not load the offering', { error: String(error) })
    return []
  }
}

/** Ours, in our order, each with the store's own price string — never a price written here. */
export function plusOffers(packages: readonly PurchasesPackage[]): PlusOffer[] {
  return PLUS_PACKAGES.flatMap(({ id, title, length }) => {
    const pkg = packages.find((p) => p.identifier === id)
    return pkg ? [{ pkg, title, length, price: pkg.product.priceString }] : []
  })
}

/**
 * `pending`: the store took the order and the payment is not through yet — a
 * UPI approval, Ask to Buy. It unlocks when the store confirms, like a purchase.
 */
export type PurchaseOutcome = { kind: 'purchased' } | { kind: 'pending' } | { kind: 'cancelled' } | { kind: 'failed'; message: string }

export async function buyPackage(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  try {
    await Purchases.purchasePackage(pkg)
    return { kind: 'purchased' }
  } catch (error) {
    const e = error as { userCancelled?: boolean | null; code?: string }
    if (e?.userCancelled) return { kind: 'cancelled' }
    if (e?.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return { kind: 'pending' }
    Logger.warn('plus', 'Purchase failed', { code: e?.code })
    return { kind: 'failed', message: "The purchase didn't go through. Try again." }
  }
}

export type RestoreOutcome = { kind: 'restored' } | { kind: 'nothing' } | { kind: 'failed'; message: string }

/**
 * Restore asks the store for what this store account bought. Whether it found
 * anything decides only what is said; what unlocks is the server's, once the
 * store tells RevenueCat and RevenueCat tells the server.
 */
export async function restore(): Promise<RestoreOutcome> {
  if (!configured) return { kind: 'failed', message: "Purchases aren't available yet." }
  try {
    const info = await Purchases.restorePurchases()
    return hasSomethingActive(info) ? { kind: 'restored' } : { kind: 'nothing' }
  } catch (error) {
    Logger.warn('plus', 'Restore failed', { code: (error as { code?: string })?.code })
    return { kind: 'failed', message: "Couldn't reach the store. Try again." }
  }
}

function hasSomethingActive(info: CustomerInfo): boolean {
  return Object.keys(info.entitlements.active).length > 0 || info.activeSubscriptions.length > 0
}

const STORE_SUBSCRIPTIONS = {
  ios: 'https://apps.apple.com/account/subscriptions',
  android: 'https://play.google.com/store/account/subscriptions?package=com.matryxsociallabs.blendn',
} as const

/** Where "Manage subscription" goes: RevenueCat's management URL when it has one, else the store's page. */
export async function manageSubscriptionUrl(os: string = Platform.OS): Promise<string> {
  const fallback = os === 'android' ? STORE_SUBSCRIPTIONS.android : STORE_SUBSCRIPTIONS.ios
  if (!configured) return fallback
  try {
    return (await Purchases.getCustomerInfo()).managementURL ?? fallback
  } catch {
    return fallback
  }
}

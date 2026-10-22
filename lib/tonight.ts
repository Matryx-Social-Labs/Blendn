import type { TonightPick, TonightTrigger } from '../components/ds/TonightSheet'
import type { PaywallTrigger } from './paywallPolicy'
import { NIGHT_PASS_ID, type PlusOffer } from './purchases'

/**
 * The Tonight sheet's decisions, pure (Flow 12 · 12.1). What may open it,
 * which paywall trigger it counts as (the cooldowns and the server's
 * analytics are per `PaywallTrigger`), what it sells and what it says after.
 */

/**
 * The triggers the app opens. `crew` is the sheet's own (locked crew extras)
 * and is cut until the extras exist (owner-delegated D6: show nothing, never a
 * locked ghost row), so nothing can ask for it.
 */
export type OpenableTrigger = Exclude<TonightTrigger, 'crew'>

/** The paywall trigger the sheet counts as: its cooldown and its analytics. */
export function paywallTriggerFor(trigger: OpenableTrigger): PaywallTrigger {
  switch (trigger) {
    case 'stay':
    case 'expiry':
      return 'go_live_expiry'
    case 'night':
      return 'recap'
    case 'perk':
      return 'perk'
  }
}

/** The two things the sheet sells, at the store's own prices; null unless the store has both. */
export function tonightOffers(offers: readonly PlusOffer[] | null | undefined): { night: PlusOffer; monthly: PlusOffer } | null {
  const night = offers?.find((o) => o.pkg.identifier === NIGHT_PASS_ID)
  const monthly = offers?.find((o) => o.pkg.identifier === '$rc_monthly')
  return night && monthly ? { night, monthly } : null
}

/** The store's own string for what the person would pay least, "from ₹49" on the expiry prompt's row; null with nothing priced. */
export function lowestPrice(offers: readonly PlusOffer[] | null | undefined): string | null {
  let best: PlusOffer | null = null
  for (const o of offers ?? []) {
    const price = o.pkg.product.price
    if (typeof price === 'number' && Number.isFinite(price) && (!best || price < best.pkg.product.price)) best = o
  }
  return best?.price ?? null
}

/** The sentence after a purchase for a trigger that is not a go-live: what was bought. */
export function purchasedToast(pick: TonightPick): string {
  return pick === 'night' ? 'Blend’n+ · Night Pass · 24 hours' : 'Blend’n+ · Monthly'
}

/** A stay-shaped trigger goes live as soon as it is unlocked: "the locked thing simply works". */
export const goesLiveWhenUnlocked = (trigger: OpenableTrigger): boolean => trigger === 'stay' || trigger === 'expiry'

/**
 * A store failure with no words of its own (`purchaseFailure`'s default): the
 * sheet says "Nothing was charged" and offers Try again. Any other (a receipt
 * on another account, Screen Time, no connection) has its own sentence, which a
 * tray carries in full.
 */
export const GENERIC_FAILURE = "The purchase didn’t go through. Try again."
export const isGenericFailure = (message: string): boolean => message === GENERIC_FAILURE

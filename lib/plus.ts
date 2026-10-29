import { useCallback, useEffect, useState } from 'react'
import { AppState } from 'react-native'

import type { IconName } from '../components/ui/Icon'
import { apiClient } from './apiClient'
import type { PlusGrant, PlusState } from './plusManage'
import { NIGHT_PASS_ID, type PlusOffer } from './purchases'
import { calendarDate, clockTime } from './time'

/**
 * Blendn+ as the server says it (`GET /api/mobile/me/plus`). The server is the
 * only thing that decides what is unlocked: a Night Pass is the server's 24
 * hours, and a store purchase counts once its webhook has landed there.
 */
export type PlusStatus = {
  active: boolean
  /**
   * Whether Blendn+ is for sale to this person at all (their city is gated).
   * False in a launch season: sell nothing, say it is free (review H2).
   */
  gated: boolean
  product: 'plus' | 'night_pass' | null
  source: 'apple' | 'google' | 'grant' | 'razorpay' | null
  expiresAt: string | null
  /**
   * When the account's entitlement rows last changed (the server's `changedAt`). `GET /me/plus` reports only the longest live
   * row, so a Night Pass stacked on a grant or a subscription never moves the answer; this does. Absent from an older server.
   */
  changedAt?: string | null
  /**
   * How a subscription stands, and which gift a grant is: not sent yet (`lib/plusManage.ts` reads them when they are,
   * and never guesses). Absent, a subscription is "active" and a grant is "nothing renews".
   */
  state?: PlusState | null
  grant?: PlusGrant | null
}

export type PlusFeature = { icon: IconName; title: string; detail: string }

/**
 * What Blendn+ is — what exists today, never anything on the never-sold list
 * (plan v2 §9.3). Partner perks and crew extras join this list when they are
 * built (SCRUM-584), not before: nothing is sold that cannot be used, and
 * nothing unbuilt is named on the paywall, not even as "on the way" (App
 * Review 2.1 / 3.1.2, app-review-readiness 2026-10-24 #6).
 */
export const PLUS_FEATURES: readonly PlusFeature[] = [
  { icon: 'radio', title: 'Stay live while you’re there', detail: 'Past the free window, up to 4 hours' },
  { icon: 'history', title: 'Your full night history', detail: 'Beyond the last 3 nights' },
]

/** The app's one date (`calendarDate`), as Manage says it: the phone's locale wrote "23. Oct 2027" here (RC drive 3, en_DE). */
const dateOf = (iso: string) => calendarDate(iso)

/**
 * "Blend’n+ until 10 Nov", "Blend’n+ until 23 Oct 2027" / "Night Pass until 11 Oct, 4:30 AM" (`calendarDate`: the
 * year only when it is not this one) — or null when there is nothing to say. A pass shows its day too: passes stack,
 * and "until 4:30 AM" could be tomorrow's or the day after's.
 */
export function plusStatusLine(status: PlusStatus | null | undefined): string | null {
  if (!status?.active) return null
  const name = status.product === 'night_pass' ? 'Night Pass' : 'Blend’n+'
  if (!status.expiresAt) return `You have ${name}`
  const until = status.product === 'night_pass' ? `${dateOf(status.expiresAt)}, ${clockTime(status.expiresAt)}` : dateOf(status.expiresAt)
  return `${name} until ${until}`
}

/** The last answer anyone got, so a tap on Settings › Blend'n+ can tell Manage from the page without asking first. */
let lastKnown: PlusStatus | null = null
export const knownPlus = (): PlusStatus | null => lastKnown
/** At sign-out, or another account: the last answer was somebody else's. */
export function clearKnownPlus(): void {
  lastKnown = null
}

/** Every mounted `usePlusStatus`, told when the server has just granted Blendn+: a sheet that sold it is not a screen's focus. */
const plusChangedListeners = new Set<() => void>()
export function notifyPlusChanged(): void {
  for (const fn of [...plusChangedListeners]) fn()
}

/**
 * The person's Blendn+, kept fresh: read on mount, when the app comes back
 * to the foreground (a pending payment confirmed while away) and when a
 * purchase or restore has landed (`notifyPlusChanged`). A screen also
 * passes `refresh` to `useFocusEffect`, so coming back to it re-reads. Null
 * until the first answer; after a failed one the last answer stands.
 */
export function usePlusStatus(): { status: PlusStatus | null; refresh: () => void } {
  // The last answer anyone got: a row that says where you stand draws it at once and is corrected when the server answers.
  const [status, setStatus] = useState<PlusStatus | null>(lastKnown)
  const refresh = useCallback(() => {
    apiClient
      .getMyPlus()
      .then((res) => {
        if (res.success && res.data) {
          lastKnown = res.data
          setStatus(res.data)
        }
      })
      .catch(() => {})
  }, [])
  useEffect(() => {
    refresh()
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh()
    })
    plusChangedListeners.add(refresh)
    return () => {
      app.remove()
      plusChangedListeners.delete(refresh)
    }
  }, [refresh])
  return { status, refresh }
}

/** After a purchase or restore, ask this often … */
export const PLUS_POLL_EVERY_MS = 3_000
/** … for this long, before saying it is taking longer than usual. */
export const PLUS_POLL_FOR_MS = 60_000
/**
 * An already active account on a server that sends no `changedAt` cannot be told apart from itself once the purchase lands
 * (the answer is the longest live row), so it waits this long and then takes the active answer it has.
 */
export const PLUS_POLL_ACTIVE_NO_CHANGEDAT_MS = 10_000

/**
 * Whether the server's answer is a purchase landing on top of `before` (SYS-03): a different product or source, or a
 * later expiry (a Night Pass stacks). An account that was not active needs no change, only to be active.
 */
export function plusChangedSince(before: PlusStatus | null | undefined, status: PlusStatus): boolean {
  if (!status.active) return false
  if (!before?.active) return true
  if (status.changedAt && before.changedAt && status.changedAt !== before.changedAt) return true
  if (status.product !== before.product || status.source !== before.source) return true
  return Date.parse(status.expiresAt ?? '') > Date.parse(before.expiresAt ?? '')
}

/**
 * The store's webhook grants Blendn+, not the app: ask the server until it says so, or give up after a minute (null).
 * `stopped` ends it early (the screen closed). `before` is what the account held when the purchase started: with it,
 * an already active account (a grant, a Night Pass) waits for the purchase to land rather than for "active", which it
 * already was. Without it, the first "active" ends the wait (a restore).
 */
export async function waitForPlus(
  stopped: () => boolean = () => false,
  now: () => number = Date.now,
  before?: PlusStatus | null
): Promise<PlusStatus | null> {
  const until = now() + (before?.active && !before.changedAt ? PLUS_POLL_ACTIVE_NO_CHANGEDAT_MS : PLUS_POLL_FOR_MS)
  let lastActive: PlusStatus | null = null
  const settle = (status: PlusStatus) => {
    lastKnown = status
    notifyPlusChanged()
    return status
  }
  while (!stopped()) {
    // A failed ask (offline, a cleared queue) is "not yet", never the end of the wait.
    const res = await apiClient.getMyPlus().catch(() => null)
    if (res?.success && res.data && plusChangedSince(before, res.data)) return settle(res.data)
    if (res?.success && res.data?.active) lastActive = res.data
    // The account was already active and still is: the purchase may have stacked under the answer. Say it is on.
    if (now() + PLUS_POLL_EVERY_MS > until) return before?.active && lastActive ? settle(lastActive) : null
    await new Promise((resolve) => setTimeout(resolve, PLUS_POLL_EVERY_MS))
  }
  return null
}

/**
 * What the dock does. A subscription the stores run is managed there: the dock
 * reads "Manage Blend’n+". Everything else keeps the buy button — a Night Pass
 * stacks (another adds 24 hours), and a granted account (App Review's) must
 * still be able to buy every product (guideline 2.1(b)).
 */
export function dockMode(status: PlusStatus | null | undefined): 'buy' | 'manage' {
  return status?.active && status.product === 'plus' && (status.source === 'apple' || status.source === 'google') ? 'manage' : 'buy'
}

/** A subscription's row: the short name and the unit beside the store's price string. */
const PLAN_ROWS: Record<string, { name: string; per: string }> = {
  $rc_monthly: { name: 'Monthly', per: '/ month' },
  $rc_three_month: { name: '3 months', per: '/ 3 months' },
  $rc_annual: { name: 'Yearly', per: '/ year' },
}

export const isNightPass = (offer: PlusOffer) => offer.pkg.identifier === NIGHT_PASS_ID

/** Months in a subscription package's period: what the monthly equivalent divides by. */
const MONTHS: Record<string, number> = { $rc_monthly: 1, $rc_three_month: 3, $rc_annual: 12 }

/**
 * The sub line under a subscription row, from the store's own numbers (never a
 * price written here): "About ₹166 a month · Save 16%" against the monthly
 * package. Monthly itself has none; no "Save" when the store's prices do not
 * say it saves; null when the store gave no monthly figure.
 */
export function planSubline(offer: PlusOffer, offers: readonly PlusOffer[]): string | null {
  const months = MONTHS[offer.pkg.identifier]
  if (!months || months === 1) return null
  const { pricePerMonthString: each, pricePerMonth: perMonth } = offer.pkg.product
  if (!each) return null
  const monthly = offers.find((o) => o.pkg.identifier === '$rc_monthly')?.pkg.product.price
  const saved = monthly && perMonth ? Math.round((1 - perMonth / monthly) * 100) : 0
  // A non-breaking pair: "Save" never ends a line with its number on the next.
  return `About ${each} a month${saved > 0 ? ` · Save\u00A0${saved}%` : ''}`
}

/** D2: the tax sentence, only when every price on the screen is in rupees. The store's own sheet states tax per storefront. */
export const GST_LINE = 'Prices include GST.'

export function taxLine(offers: readonly PlusOffer[] | null | undefined): string | null {
  if (!offers?.length) return null
  return offers.every((o) => o.pkg.product.currencyCode === 'INR') ? GST_LINE : null
}

/** D4: what the store's subscriptions page can do. The App Store has no pause; Google Play does. */
export const storeManageHint = (store: 'ios' | 'android'): string =>
  store === 'android' ? 'Change plan, pause or cancel · one tap' : 'Change plan or cancel · one tap'

/** D4: a granted Blend'n+ has no store row, only this. */
export function grantManageLine(expiresAt: string | null | undefined): string {
  return `Free ${expiresAt ? `until ${dateOf(expiresAt)}` : 'for now'} · nothing to manage`
}

/** The row for a subscription package; null for the Night Pass (its own row) or a package we do not name. */
export function planRowFor(offer: PlusOffer): { name: string; per: string } | null {
  return PLAN_ROWS[offer.pkg.identifier] ?? null
}

/** Monthly is picked first (the first subscription we sell); the Night Pass only when it is all there is. */
export function defaultPick(offers: readonly PlusOffer[]): string | null {
  const first = offers.find((o) => !isNightPass(o)) ?? offers[0]
  return first?.pkg.identifier ?? null
}

/**
 * The dock's button carries the price the person is about to pay, the store's
 * string: the words, the price (set in Geist Mono by the button), and the whole
 * as it is read.
 */
export function ctaParts(offer: PlusOffer | undefined): { lead: string; price?: { amount: string; per?: string }; spoken: string } {
  if (!offer) return { lead: 'Start Blend’n+', spoken: 'Start Blend’n+' }
  const lead = isNightPass(offer) ? 'Get the Night Pass —' : 'Start Blend’n+ —'
  const per = isNightPass(offer) ? undefined : planRowFor(offer)?.per
  return { lead, price: { amount: offer.price, per }, spoken: `${lead} ${offer.price}${per ? ` ${per}` : ''}` }
}

export const ctaLabel = (offer: PlusOffer | undefined): string => ctaParts(offer).spoken

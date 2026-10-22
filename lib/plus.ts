import { useCallback, useEffect, useState } from 'react'
import { AppState } from 'react-native'

import type { PlusStatus as ManageStatus } from '../components/ds/ManageStatusRow'
import type { IconName } from '../components/ui/Icon'
import { apiClient } from './apiClient'
import type { PlusGrant, PlusState } from './plusManage'
import { NIGHT_PASS_ID, type PlusOffer } from './purchases'

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
  source: 'apple' | 'google' | 'grant' | null
  expiresAt: string | null
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
 * built (SCRUM-584), not before: nothing is sold that cannot be used. Until
 * then they are the page's two "Coming soon" rows (`PLUS_COMING_SOON`).
 */
export const PLUS_FEATURES: readonly PlusFeature[] = [
  { icon: 'radio', title: 'Stay live while you’re there', detail: 'Past the free window, up to 4 hours' },
  { icon: 'history', title: 'Your full night history', detail: 'Beyond the last 3 nights' },
]

/** Promised in the design, not served yet: drawn with a "Coming soon" tag, no tap, no sheet (R3-G). */
export const PLUS_COMING_SOON: readonly PlusFeature[] = [
  { icon: 'gift', title: 'Partner perks', detail: 'At places that run them' },
  { icon: 'sparkles', title: 'Cosmetics', detail: 'Looks for your disc and creature' },
  { icon: 'users', title: 'Crew extras', detail: 'A crew photo seen only inside the crew · your pick of the 12 emblem palettes' },
]

const dateOf = (iso: string) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/**
 * "Blendn+ until 10 Nov 2026" / "Night Pass until 11 Oct 2026, 4:30 AM" — or
 * null when there is nothing to say. A pass shows its day too: passes stack,
 * and "until 4:30 AM" could be tomorrow's or the day after's.
 */
export function plusStatusLine(status: PlusStatus | null | undefined): string | null {
  if (!status?.active) return null
  const name = status.product === 'night_pass' ? 'Night Pass' : 'Blend’n+'
  if (!status.expiresAt) return `You have ${name}`
  const until = status.product === 'night_pass' ? `${dateOf(status.expiresAt)}, ${timeOf(status.expiresAt)}` : dateOf(status.expiresAt)
  return `${name} until ${until}`
}

/** The last answer anyone got, so a tap on Settings › Blend'n+ can tell Manage from the page without asking first. */
let lastKnown: PlusStatus | null = null
export const knownPlus = (): PlusStatus | null => lastKnown

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
  const [status, setStatus] = useState<PlusStatus | null>(null)
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
 * The store's webhook grants Blendn+, not the app: ask the server until it
 * says active, or give up after a minute (null). `stopped` ends it early — the
 * screen closed.
 */
export async function waitForPlus(stopped: () => boolean = () => false, now: () => number = Date.now): Promise<PlusStatus | null> {
  const until = now() + PLUS_POLL_FOR_MS
  while (!stopped()) {
    // A failed ask (offline, a cleared queue) is "not yet", never the end of the wait.
    const res = await apiClient.getMyPlus().catch(() => null)
    if (res?.success && res.data?.active) {
      lastKnown = res.data
      notifyPlusChanged()
      return res.data
    }
    if (now() + PLUS_POLL_EVERY_MS > until) return null
    await new Promise((resolve) => setTimeout(resolve, PLUS_POLL_EVERY_MS))
  }
  return null
}

/**
 * The card for what is active, in the Manage status card's words: the server's
 * own sentence (`plusStatusLine`) with where it was bought, or — for a Night
 * Pass — that it does not renew and another adds 24 hours. Null when nothing is
 * active (a launch season is the page's banner, not a card).
 */
export function plusStatusCard(status: PlusStatus | null | undefined): { kind: Extract<ManageStatus, 'active' | 'night'>; sentence: string } | null {
  const line = plusStatusLine(status)
  if (!status?.active || !line) return null
  if (status.product === 'night_pass') return { kind: 'night', sentence: `${line}. It doesn’t renew; another one adds 24 hours.` }
  const store = status.source === 'apple' ? 'App Store' : status.source === 'google' ? 'Google Play' : null
  return { kind: 'active', sentence: store ? `${line} · ${store}` : line }
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
  return `About ${each} a month${saved > 0 ? ` · Save ${saved}%` : ''}`
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

import { router } from 'expo-router'

import { apiClient } from './apiClient'
import { isBlendnOpen } from './blendnOverlay'
import { Logger } from './logger'
import {
  mayOpenPaywall,
  readPaywallMemory,
  rememberPaywallEvent,
  writePaywallMemory,
  type PaywallEvent,
  type PaywallTrigger,
} from './paywallPolicy'
import { knownPlus } from './plus'
import { hasSomethingToManage } from './plusManage'
import { paywallTriggerFor, type OpenableTrigger } from './tonight'

/**
 * Opening the Blendn+ paywall (`app/plus.tsx`) through its policy
 * (`lib/paywallPolicy.ts`). Never imported by onboarding, a check-in, a chat
 * or the room (`__tests__/paywallGuards.test.ts`, MN-CU01); the policy also
 * refuses to arrive over them by itself, since `LiveAtVenue` is mounted over
 * everything — which is why the root layout tells this module where you are.
 */

/** ponytail: a session is the app's process — a long background does not start a new one. */
let automaticShownThisSession = false
/** Where you are, from the root layout's `usePathname` (`notePathname`). */
let currentPathname: string | null = null

export function notePathname(pathname: string | null): void {
  currentPathname = pathname
}

/** For tests: a fresh app start. */
export function resetPaywallSession(): void {
  automaticShownThisSession = false
}

/** Analytics, fire-and-forget, plus the cooldowns' memory. Never blocks anything. */
export function notePaywallEvent(event: PaywallEvent, trigger: PaywallTrigger): void {
  void apiClient.logPaywallEvent(event, trigger).catch(() => {})
  if (event !== 'shown' && event !== 'dismissed') return
  void readPaywallMemory()
    .then((memory) => writePaywallMemory(rememberPaywallEvent(memory, trigger, event, Date.now())))
    .catch((error) => Logger.warn('plus', 'Could not note the paywall', { error: String(error) }))
}

/**
 * How the paywall closed: `done` when the person did what it offered (bought,
 * took the free way on), `dismissed` when they just left it.
 */
export type PaywallClosed = 'done' | 'dismissed'

/** Listeners for the paywall closing (the expiry prompt comes back after a dismissal, never after a purchase). */
const closedListeners = new Set<(outcome: PaywallClosed) => void>()
export function subscribePaywallClosed(fn: (outcome: PaywallClosed) => void): () => void {
  closedListeners.add(fn)
  return () => {
    closedListeners.delete(fn)
  }
}
/** Called by `app/plus.tsx` as it unmounts, and by the Tonight sheet as it closes. */
export function notePaywallClosed(outcome: PaywallClosed = 'dismissed'): void {
  for (const fn of [...closedListeners]) fn(outcome)
}

/**
 * Where the paywall never goes, even when asked: on top of itself (a second
 * tap, a deep link while open) or over onboarding.
 */
export function paywallBlockedAt(pathname: string | null): boolean {
  return pathname === '/plus' || (pathname?.startsWith('/onboarding') ?? false)
}

/**
 * Opens the paywall if the policy allows it, and says whether it did. A tap
 * on something that says Blendn+ passes `userInitiated` and always opens it —
 * except on top of itself or over onboarding (`paywallBlockedAt`).
 */
export async function openPaywall(trigger: PaywallTrigger, { userInitiated = false }: { userInitiated?: boolean } = {}): Promise<boolean> {
  // The earlier nights are met on Going, one row: the contextual sheet answers it, not the whole page.
  if (trigger === 'recap' && tonightHost) return openTonight({ trigger: 'night', venue: '' }, { userInitiated })
  if (!(await mayShow(trigger, userInitiated))) return false
  // Settings › Blend'n+ is Manage for somebody who has something to manage (Flow 12 · 12.3); the page is for buying.
  if (trigger === 'profile' && hasSomethingToManage(knownPlus())) router.push('/plus-manage' as never)
  else router.push({ pathname: '/plus', params: { trigger } } as never)
  return true
}

/** The one gate in front of either surface: where the person is, and (for an automatic one) the policy. */
async function mayShow(trigger: PaywallTrigger, userInitiated: boolean): Promise<boolean> {
  if (paywallBlockedAt(currentPathname)) return false
  if (userInitiated) return true
  const memory = await readPaywallMemory()
  const ctx = { userInitiated, automaticShownThisSession, pathname: currentPathname, roomOpen: isBlendnOpen() }
  if (!mayOpenPaywall(trigger, memory, Date.now(), ctx)) return false
  automaticShownThisSession = true
  return true
}

/**
 * What the Tonight sheet is asked to show (Flow 12 · 12.1): the trigger, the
 * place it is about, the free way on beside the paid one, and what happens once
 * the locked thing is bought.
 */
export type TonightRequest = {
  trigger: OpenableTrigger
  venue: string
  /** The free path's button (Extend 45 min, Go live for 1 hour). Omitted: "Not now", which only closes. */
  onFree?: () => void
  /** Bought: the locked thing simply works (a stay-shaped trigger goes live with Stay). */
  onUnlocked?: () => void
}

/** The mounted `TonightHost` (components/plus), or null: nobody to draw the sheet. */
let tonightHost: ((request: TonightRequest) => void) | null = null
export function registerTonightHost(host: (request: TonightRequest) => void): () => void {
  tonightHost = host
  return () => {
    if (tonightHost === host) tonightHost = null
  }
}

/**
 * The contextual Blend'n+ sheet where a lock was met (a Stay tap, the earlier
 * nights, the expiry prompt's row), through the same policy and the same
 * places-it-never-opens as the page. With no host to draw it, the page opens
 * instead: the paywall is never lost.
 */
export async function openTonight(request: TonightRequest, { userInitiated = false }: { userInitiated?: boolean } = {}): Promise<boolean> {
  const trigger = paywallTriggerFor(request.trigger)
  if (!tonightHost) return openPaywall(trigger, { userInitiated })
  if (!(await mayShow(trigger, userInitiated))) return false
  tonightHost(request)
  return true
}

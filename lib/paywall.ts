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

/** Listeners for the paywall closing (the expiry prompt comes back without "Stay" after it). */
const closedListeners = new Set<() => void>()
export function subscribePaywallClosed(fn: () => void): () => void {
  closedListeners.add(fn)
  return () => {
    closedListeners.delete(fn)
  }
}
/** Called by `app/plus.tsx` as it unmounts. */
export function notePaywallClosed(): void {
  for (const fn of [...closedListeners]) fn()
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
  if (paywallBlockedAt(currentPathname)) return false
  if (!userInitiated) {
    const memory = await readPaywallMemory()
    const ctx = { userInitiated, automaticShownThisSession, pathname: currentPathname, roomOpen: isBlendnOpen() }
    if (!mayOpenPaywall(trigger, memory, Date.now(), ctx)) return false
    automaticShownThisSession = true
  }
  router.push({ pathname: '/plus', params: { trigger } } as never)
  return true
}

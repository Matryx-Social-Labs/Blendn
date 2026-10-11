import { useCallback, useEffect, useState } from 'react'
import { AppState } from 'react-native'

import { apiClient } from './apiClient'

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
}

/**
 * What Blendn+ is — what exists today, never anything on the never-sold list
 * (plan v2 §9.3). Partner perks and crew extras join this list when they are
 * built (SCRUM-584), not before: nothing is sold that cannot be used.
 */
export const PLUS_FEATURES = [
  { icon: 'radio-outline', title: "Stay live while I'm here", detail: 'Go live once and stay until you leave, instead of picking a time.' },
  { icon: 'moon-outline', title: 'Your full night history', detail: 'Free keeps your last 3 nights.' },
] as const

const dateOf = (iso: string) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/**
 * "Blendn+ until 10 Nov 2026" / "Night Pass until 11 Oct 2026, 4:30 AM" — or
 * null when there is nothing to say. A pass shows its day too: passes stack,
 * and "until 4:30 AM" could be tomorrow's or the day after's.
 */
export function plusStatusLine(status: PlusStatus | null | undefined): string | null {
  if (!status?.active) return null
  const name = status.product === 'night_pass' ? 'Night Pass' : 'Blendn+'
  if (!status.expiresAt) return `You have ${name}`
  const until = status.product === 'night_pass' ? `${dateOf(status.expiresAt)}, ${timeOf(status.expiresAt)}` : dateOf(status.expiresAt)
  return `${name} until ${until}`
}

/**
 * The person's Blendn+, kept fresh: read on mount and when the app comes back
 * to the foreground (a pending payment confirmed while away). A screen also
 * passes `refresh` to `useFocusEffect`, so coming back to it re-reads. Null
 * until the first answer; after a failed one the last answer stands.
 */
export function usePlusStatus(): { status: PlusStatus | null; refresh: () => void } {
  const [status, setStatus] = useState<PlusStatus | null>(null)
  const refresh = useCallback(() => {
    apiClient
      .getMyPlus()
      .then((res) => {
        if (res.success && res.data) setStatus(res.data)
      })
      .catch(() => {})
  }, [])
  useEffect(() => {
    refresh()
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh()
    })
    return () => app.remove()
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
    if (res?.success && res.data?.active) return res.data
    if (now() + PLUS_POLL_EVERY_MS > until) return null
    await new Promise((resolve) => setTimeout(resolve, PLUS_POLL_EVERY_MS))
  }
  return null
}

import { useSyncExternalStore } from 'react'

/**
 * The nights you rated in this session, so every place that offers "Rate who
 * you met" stops offering it the moment a rating is sent: Going's Past row and
 * the Recap (PR #401 drive 2: Going still offered it after rating, and the
 * rate screen reopened on "Nothing to rate"). A later read of the server's own
 * answer (`GET /events/:id/rating`) covers nights rated on another launch.
 */
const rated = new Set<string>()
const listeners = new Set<() => void>()
let version = 0

export function markNightRated(eventId: string): void {
  if (rated.has(eventId)) return
  rated.add(eventId)
  version += 1
  listeners.forEach((fn) => fn())
}

export function isNightRated(eventId: string): boolean {
  return rated.has(eventId)
}

/** Re-renders when a night is rated; read `isNightRated` in render. */
export function useRatedNights(): number {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    () => version
  )
}

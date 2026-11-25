type CacheEntry<T> = {
  data: T
  expiresAt: number
}

const CACHE_TTL_MS = 2 * 60 * 1000
const cache = new Map<string, CacheEntry<any>>()

export function getEventDetailCache<T>(eventId: string): T | null {
  const entry = cache.get(eventId)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    cache.delete(eventId)
    return null
  }
  return entry.data as T
}

export function setEventDetailCache<T>(eventId: string, data: T): void {
  cache.set(eventId, { data, expiresAt: Date.now() + CACHE_TTL_MS })
}

/** Sign-out: every entry carries the last account's `userStatus` (going, checked in), which the next account must not see. */
export function forgetEventDetails(): void {
  cache.clear()
}

/** After a check-in or check-out: the cached `userStatus` is no longer true. */
export function forgetEventDetailCache(eventId: string): void {
  cache.delete(eventId)
}

/**
 * An RSVP or a Save went through: write what the server now says into the cached detail, so a reopen inside the TTL paints
 * the truth before the network answers (SCRUM-876). A copy, never a mutation. Nothing cached: nothing to patch (the next
 * open fetches, and the API client's own entry was forgotten with the write). The expiry is left as it was.
 */
export function patchEventDetailStatus(eventId: string, patch: { rsvpStatus?: string | null; isFavorited?: boolean }): void {
  const entry = cache.get(eventId)
  if (!entry) return
  const data = entry.data as { userStatus?: Record<string, unknown> | null }
  cache.set(eventId, { ...entry, data: { ...data, userStatus: { ...(data.userStatus ?? {}), ...patch } } })
}

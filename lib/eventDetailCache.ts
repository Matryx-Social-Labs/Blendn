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

/** After a check-in or check-out: the cached `userStatus` is no longer true. */
export function forgetEventDetailCache(eventId: string): void {
  cache.delete(eventId)
}

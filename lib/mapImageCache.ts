type CacheEntry = {
  url: string
  expiresAt: number
}

const CACHE_TTL_MS = 10 * 60 * 1000
const cache = new Map<string, CacheEntry>()

export function getMapImageUrlCache(key: string): string | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }
  return entry.url
}

export function setMapImageUrlCache(key: string, url: string): void {
  cache.set(key, { url, expiresAt: Date.now() + CACHE_TTL_MS })
}

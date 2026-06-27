import { Logger } from './logger'

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
  key: string
}

class QueryCache {
  private cache = new Map<string, CacheEntry<any>>()
  private readonly DEFAULT_TTL = 5 * 60 * 1000 // 5 minutes
  private readonly MAX_CACHE_SIZE = 500

  /**
   * Get cached data or return null if expired/not found
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      Logger.debug('database', 'Cache expired', { key })
      return null
    }

    Logger.debug('database', 'Cache hit', { key })
    return entry.data
  }

  /**
   * Set cached data with TTL
   */
  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    // Prevent cache from growing too large
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldest()
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      key
    })

    Logger.debug('database', 'Cache set', { key, ttl })
  }

  /**
   * Invalidate cache entries by pattern
   */
  invalidate(pattern: string): void {
    const keysToDelete: string[] = []
    
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        keysToDelete.push(key)
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key))
    
    Logger.debug('database', 'Cache invalidated', { 
      pattern, 
      keysDeleted: keysToDelete.length 
    })
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    const size = this.cache.size
    this.cache.clear()
    Logger.info('database', 'Cache cleared', { previousSize: size })
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      defaultTTL: this.DEFAULT_TTL
    }
  }

  /**
   * Evict oldest cache entries
   */
  private evictOldest(): void {
    const entries = Array.from(this.cache.entries())
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
    
    // Remove oldest 10%
    const toRemove = Math.ceil(entries.length * 0.1)
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0])
    }

    Logger.debug('database', 'Cache evicted oldest entries', { removed: toRemove })
  }
}

// Global cache instance
export const queryCache = new QueryCache()

export default queryCache

import { Logger } from './logger'
import { supabase, runQuery } from './supabase'

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
  key: string
}

interface BatchQuery {
  id: string
  table: string
  select: string
  filters: Record<string, any>
  resolve: (data: any) => void
  reject: (error: any) => void
}

class QueryCache {
  private cache = new Map<string, CacheEntry<any>>()
  private batchQueue: BatchQuery[] = []
  private batchTimer: any = null
  private readonly BATCH_DELAY = 50 // ms
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

  /**
   * Add query to batch queue
   */
  addToBatch(query: Omit<BatchQuery, 'id'>): Promise<any> {
    return new Promise((resolve, reject) => {
      const batchQuery: BatchQuery = {
        ...query,
        id: `batch_${Date.now()}_${Math.random()}`,
        resolve,
        reject
      }

      this.batchQueue.push(batchQuery)

      // Start batch timer if not already running
      if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => {
          this.processBatch()
        }, this.BATCH_DELAY)
      }
    })
  }

  /**
   * Process batched queries
   */
  private async processBatch(): Promise<void> {
    if (this.batchQueue.length === 0) return

    const queries = [...this.batchQueue]
    this.batchQueue = []
    this.batchTimer = null

    Logger.debug('database', `Processing batch of ${queries.length} queries`)

    // Group queries by table and select statement
    const groupedQueries = new Map<string, BatchQuery[]>()
    
    queries.forEach(query => {
      const key = `${query.table}:${query.select}`
      if (!groupedQueries.has(key)) {
        groupedQueries.set(key, [])
      }
      groupedQueries.get(key)!.push(query)
    })

    // Process each group
    for (const [tableSelect, queryGroup] of groupedQueries) {
      try {
        await this.processBatchGroup(queryGroup)
      } catch (error) {
        Logger.error('database', 'Batch processing failed', { tableSelect, error })
        queryGroup.forEach(q => q.reject(error))
      }
    }
  }

  /**
   * Process a group of similar queries
   */
  private async processBatchGroup(queries: BatchQuery[]): Promise<void> {
    // For now, execute queries individually
    // TODO: Implement actual batch SQL operations
    
    for (const query of queries) {
      try {
        // This would be replaced with actual Supabase query logic
        const result = await this.executeQuery(query)
        query.resolve(result)
      } catch (error) {
        query.reject(error)
      }
    }
  }

  /**
   * Execute individual query (placeholder)
   */
  private async executeQuery(query: BatchQuery): Promise<any> {
    Logger.debug('database', 'Executing batch query', {
      table: query.table,
      select: query.select,
      filters: Object.keys(query.filters || {})
    })

    return runQuery(async () => {
      let q: any = supabase.from(query.table).select(query.select)

      const f = query.filters || {}

      // Support common filter shapes
      if (f.eq && typeof f.eq === 'object') {
        for (const [col, val] of Object.entries(f.eq)) {
          q = q.eq(col, val as any)
        }
      }
      if (f.neq && typeof f.neq === 'object') {
        for (const [col, val] of Object.entries(f.neq)) {
          q = q.neq(col, val as any)
        }
      }
      if (f.in && typeof f.in === 'object') {
        for (const [col, arr] of Object.entries(f.in)) {
          q = q.in(col, Array.isArray(arr) ? arr : [arr])
        }
      }
      if (f.gte && typeof f.gte === 'object') {
        for (const [col, val] of Object.entries(f.gte)) {
          q = q.gte(col, val as any)
        }
      }
      if (f.lte && typeof f.lte === 'object') {
        for (const [col, val] of Object.entries(f.lte)) {
          q = q.lte(col, val as any)
        }
      }
      if (f.like && typeof f.like === 'object') {
        for (const [col, val] of Object.entries(f.like)) {
          q = q.like(col, String(val))
        }
      }
      if (f.ilike && typeof f.ilike === 'object') {
        for (const [col, val] of Object.entries(f.ilike)) {
          q = q.ilike(col, String(val))
        }
      }
      if (f.is && typeof f.is === 'object') {
        for (const [col, val] of Object.entries(f.is)) {
          q = q.is(col, val as any)
        }
      }
      if (f.order) {
        const orders = Array.isArray(f.order) ? f.order : [f.order]
        for (const o of orders) {
          if (o && typeof o === 'object' && 'column' in o) {
            q = q.order((o as any).column, {
              ascending: (o as any).ascending ?? true,
              nullsFirst: (o as any).nullsFirst ?? false
            })
          }
        }
      }
      if (typeof f.limit === 'number') {
        q = q.limit(f.limit)
      }
      if (typeof f.offset === 'number') {
        q = q.range(f.offset, f.limit ? f.offset + f.limit - 1 : f.offset + 99)
      }
      if (f.single) {
        q = q.single()
      } else if (f.maybeSingle) {
        q = q.maybeSingle()
      }

      const { data, error } = await q
      if (error) throw error
      return data
    })
  }
}

// Global cache instance
export const queryCache = new QueryCache()

/**
 * Cached query wrapper
 */
export const cachedQuery = async <T>(
  cacheKey: string,
  queryFn: () => Promise<T>,
  ttl?: number
): Promise<T> => {
  // Check cache first
  const cached = queryCache.get<T>(cacheKey)
  if (cached !== null) {
    return cached
  }

  // Execute query
  try {
    const result = await queryFn()
    queryCache.set(cacheKey, result, ttl)
    return result
  } catch (error) {
    Logger.error('database', 'Cached query failed', { cacheKey, error })
    throw error
  }
}

/**
 * Batch query helper
 */
export const batchQuery = async (
  table: string,
  select: string,
  filters: Record<string, any>
): Promise<any> => {
  return queryCache.addToBatch({
    table,
    select,
    filters
  })
}

/**
 * Smart cache invalidation based on operations
 */
export const invalidateRelatedCache = (operation: {
  table: string
  type: 'insert' | 'update' | 'delete'
  data?: any
}): void => {
  // Invalidate cache entries related to the affected table
  queryCache.invalidate(operation.table)
  
  // Table-specific invalidation logic
  switch (operation.table) {
    case 'events':
      queryCache.invalidate('event_')
      queryCache.invalidate('upcoming_')
      queryCache.invalidate('nearby_')
      break
    
    case 'event_checkins':
      queryCache.invalidate('checkin_')
      queryCache.invalidate('attendance_')
      break
    
    case 'event_interests':
      queryCache.invalidate('interest_')
      break
    
    case 'profiles':
    case 'user_profiles':
      queryCache.invalidate('profile_')
      queryCache.invalidate('user_')
      break
  }

  Logger.debug('database', 'Cache invalidated for operation', operation)
}

// Cache warming for common queries
export const warmCache = async (): Promise<void> => {
  Logger.info('database', 'Starting cache warm-up')
  
  // This would pre-load common queries
  // Implementation would depend on specific app patterns
}

export default queryCache

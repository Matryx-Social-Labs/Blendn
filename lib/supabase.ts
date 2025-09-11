// Import URL polyfill first (CRITICAL for React Native)
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { AppState } from 'react-native'
import 'react-native-url-polyfill/auto'
import { Logger } from './logger'

// Validate environment variables
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

// Enforce strict configuration: fail fast with a clear error instead of using bogus fallbacks
if (!supabaseUrl || !supabaseAnonKey) {
  const message = 'Missing Supabase configuration. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'
  console.error(`❌ ${message}`)
  throw new Error(message)
}

const clientUrl = supabaseUrl
const clientKey = supabaseAnonKey

// Enhanced request queue to prevent network storms and database overload
class RequestQueue {
  private queue: Array<{ 
    request: () => Promise<any>, 
    resolve: (value: any) => void, 
    reject: (error: any) => void,
    priority: number,
    timestamp: number,
    type: 'query' | 'rpc' | 'auth'
  }> = []
  private processing = false
  private maxConcurrent = 3
  private currentRequests = 0
  private lastProcessTime = 0
  private debounceMs = 50
  private requestCount = 0
  private errorCount = 0

  async add<T>(
    request: () => Promise<T>, 
    priority: number = 5,
    type: 'query' | 'rpc' | 'auth' = 'query'
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ 
        request, 
        resolve, 
        reject, 
        priority, 
        timestamp: Date.now(),
        type
      })
      
      // Sort by priority (lower number = higher priority)
      this.queue.sort((a, b) => a.priority - b.priority)
      
      this.scheduleProcessing()
    })
  }

  private scheduleProcessing() {
    const now = Date.now()
    const timeSinceLastProcess = now - this.lastProcessTime
    
    if (timeSinceLastProcess < this.debounceMs) {
      // Debounce rapid requests
      setTimeout(() => this.processQueue(), this.debounceMs - timeSinceLastProcess)
    } else {
      this.processQueue()
    }
  }

  private async processQueue() {
    if (this.processing || this.currentRequests >= this.maxConcurrent || this.queue.length === 0) {
      return
    }

    this.processing = true
    this.lastProcessTime = Date.now()

    Logger.debug('database', `Processing queue: ${this.queue.length} pending, ${this.currentRequests} active`)

    while (this.queue.length > 0 && this.currentRequests < this.maxConcurrent) {
      const item = this.queue.shift()
      if (item) {
        this.currentRequests++
        this.executeRequest(item)
      }
    }

    this.processing = false
  }

  private async executeRequest(item: {
    request: () => Promise<any>, 
    resolve: (value: any) => void, 
    reject: (error: any) => void,
    priority: number,
    timestamp: number,
    type: 'query' | 'rpc' | 'auth'
  }) {
    const requestId = ++this.requestCount
    const startTime = Date.now()
    
    try {
      Logger.debug('database', `Executing ${item.type} request #${requestId}`, {
        priority: item.priority,
        queueTime: startTime - item.timestamp
      })
      
      const result = await item.request()
      
      Logger.debug('database', `Request #${requestId} completed`, {
        duration: Date.now() - startTime,
        type: item.type
      })
      
      item.resolve(result)
    } catch (error) {
      this.errorCount++
      
      Logger.error('database', `Request #${requestId} failed`, {
        error,
        duration: Date.now() - startTime,
        type: item.type,
        errorRate: this.errorCount / this.requestCount
      })
      
      item.reject(error)
    } finally {
      this.currentRequests--
      // Process next batch with a small delay to prevent overwhelming
      setTimeout(() => this.processQueue(), 10)
    }
  }

  getStats() {
    return {
      queueLength: this.queue.length,
      activeRequests: this.currentRequests,
      totalRequests: this.requestCount,
      errorCount: this.errorCount,
      errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0
    }
  }

  // Clear queue on auth changes or critical errors
  clear() {
    Logger.warn('database', 'Clearing request queue', this.getStats())
    
    // Reject all pending requests
    this.queue.forEach(item => {
      item.reject(new Error('Request queue cleared'))
    })
    
    this.queue = []
    this.currentRequests = 0
    this.processing = false
  }
}

const requestQueue = new RequestQueue()

// Secure auth storage using expo-secure-store with seamless migration from AsyncStorage
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: 'blendn.supabase.auth',
  // Avoid biometric/pin prompts on background refresh; tokens are still encrypted at rest
  requireAuthentication: false,
  // iOS-only: never leave device or backups
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
}

const CHUNK_SIZE_CHARS = 1800 // comfortably below SecureStore ~2048 byte limit (ASCII JSON)

function sanitizeKey(key: string): string {
  // SecureStore keys must match /^[\w.-]+$/
  // Map any forbidden character to underscore to preserve readability and avoid collisions in practice
  const sanitized = key.replace(/[^\w.-]/g, '_')
  // Prefix to namespace our entries
  return `sb_${sanitized}`
}

async function getChunkCount(key: string): Promise<number | null> {
  try {
    const sKey = sanitizeKey(key)
    const countStr = await SecureStore.getItemAsync(`${sKey}.__chunks`, SECURE_OPTIONS)
    if (!countStr) return null
    const n = Number(countStr)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

async function clearChunks(key: string, existingCount?: number | null) {
  const count = existingCount ?? (await getChunkCount(key))
  if (!count) return
  for (let i = 0; i < count; i++) {
    try { await SecureStore.deleteItemAsync(`${sanitizeKey(key)}.__chunk_${i}`, SECURE_OPTIONS) } catch {}
  }
  try { await SecureStore.deleteItemAsync(`${sanitizeKey(key)}.__chunks`, SECURE_OPTIONS) } catch {}
}

async function readChunked(key: string): Promise<string | null> {
  const count = await getChunkCount(key)
  if (!count) return null
  const parts: string[] = []
  for (let i = 0; i < count; i++) {
    const part = await SecureStore.getItemAsync(`${sanitizeKey(key)}.__chunk_${i}`, SECURE_OPTIONS)
    if (part == null) return null
    parts.push(part)
  }
  return parts.join('')
}

async function writeChunked(key: string, value: string): Promise<void> {
  const existingCount = await getChunkCount(key)
  // Remove any single-value entry
  try { await SecureStore.deleteItemAsync(sanitizeKey(key), SECURE_OPTIONS) } catch {}
  // Clear previous chunks
  await clearChunks(key, existingCount)

  const chunks: string[] = []
  for (let i = 0; i < value.length; i += CHUNK_SIZE_CHARS) {
    chunks.push(value.slice(i, i + CHUNK_SIZE_CHARS))
  }
  await SecureStore.setItemAsync(`${sanitizeKey(key)}.__chunks`, String(chunks.length), SECURE_OPTIONS)
  for (let i = 0; i < chunks.length; i++) {
    await SecureStore.setItemAsync(`${sanitizeKey(key)}.__chunk_${i}`, chunks[i], SECURE_OPTIONS)
  }
}

const secureAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      // Prefer chunked value if present
      const chunkedVal = await readChunked(key)
      if (chunkedVal != null) return chunkedVal

      const secureVal = await SecureStore.getItemAsync(sanitizeKey(key), SECURE_OPTIONS)
      if (secureVal != null) return secureVal

      // Migration path: fall back to AsyncStorage once, then migrate to SecureStore
      const legacyVal = await AsyncStorage.getItem(key)
      if (legacyVal != null) {
        try {
          if (legacyVal.length > CHUNK_SIZE_CHARS) {
            await writeChunked(key, legacyVal)
          } else {
            await SecureStore.setItemAsync(sanitizeKey(key), legacyVal, SECURE_OPTIONS)
          }
          await AsyncStorage.removeItem(key)
        } catch (migrateErr) {
          console.warn('⚠️ SecureStore migrate setItem failed; leaving legacy token in AsyncStorage', migrateErr)
        }
        return legacyVal
      }
      return null
    } catch (error) {
      console.error('❌ SecureStore getItem error:', error)
      // Final fallback so auth does not break if SecureStore throws
      try {
        return await AsyncStorage.getItem(key)
      } catch {
        return null
      }
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      if (value.length > CHUNK_SIZE_CHARS) {
        await writeChunked(key, value)
      } else {
        // Remove any chunked representation when switching back to single value
        await clearChunks(key)
        await SecureStore.setItemAsync(sanitizeKey(key), value, SECURE_OPTIONS)
      }
      // Ensure legacy store is cleared to prevent stale copies
      try { await AsyncStorage.removeItem(key) } catch {}
    } catch (error) {
      console.error('❌ SecureStore setItem error, falling back to AsyncStorage:', error)
      try { await AsyncStorage.setItem(key, value) } catch (e) { console.error('❌ AsyncStorage fallback setItem error:', e) }
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(sanitizeKey(key), SECURE_OPTIONS)
      await clearChunks(key)
    } catch (error) {
      console.error('❌ SecureStore removeItem error:', error)
    } finally {
      try { await AsyncStorage.removeItem(key) } catch {}
    }
  }
}

// Supabase client following official React Native documentation
export const supabase = createClient(clientUrl, clientKey, {
  auth: {
    storage: secureAuthStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      'X-Client-Info': 'blendn-app',
    },
  },
  db: {
    schema: 'public',
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

// Enhanced request queue with priority support
export const queuedRequest = {
  async add<T>(
    queryFn: () => Promise<T>, 
    priority: number = 5,
    type: 'query' | 'rpc' | 'auth' = 'query'
  ): Promise<T> {
    return requestQueue.add(queryFn, priority, type)
  },
  
  // High priority for auth requests
  async addAuth<T>(queryFn: () => Promise<T>): Promise<T> {
    return requestQueue.add(queryFn, 1, 'auth')
  },
  
  // Medium priority for critical queries
  async addCritical<T>(queryFn: () => Promise<T>): Promise<T> {
    return requestQueue.add(queryFn, 2, 'query')
  },
  
  // Low priority for background operations
  async addBackground<T>(queryFn: () => Promise<T>): Promise<T> {
    return requestQueue.add(queryFn, 8, 'query')
  },
  
  getStats: () => requestQueue.getStats(),
  clear: () => requestQueue.clear()
}

// Tells Supabase Auth to continuously refresh the session automatically
// if the app is in the foreground. When this is added, you will continue
// to receive `onAuthStateChange` events with the `TOKEN_REFRESHED` or
// `SIGNED_OUT` event if the user's session is terminated. This should
// only be registered once.
let appStateListenerRegistered = false
let appStateSubscription: { remove: () => void } | null = null

const registerAppStateListener = () => {
  if (appStateListenerRegistered) return
  
  try {
    // If re-registering (Fast Refresh), remove prior subscription
    try { appStateSubscription?.remove?.() } catch {}
    const sub = AppState.addEventListener('change', (state) => {
      try {
        Logger.info('general', `App state changed to: ${state}`)
        if (state === 'active') {
          supabase.auth.startAutoRefresh()
        } else {
          supabase.auth.stopAutoRefresh()
          // Clear request queue on background to prevent stale requests
          queuedRequest.clear()
        }
      } catch (error) {
        Logger.error('general', 'Error handling app state change', { error })
      }
    })
    appStateSubscription = sub as any
    appStateListenerRegistered = true
    Logger.info('general', 'App state listener registered successfully')
  } catch (error) {
    Logger.error('general', 'Failed to register app state listener', { error })
  }
}

// Register with a small delay to ensure proper initialization
setTimeout(registerAppStateListener, 1000)

// Enhanced timeout wrapper for testing with retries
export const supabaseWithTimeout = {
  async query<T>(queryFn: () => Promise<any>, timeoutMs: number = 15000, retries: number = 2): Promise<T> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        Logger.debug('database', `Query attempt ${attempt + 1}/${retries + 1}`, { timeoutMs })
        
        const result = await Promise.race([
          queryFn(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Query timeout after ${timeoutMs}ms (attempt ${attempt + 1})`)), timeoutMs)
          )
        ]) as T
        
        Logger.debug('database', 'Query successful')
        return result
      } catch (error) {
        Logger.warn('database', `Attempt ${attempt + 1} failed`, { error })
        if (attempt === retries) {
          throw error
        }
        // Wait before retry with exponential backoff
        const waitTime = 1000 * Math.pow(2, attempt)
        Logger.debug('database', `Waiting ${waitTime}ms before retry`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
    throw new Error('All retry attempts failed')
  },
  
  // Add specific auth timeout wrapper with retries
  async getUser(timeoutMs: number = 10000, retries: number = 2) {
    return this.query(() => supabase.auth.getUser(), timeoutMs, retries)
  }
}

// Resilient helpers for consistent timeouts, retries, and queueing
export async function runQuery<T>(
  queryFn: () => Promise<T>,
  options?: { timeoutMs?: number; retries?: number; queued?: boolean }
): Promise<T> {
  const execute = () => supabaseWithTimeout.query<T>(queryFn, options?.timeoutMs ?? 15000, options?.retries ?? 1)
  if (options?.queued === false) return execute()
  return queuedRequest.add(execute)
}

export async function callRpc<TReturn = any>(
  rpcName: string,
  args?: Record<string, any>,
  options?: { timeoutMs?: number; retries?: number; queued?: boolean }
): Promise<{ data: TReturn; error: any }> {
  const execute = async () => await supabase.rpc(rpcName, args as any)
  if (options?.queued === false) {
    return supabaseWithTimeout.query(execute, options?.timeoutMs ?? 15000, options?.retries ?? 2)
  }
  // Ensure the queued function returns a Promise
  return queuedRequest.add(async () => supabaseWithTimeout.query(execute, options?.timeoutMs ?? 15000, options?.retries ?? 2))
}

// AuthHelper for consistent auth handling across the app
export const AuthHelper = {
  // Get current user from session (cached)
  async getCurrentUser() {
    try {
      Logger.debug('auth', 'Getting current user from session')
      // This is a synchronous method that tries to get the user from the current session
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error) {
        Logger.error('auth', 'Session error', { error })
        return null
      }
      Logger.debug('auth', 'Session retrieved', { hasUser: !!session?.user })
      return session?.user || null
    } catch (error) {
      Logger.error('auth', 'Error getting current user', { error })
      return null
    }
  },

  // Get user with fallback to network call and retries
  async getUserWithFallback(timeoutMs: number = 10000, retries: number = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        Logger.debug('auth', `Getting user with fallback attempt ${attempt + 1}/${retries + 1}`)
        
        // Try to get user with timeout
        const result = await Promise.race([
          supabase.auth.getUser(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Auth getUser timeout after ${timeoutMs}ms (attempt ${attempt + 1})`)), timeoutMs)
          )
        ]) as any

        Logger.debug('auth', 'User retrieved successfully')
        return result
      } catch (error) {
        Logger.warn('auth', `Attempt ${attempt + 1} failed`, { error })
        if (attempt === retries) {
          Logger.error('auth', 'All attempts failed, returning null user')
          return { data: { user: null }, error }
        }
        // Wait before retry with exponential backoff
        const waitTime = 1000 * Math.pow(2, attempt)
        Logger.debug('auth', `Waiting ${waitTime}ms before retry`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
    return { data: { user: null }, error: new Error('All retry attempts failed') }
  }
}

// Enhanced Checkout functionality with better error handling
export const EventCheckout = {
  async checkoutFromEvent(eventId: string) {
    try {
      console.log('🔍 [CHECKOUT] Starting checkout from event:', eventId);
      
      // Use the database function we created
      const { data, error } = await callRpc('checkout_user_from_event', { p_event_id: eventId })

      if (error) {
        console.error('❌ [CHECKOUT] Error:', error);
        return {
          success: false,
          message: error.message || 'Failed to checkout from event'
        }
      }

      if (data?.success) {
        console.log('✅ [CHECKOUT] Success:', data.message);
        return {
          success: true,
          message: data.message,
          checkout_time: data.checkout_time
        }
      } else {
        console.log('⚠️ [CHECKOUT] Failed:', data?.message);
        return {
          success: false,
          message: data?.message || 'Unknown error occurred'
        }
      }
    } catch (error) {
      console.error('💥 [CHECKOUT] Unexpected error:', error);
      return {
        success: false,
        message: `Failed to checkout: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  },

  async getCheckinStatus(eventId: string) {
    try {
      // Use enhanced auth helper with timeout
      const userResult = await AuthHelper.getUserWithFallback(5000, 1)
      const user = userResult?.data?.user
      if (!user) {
        return { status: 'not_authenticated' }
      }

      // Standardize on production RPC for status
      const { data, error } = await callRpc('get_check_in_status', {
        p_event_id: eventId,
        p_user_id: user.id,
      })

      if (error || !data) {
        return { status: 'not_checked_in' }
      }

      // Map RPC response to existing consumer shape
      const isCheckedIn = !!data.checked_in
      return {
        status: isCheckedIn ? 'checked_in' : 'not_checked_in',
        checked_in_at: data.checked_in_at ?? null,
        checked_out_at: data.checked_out_at ?? null,
      }
    } catch (error) {
      console.error('❌ [CHECKOUT] Error getting checkin status:', error);
      return { status: 'error' }
    }
  },

  // Convenience alias so callers can reset all check-ins via EventCheckout
  async checkoutFromAllEvents() {
    return EventChat.checkoutFromAllEvents()
  },

  // Ensure there is no active check-in for this user for the given event
  async ensureNoActiveCheckins(eventId: string) {
    try {
      Logger.journey('checkin', 'ensureNoActive:start', { eventId })
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { success: false, message: 'Not authenticated' }

      // Attempt server-side checkout first
      try {
        const rpcRes: any = await supabase.rpc('checkout_user_from_event', { p_event_id: eventId })
        if (rpcRes?.error) {
          Logger.warn('database', 'ensureNoActive:rpcFailed', { error: rpcRes.error?.message })
        } else {
          Logger.journey('checkin', 'ensureNoActive:rpcOk')
        }
      } catch (e: any) {
        Logger.warn('database', 'ensureNoActive:rpcException', { error: e?.message || String(e) })
      }

      // Fallback: hard update any lingering active rows
      const now = new Date().toISOString()
      const { error: updateErr } = await supabase
        .from('event_checkins')
        .update({ checked_out_at: now })
        .eq('user_id', user.id)
        .eq('event_id', eventId)
        .is('checked_out_at', null)
      if (updateErr) {
        Logger.warn('database', 'ensureNoActive:updateFailed', { error: updateErr.message })
      } else {
        Logger.journey('checkin', 'ensureNoActive:updateOk')
      }

      // Verify
      const { data: stillActive, error } = await supabase
        .from('event_checkins')
        .select('id')
        .eq('user_id', user.id)
        .eq('event_id', eventId)
        .is('checked_out_at', null)
        .limit(1)

      if (error) {
        Logger.error('database', 'ensureNoActive:verifyError', { error: error.message })
        return { success: false, message: error.message }
      }
      const noneLeft = !Array.isArray(stillActive) || stillActive.length === 0
      Logger.journey('checkin', 'ensureNoActive:verify', { noneLeft })
      return { success: noneLeft, message: noneLeft ? 'No active check-ins' : 'Active check-in remains' }
    } catch (e: any) {
      Logger.error('database', 'ensureNoActive:exception', { error: e?.message || String(e) })
      return { success: false, message: e?.message || 'Unknown error' }
    }
  }
} 

// Named export alias to match dynamic import usage in UI screens
export const ensureNoActiveCheckins = EventCheckout.ensureNoActiveCheckins

// Event chat helpers: create/find the event chat room and ensure the current user is a participant
export const EventChat = {
  async ensureUserInEventChat(eventId: string, eventTitle?: string): Promise<{ chatRoomId: string, roomName: string } | null> {
    try {
      const { data: userRes } = await supabase.auth.getUser()
      const currentUserId = userRes?.user?.id
      if (!currentUserId) {
        console.warn('[EVENT_CHAT] No authenticated user while ensuring chat membership')
        return null
      }

      // 1) Find existing active chat room for this event
      const { data: existingRoom, error: findError } = await supabase
        .from('chat_rooms')
        .select('id, name, is_active')
        .eq('event_id', eventId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()

      if (findError) {
        console.error('❌ [EVENT_CHAT] Error finding chat room:', findError)
        // Continue to try creating below
      }

      let chatRoomId = existingRoom?.id as string | undefined
      let roomName = (existingRoom as any)?.name as string | undefined

      // 2) Create room if none exists
      if (!chatRoomId) {
        const proposedName = eventTitle ? `Chat for ${eventTitle}` : 'Event Chat'
        const { data: created, error: createError } = await supabase
          .from('chat_rooms')
          .insert({ event_id: eventId, name: proposedName, is_active: true })
          .select('id, name')
          .single()

        if (createError) {
          console.error('❌ [EVENT_CHAT] Error creating chat room:', createError)
          return null
        }

        chatRoomId = created.id
        roomName = (created as any).name
      }

      // 3) Ensure current user is a participant
      const { data: participant, error: participantFindError } = await supabase
        .from('chat_participants')
        .select('chat_room_id')
        .eq('chat_room_id', chatRoomId!)
        .eq('user_id', currentUserId)
        .maybeSingle()

      if (participantFindError) {
        console.error('❌ [EVENT_CHAT] Error checking participant:', participantFindError)
      }

      if (!participant) {
        const { error: participantInsertError } = await supabase
          .from('chat_participants')
          .insert({ chat_room_id: chatRoomId!, user_id: currentUserId, joined_at: new Date().toISOString() })

        if (participantInsertError) {
          console.error('❌ [EVENT_CHAT] Error adding participant:', participantInsertError)
          // Still return the room so UI can attempt navigation
        }
      }

      return { chatRoomId: chatRoomId!, roomName: roomName || 'Event Chat' }
    } catch (error) {
      console.error('💥 [EVENT_CHAT] Unexpected error ensuring chat membership:', error)
      return null
    }
  },

  async checkoutFromAllEvents() {
    try {
      // Get authenticated user
      const { data: { user }, error: authError } = await AuthHelper.getUserWithFallback(4000, 1)
      if (authError || !user) {
        return { success: false, message: authError?.message || 'Not authenticated' }
      }

      // Find all active check-ins for this user
      const { data: checkins, error: fetchError } = await supabase
        .from('event_checkins')
        .select('event_id')
        .eq('user_id', user.id)
        .is('checked_out_at', null)

      if (fetchError) {
        console.error('❌ [CHECKOUT_ALL] Error fetching check-ins:', fetchError)
        return { success: false, message: fetchError.message }
      }

      const eventIds = Array.from(new Set((checkins || []).map(c => c.event_id as string))).filter(Boolean)
      if (eventIds.length === 0) {
        return { success: true, message: 'No active check-ins found', count: 0 }
      }

      // Checkout from each event via RPC to preserve server-side logic
      const results = await Promise.allSettled(
        eventIds.map(eventId => callRpc('checkout_user_from_event', { p_event_id: eventId }))
      )

      let successCount = 0
      const errors: string[] = []
      for (const res of results) {
        if (res.status === 'fulfilled') {
          const val: any = res.value
          if (!val.error) successCount++
          else errors.push(val.error.message || 'Unknown RPC error')
        } else {
          errors.push(res.reason?.message || 'Unknown error')
        }
      }

      // If RPCs failed or none succeeded, try a direct update fallback
      if (successCount === 0 && errors.length > 0) {
        const now = new Date().toISOString()
        const { data: updatedRows, error: updateError } = await supabase
          .from('event_checkins')
          .update({ checked_out_at: now })
          .eq('user_id', user.id)
          .is('checked_out_at', null)
          .select('event_id')

        if (!updateError) {
          successCount = (updatedRows || []).length
          return { success: true, message: 'Checkout complete (fallback)', count: successCount, errors: [] }
        }
      }

      return { success: errors.length === 0, message: 'Checkout complete', count: successCount, errors }
    } catch (error) {
      console.error('💥 [CHECKOUT_ALL] Unexpected error:', error)
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' }
    }
  }
  ,
  async leaveAllEventChats() {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return { success: false, message: authError?.message || 'Not authenticated' }
      }

      // Get all group chat participations for this user
      const { data: participations, error: listError } = await supabase
        .from('chat_participants')
        .select('chat_room_id')
        .eq('user_id', user.id)

      if (listError) {
        console.error('❌ [EVENT_CHAT] Error listing participations:', listError)
        return { success: false, message: listError.message }
      }

      const chatRoomIds = Array.from(new Set((participations || []).map(p => p.chat_room_id as string))).filter(Boolean)
      if (chatRoomIds.length === 0) {
        return { success: true, message: 'No group chats to leave', count: 0 }
      }

      const { error: deleteError } = await supabase
        .from('chat_participants')
        .delete()
        .in('chat_room_id', chatRoomIds)
        .eq('user_id', user.id)

      if (deleteError) {
        console.error('❌ [EVENT_CHAT] Error leaving chats:', deleteError)
        return { success: false, message: deleteError.message }
      }

      return { success: true, message: 'Left all group chats', count: chatRoomIds.length }
    } catch (error) {
      console.error('💥 [EVENT_CHAT] Unexpected error leaving chats:', error)
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' }
    }
  }
}

// Event interest helpers: toggle, fetch counts, and fetch user interest set
export const EventInterest = {
  async toggleInterest(eventId: string): Promise<{ interested: boolean; count: number } | null> {
    try {
      const { data, error } = await callRpc('toggle_event_interest', { p_event_id: eventId })
      if (error) {
        console.error('❌ [EVENT_INTEREST] toggle RPC error:', error)
        return null
      }
      const row: any = Array.isArray(data) ? data[0] : data
      return { interested: !!row?.interested, count: Number(row?.interest_count || 0) }
    } catch (e) {
      console.error('💥 [EVENT_INTEREST] toggle exception:', e)
      return null
    }
  },

  async getUserInterestedEventIds(eventIds?: string[]): Promise<Set<string>> {
    try {
      const { data: userRes } = await supabase.auth.getUser()
      const userId = userRes?.user?.id
      if (!userId) return new Set()
      let query = supabase.from('event_interests').select('event_id').eq('user_id', userId)
      if (eventIds && eventIds.length > 0) {
        query = query.in('event_id', eventIds)
      }
      const { data, error } = await query
      if (error) {
        console.error('❌ [EVENT_INTEREST] getUserInterestedEventIds error:', error)
        return new Set()
      }
      const set = new Set<string>()
      ;(data || []).forEach((row: any) => {
        if (row?.event_id) set.add(String(row.event_id))
      })
      return set
    } catch (e) {
      console.error('💥 [EVENT_INTEREST] getUserInterestedEventIds exception:', e)
      return new Set()
    }
  },

  async getEventInterestCounts(eventIds: string[]): Promise<Record<string, number>> {
    try {
      if (!eventIds || eventIds.length === 0) return {}
      const { data, error } = await supabase
        .from('event_interests')
        .select('event_id')
        .in('event_id', Array.from(new Set(eventIds)))
      if (error) {
        console.error('❌ [EVENT_INTEREST] getEventInterestCounts error:', error)
        return {}
      }
      const counts: Record<string, number> = {}
      ;(data || []).forEach((row: any) => {
        const eid = String(row.event_id)
        counts[eid] = (counts[eid] || 0) + 1
      })
      // Ensure all eventIds present (default 0)
      for (const eid of eventIds) {
        if (!counts[eid]) counts[eid] = 0
      }
      return counts
    } catch (e) {
      console.error('💥 [EVENT_INTEREST] getEventInterestCounts exception:', e)
      return {}
    }
  },

  async getSingleEventInterestCount(eventId: string): Promise<number> {
    try {
      const { data, error } = await callRpc('get_event_interest_count', { p_event_id: eventId })
      if (error) {
        console.error('❌ [EVENT_INTEREST] getSingleEventInterestCount error:', error)
        return 0
      }
      // data can be number or array depending on RPC; normalize
      if (Array.isArray(data)) {
        const row: any = data[0]
        return Number(row?.count || row?.interest_count || 0)
      }
      return Number(data || 0)
    } catch (e) {
      console.error('💥 [EVENT_INTEREST] getSingleEventInterestCount exception:', e)
      return 0
    }
  },

  async isInterested(eventId: string): Promise<boolean> {
    try {
      const { data: userRes } = await supabase.auth.getUser()
      const userId = userRes?.user?.id
      if (!userId) return false
      const { data, error } = await supabase
        .from('event_interests')
        .select('event_id')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .maybeSingle()
      if (error) return false
      return !!data
    } catch {
      return false
    }
  }
}
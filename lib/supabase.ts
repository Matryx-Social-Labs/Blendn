// Import URL polyfill first (CRITICAL for React Native)
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { AppState } from 'react-native'
import 'react-native-url-polyfill/auto'

// Validate environment variables
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables')
  console.error('EXPO_PUBLIC_SUPABASE_URL:', !!supabaseUrl)
  console.error('EXPO_PUBLIC_SUPABASE_ANON_KEY:', !!supabaseAnonKey)
  throw new Error('Missing required Supabase environment variables')
}

console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Key (first 20 chars):', supabaseAnonKey?.substring(0, 20) + '...');

// Simple request queue to prevent network storms
class RequestQueue {
  private queue: Array<{ request: () => Promise<any>, resolve: (value: any) => void, reject: (error: any) => void }> = []
  private processing = false
  private maxConcurrent = 3
  private currentRequests = 0

  async add<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ request, resolve, reject })
      this.processQueue()
    })
  }

  private async processQueue() {
    if (this.processing || this.currentRequests >= this.maxConcurrent || this.queue.length === 0) {
      return
    }

    this.processing = true

    while (this.queue.length > 0 && this.currentRequests < this.maxConcurrent) {
      const item = this.queue.shift()
      if (item) {
        this.currentRequests++
        this.executeRequest(item)
      }
    }

    this.processing = false
  }

  private async executeRequest(item: { request: () => Promise<any>, resolve: (value: any) => void, reject: (error: any) => void }) {
    try {
      const result = await item.request()
      item.resolve(result)
    } catch (error) {
      item.reject(error)
    } finally {
      this.currentRequests--
      // Process next batch
      setTimeout(() => this.processQueue(), 100)
    }
  }
}

const requestQueue = new RequestQueue()

// Enhanced AsyncStorage wrapper with error handling
const enhancedAsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(key)
    } catch (error) {
      console.error('❌ AsyncStorage getItem error:', error)
      return null
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(key, value)
    } catch (error) {
      console.error('❌ AsyncStorage setItem error:', error)
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key)
    } catch (error) {
      console.error('❌ AsyncStorage removeItem error:', error)
    }
  }
}

// Supabase client following official React Native documentation
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: enhancedAsyncStorage,
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

// Simple request queue to prevent concurrent request storms
export const queuedRequest = {
  async add<T>(queryFn: () => Promise<T>): Promise<T> {
    return requestQueue.add(queryFn)
  }
}

// Tells Supabase Auth to continuously refresh the session automatically
// if the app is in the foreground. When this is added, you will continue
// to receive `onAuthStateChange` events with the `TOKEN_REFRESHED` or
// `SIGNED_OUT` event if the user's session is terminated. This should
// only be registered once.
let appStateListenerRegistered = false

const registerAppStateListener = () => {
  if (appStateListenerRegistered) return
  
  try {
    AppState.addEventListener('change', (state) => {
      try {
        console.log('🔄 [APP_STATE] State changed to:', state)
        if (state === 'active') {
          supabase.auth.startAutoRefresh()
        } else {
          supabase.auth.stopAutoRefresh()
        }
      } catch (error) {
        console.error('❌ [APP_STATE] Error handling state change:', error)
      }
    })
    appStateListenerRegistered = true
    console.log('✅ [APP_STATE] Listener registered successfully')
  } catch (error) {
    console.error('❌ [APP_STATE] Failed to register listener:', error)
  }
}

// Register with a small delay to ensure proper initialization
setTimeout(registerAppStateListener, 1000)

// Enhanced timeout wrapper for testing with retries
export const supabaseWithTimeout = {
  async query<T>(queryFn: () => Promise<any>, timeoutMs: number = 15000, retries: number = 2): Promise<T> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        console.log(`🔍 [TIMEOUT_WRAPPER] Query attempt ${attempt + 1}/${retries + 1}`)
        
        const result = await Promise.race([
          queryFn(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Query timeout after ${timeoutMs}ms (attempt ${attempt + 1})`)), timeoutMs)
          )
        ]) as Promise<T>
        
        console.log('✅ [TIMEOUT_WRAPPER] Query successful')
        return result
      } catch (error) {
        console.error(`❌ [TIMEOUT_WRAPPER] Attempt ${attempt + 1} failed:`, error)
        if (attempt === retries) {
          throw error
        }
        // Wait before retry with exponential backoff
        const waitTime = 1000 * Math.pow(2, attempt)
        console.log(`⏳ [TIMEOUT_WRAPPER] Waiting ${waitTime}ms before retry`)
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

// AuthHelper for consistent auth handling across the app
export const AuthHelper = {
  // Get current user from session (cached)
  async getCurrentUser() {
    try {
      console.log('🔍 [AUTH_HELPER] Getting current user from session')
      // This is a synchronous method that tries to get the user from the current session
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error) {
        console.error('❌ [AUTH_HELPER] Session error:', error)
        return null
      }
      console.log('✅ [AUTH_HELPER] Session retrieved:', !!session?.user)
      return session?.user || null
    } catch (error) {
      console.error('❌ [AUTH_HELPER] Error getting current user:', error)
      return null
    }
  },

  // Get user with fallback to network call and retries
  async getUserWithFallback(timeoutMs: number = 10000, retries: number = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        console.log(`🔍 [AUTH_HELPER] Getting user with fallback attempt ${attempt + 1}/${retries + 1}`)
        
        // Try to get user with timeout
        const result = await Promise.race([
          supabase.auth.getUser(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Auth getUser timeout after ${timeoutMs}ms (attempt ${attempt + 1})`)), timeoutMs)
          )
        ]) as any

        console.log('✅ [AUTH_HELPER] User retrieved successfully')
        return result
      } catch (error) {
        console.error(`❌ [AUTH_HELPER] Attempt ${attempt + 1} failed:`, error)
        if (attempt === retries) {
          console.error('❌ [AUTH_HELPER] All attempts failed, returning null user')
          return { data: { user: null }, error }
        }
        // Wait before retry with exponential backoff
        const waitTime = 1000 * Math.pow(2, attempt)
        console.log(`⏳ [AUTH_HELPER] Waiting ${waitTime}ms before retry`)
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
      const { data, error } = await supabase
        .rpc('checkout_user_from_event', { event_id: eventId })

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
      const { data, error } = await supabase
        .rpc('get_check_in_status', {
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
  }
} 
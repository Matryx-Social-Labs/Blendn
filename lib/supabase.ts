// Import URL polyfill first (CRITICAL for React Native)
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { AppState } from 'react-native'
import 'react-native-url-polyfill/auto'
import { Logger } from './logger'

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
        .rpc('checkout_user_from_event', { p_event_id: eventId })

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
          Logger.warn('CHECKOUT_RPC', 'ensureNoActive:rpcFailed', { error: rpcRes.error?.message })
        } else {
          Logger.journey('checkin', 'ensureNoActive:rpcOk')
        }
      } catch (e: any) {
        Logger.warn('CHECKOUT_RPC', 'ensureNoActive:rpcException', { error: e?.message || String(e) })
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
        Logger.warn('CHECKOUT_FALLBACK', 'ensureNoActive:updateFailed', { error: updateErr.message })
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
        Logger.error('CHECKOUT_VERIFY', 'ensureNoActive:verifyError', { error: error.message })
        return { success: false, message: error.message }
      }
      const noneLeft = !Array.isArray(stillActive) || stillActive.length === 0
      Logger.journey('checkin', 'ensureNoActive:verify', { noneLeft })
      return { success: noneLeft, message: noneLeft ? 'No active check-ins' : 'Active check-in remains' }
    } catch (e: any) {
      Logger.error('CHECKOUT_ENSURE', 'ensureNoActive:exception', { error: e?.message || String(e) })
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
        eventIds.map(eventId =>
          supabase.rpc('checkout_user_from_event', { p_event_id: eventId })
        )
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
      const { data, error } = await supabase.rpc('toggle_event_interest', { p_event_id: eventId })
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
      const { data, error } = await supabase.rpc('get_event_interest_count', { p_event_id: eventId })
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
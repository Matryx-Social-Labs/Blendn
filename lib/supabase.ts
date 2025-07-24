import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { AppState } from 'react-native'
import 'react-native-url-polyfill/auto'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Key (first 20 chars):', supabaseAnonKey?.substring(0, 20) + '...');

// Supabase client following official React Native documentation
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

// Tells Supabase Auth to continuously refresh the session automatically
// if the app is in the foreground. When this is added, you will continue
// to receive `onAuthStateChange` events with the `TOKEN_REFRESHED` or
// `SIGNED_OUT` event if the user's session is terminated. This should
// only be registered once.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh()
  } else {
    supabase.auth.stopAutoRefresh()
  }
})

// Simple timeout wrapper for testing (optional)
export const supabaseWithTimeout = {
  async query<T>(queryFn: () => Promise<any>, timeoutMs: number = 10000): Promise<T> {
    return Promise.race([
      queryFn(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Query timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]) as Promise<T>
  },
  
  // Add specific auth timeout wrapper
  async getUser(timeoutMs: number = 5000) {
    return Promise.race([
      supabase.auth.getUser(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Auth getUser timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]) as any
  }
}

// Checkout functionality
export const EventCheckout = {
  async checkoutFromEvent(eventId: string) {
    try {
      console.log('🔍 [CHECKOUT] Starting checkout from event:', eventId);
      
      // Get current user (no caching, direct call)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('User not authenticated')
      }

      console.log('🔍 [CHECKOUT] User ID:', user.id);

      // Check if user is currently checked in
      const { data: checkinData, error: checkinError } = await supabase
        .from('event_checkins')
        .select('*')
        .eq('user_id', user.id)
        .eq('event_id', eventId)
        .is('checked_out_at', null)
        .single()

      if (checkinError || !checkinData) {
        console.log('⚠️ [CHECKOUT] User not currently checked in to this event');
        return {
          success: false,
          message: 'You are not currently checked in to this event'
        }
      }

      console.log('✅ [CHECKOUT] Found active check-in, proceeding with checkout');

      // Update checkout time
      const { error: updateError } = await supabase
        .from('event_checkins')
        .update({ checked_out_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('event_id', eventId)
        .is('checked_out_at', null)

      if (updateError) {
        console.error('❌ [CHECKOUT] Error updating checkout time:', updateError);
        throw updateError
      }

      console.log('✅ [CHECKOUT] Successfully updated checkout time');

      // Try to remove from group chat (if exists)
      try {
        // Find the chat room for this event
        const { data: chatRoom } = await supabase
          .from('chat_rooms')
          .select('chat_room_id')
          .eq('event_id', eventId)
          .single()

        if (chatRoom) {
          console.log('🔍 [CHECKOUT] Found chat room, removing user from chat');
          
          // Remove user from chat participants
          await supabase
            .from('chat_participants')
            .delete()
            .eq('user_id', user.id)
            .eq('chat_room_id', chatRoom.chat_room_id)

          // Get user name for system message
          const { data: profile } = await supabase
            .from('profiles')
            .select('name')
            .eq('id', user.id)
            .single()

          const userName = profile?.name || 'A user'

          // Send system message
          await supabase
            .from('chat_messages')
            .insert({
              chat_room_id: chatRoom.chat_room_id,
              sender_id: 'system',
              message_text: `${userName} left the event`,
              message_type: 'system'
            })

          console.log('✅ [CHECKOUT] Removed from group chat and sent system message');
        }
      } catch (chatError) {
        console.log('⚠️ [CHECKOUT] Could not remove from chat (non-critical):', chatError);
        // Continue even if chat removal fails
      }

      return {
        success: true,
        message: 'Successfully checked out from event',
        checkout_time: new Date().toISOString()
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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return { status: 'not_authenticated' }
      }

      const { data: checkinData, error } = await supabase
        .from('event_checkins')
        .select('checked_in_at, checked_out_at')
        .eq('user_id', user.id)
        .eq('event_id', eventId)
        .order('checked_in_at', { ascending: false })
        .limit(1)
        .single()

      if (error || !checkinData) {
        return { status: 'not_checked_in' }
      }

      const status = checkinData.checked_out_at ? 'checked_out' : 'checked_in'
      
      return {
        status,
        checked_in_at: checkinData.checked_in_at,
        checked_out_at: checkinData.checked_out_at
      }
    } catch (error) {
      console.error('Error getting checkin status:', error);
      return { status: 'error' }
    }
  }
} 
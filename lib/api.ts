/**
 * API Migration Helper
 *
 * This module provides a unified API layer that can switch between
 * Supabase (legacy) and the new admin backend API.
 *
 * Set EXPO_PUBLIC_USE_API_BACKEND=true to use the new backend.
 */

import { apiClient } from './apiClient'
import { supabase, callRpc, EventInterest, EventCheckout, EventChat } from './supabase'
import { Logger } from './logger'

// Feature flag for gradual migration
const USE_API_BACKEND = process.env.EXPO_PUBLIC_USE_API_BACKEND === 'true'

Logger.info('api', `Using ${USE_API_BACKEND ? 'admin backend' : 'Supabase'} for API calls`)

// ============== EVENTS ==============

interface EventsParams {
  page?: number
  limit?: number
  search?: string
  lat?: number
  lon?: number
  radius?: number
  categoryId?: string
  categorySlug?: string
  startDate?: string
  endDate?: string
  status?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export async function getEvents(params?: EventsParams) {
  if (USE_API_BACKEND) {
    const result = await apiClient.getEvents(params)
    if (result.success && result.data) {
      return { data: result.data.events, error: null }
    }
    return { data: null, error: { message: result.error || 'Failed to fetch events' } }
  }

  // Legacy Supabase approach
  let query = supabase
    .from('events_now_or_upcoming')
    .select('*')
    .order('start_time', { ascending: true })

  if (params?.limit) {
    const from = (params.page || 0) * params.limit
    query = query.range(from, from + params.limit - 1)
  }

  const { data, error } = await query
  return { data, error }
}

export async function getEvent(eventId: string, params?: { lat?: number; lon?: number }) {
  if (USE_API_BACKEND) {
    const result = await apiClient.getEvent(eventId, params)
    if (result.success && result.data) {
      return { data: result.data, error: null }
    }
    return { data: null, error: { message: result.error || 'Failed to fetch event' } }
  }

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single()
  return { data, error }
}

// ============== CHECK-IN ==============

export async function checkInToEvent(
  eventId: string,
  userId: string,
  latitude: number,
  longitude: number,
  gpsAccuracy?: number
) {
  if (USE_API_BACKEND) {
    const result = await apiClient.checkIn(eventId, {
      latitude,
      longitude,
      deviceInfo: { gpsAccuracy },
    })
    if (result.success) {
      return { data: { success: true, message: 'Checked in successfully' }, error: null }
    }
    return { data: null, error: { message: result.error || 'Check-in failed' } }
  }

  // Legacy RPC call
  const { data, error } = await callRpc('check_in_to_event_production', {
    p_event_id: eventId,
    p_user_id: userId,
    p_user_latitude: latitude,
    p_user_longitude: longitude,
    p_gps_accuracy: gpsAccuracy || 50,
  })
  return { data, error }
}

export async function checkOutFromEvent(eventId: string) {
  if (USE_API_BACKEND) {
    const result = await apiClient.checkOut(eventId)
    if (result.success) {
      return { success: true, message: 'Checked out successfully' }
    }
    return { success: false, message: result.error || 'Checkout failed' }
  }

  return EventCheckout.checkoutFromEvent(eventId)
}

export async function getCheckinStatus(eventId: string) {
  if (USE_API_BACKEND) {
    // For API backend, we'd need to get this from the event detail
    // For now, use legacy approach
  }
  return EventCheckout.getCheckinStatus(eventId)
}

// ============== INTERESTS/FAVORITES ==============

export async function toggleEventInterest(eventId: string) {
  if (USE_API_BACKEND) {
    const result = await apiClient.toggleInterest(eventId)
    if (result.success && result.data) {
      return result.data
    }
    return null
  }

  return EventInterest.toggleInterest(eventId)
}

export async function getUserInterestedEventIds(eventIds?: string[]) {
  if (USE_API_BACKEND) {
    // Would need a batch endpoint for this
    // For now, use legacy
  }
  return EventInterest.getUserInterestedEventIds(eventIds)
}

export async function getEventInterestCounts(eventIds: string[]) {
  if (USE_API_BACKEND) {
    // Would need a batch endpoint
    // For now, use legacy
  }
  return EventInterest.getEventInterestCounts(eventIds)
}

// ============== CHAT ==============

export async function ensureUserInEventChat(eventId: string, eventTitle?: string) {
  if (USE_API_BACKEND) {
    const result = await apiClient.getEventChat(eventId)
    if (result.success && result.data) {
      return {
        chatRoomId: result.data.id,
        roomName: result.data.name || 'Event Chat',
      }
    }
    return null
  }

  return EventChat.ensureUserInEventChat(eventId, eventTitle)
}

export async function sendChatMessage(
  chatGroupId: string,
  content: string,
  type: 'text' | 'image' | 'video' = 'text',
  metadata?: any
) {
  if (USE_API_BACKEND) {
    const result = await apiClient.sendChatMessage(chatGroupId, content, type, metadata)
    if (result.success) {
      return { data: result.data, error: null }
    }
    return { data: null, error: { message: result.error || 'Failed to send message' } }
  }

  // Legacy Supabase insert
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: { message: 'Not authenticated' } }
  }

  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      chat_group_id: chatGroupId,
      user_id: user.id,
      content,
      type,
      metadata,
    })
    .select()
    .single()

  return { data, error }
}

export async function getChatMessages(chatGroupId: string, params?: { limit?: number; before?: string }) {
  if (USE_API_BACKEND) {
    const result = await apiClient.getChatMessages(chatGroupId, params)
    if (result.success && result.data) {
      return { data: result.data, error: null }
    }
    return { data: null, error: { message: result.error || 'Failed to fetch messages' } }
  }

  // Legacy Supabase query
  let query = supabase
    .from('chat_messages')
    .select('*, user:users(id, name, image)')
    .eq('chat_group_id', chatGroupId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(params?.limit || 50)

  if (params?.before) {
    const beforeMessage = await supabase
      .from('chat_messages')
      .select('created_at')
      .eq('id', params.before)
      .single()

    if (beforeMessage.data) {
      query = query.lt('created_at', beforeMessage.data.created_at)
    }
  }

  const { data, error } = await query
  return { data: data?.reverse() || [], error }
}

// ============== PROFILE ==============

export async function getProfile(userId: string) {
  if (USE_API_BACKEND) {
    const result = await apiClient.getProfile(userId)
    if (result.success && result.data) {
      return { data: result.data, error: null }
    }
    return { data: null, error: { message: result.error || 'Failed to fetch profile' } }
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*, user:users(id, email, name, image)')
    .eq('id', userId)
    .single()
  return { data, error }
}

export async function updateProfile(
  userId: string,
  updates: {
    name?: string
    phone?: string
    age?: number
    location?: string
    interests?: string[]
    onboarded?: boolean
  }
) {
  if (USE_API_BACKEND) {
    const result = await apiClient.updateProfile(userId, updates)
    if (result.success && result.data) {
      return { data: result.data, error: null }
    }
    return { data: null, error: { message: result.error || 'Failed to update profile' } }
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single()
  return { data, error }
}

// ============== NOTIFICATIONS ==============

export async function registerPushToken(token: string, platform: 'ios' | 'android') {
  if (USE_API_BACKEND) {
    const result = await apiClient.registerPushToken(token, platform)
    return result.success
  }

  // Legacy: Store in profiles table or similar
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { error } = await supabase
    .from('profiles')
    .update({ push_token: token })
    .eq('id', user.id)

  return !error
}

// ============== CATEGORIES ==============

export async function getCategories() {
  if (USE_API_BACKEND) {
    const result = await apiClient.getCategories()
    if (result.success && result.data) {
      return { data: result.data, error: null }
    }
    return { data: null, error: { message: result.error || 'Failed to fetch categories' } }
  }

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .is('parent_id', null)
    .order('name')

  return { data, error }
}

// Export flag for consumers to check
export { USE_API_BACKEND }

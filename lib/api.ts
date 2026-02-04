/**
 * API Helper
 *
 * This module provides a unified API layer using the admin backend API.
 * Supabase has been deprecated and removed.
 */

import { apiClient } from './apiClient'
import { Logger } from './logger'

Logger.info('api', 'Using admin backend for API calls')

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
  include?: string
}

export async function getEvents(params?: EventsParams) {
  // API expects page starting from 1, not 0
  const apiParams = params ? {
    ...params,
    page: (params.page || 0) + 1,
  } : { page: 1 }
  const result = await apiClient.getEvents(apiParams)
  if (result.success && result.data) {
    // Transform API response (camelCase) to mobile format (snake_case)
    const events = result.data.events.map((e: any) => ({
      id: e.id,
      title: e.title,
      description: e.description || '',
      short_description: e.shortDescription || '',
      venue_name: e.venueName || '',
      address: e.address || '',
      start_time: e.startTime,
      end_time: e.endTime,
      price_cents: e.priceCents || 0,
      max_capacity: e.maxCapacity || 0,
      current_capacity: e.currentCapacity || 0,
      cover_image_url: e.coverImageUrl || null,
      category: e.categories?.[0]?.name || e.category || '',
      city: e.city,
      check_in_radius: e.checkInRadius || 100,
      latitude: e.latitude,
      longitude: e.longitude,
      distance: e.distance,
      media: Array.isArray(e.media) ? e.media : [],
      is_favorited: e.isFavorited === true,
      favorite_count: typeof e.favoriteCount === 'number' ? e.favoriteCount : 0,
      user_checkin: e.userCheckin || null,
      interested_preview: Array.isArray(e.interestedPreview) ? e.interestedPreview : [],
    }))
    return {
      data: events,
      meta: {
        activeCheckins: result.data.activeCheckins,
        profile: result.data.profile,
      },
      error: null,
    }
  }
  return { data: null, error: { message: result.error || 'Failed to fetch events' } }
}

export async function getEvent(eventId: string, params?: { lat?: number; lon?: number }) {
  const result = await apiClient.getEvent(eventId, params)
  if (result.success && result.data) {
    return { data: result.data, error: null }
  }
  return { data: null, error: { message: result.error || 'Failed to fetch event' } }
}

// ============== CHECK-IN ==============

export async function checkInToEvent(
  eventId: string,
  _userId: string,
  latitude: number,
  longitude: number,
  gpsAccuracy?: number
) {
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

export async function checkOutFromEvent(eventId: string) {
  const result = await apiClient.checkOut(eventId)
  if (result.success) {
    return { success: true, message: 'Checked out successfully' }
  }
  return { success: false, message: result.error || 'Checkout failed' }
}

export async function getCheckinStatus(eventId: string) {
  // Get check-in status from batch endpoint
  const result = await apiClient.getBatchCheckinStatuses([eventId])
  if (result.success && result.data?.statuses?.[eventId]) {
    const status = result.data.statuses[eventId]
    return {
      status: status.status === 'checked_in' ? 'checked_in' : 'not_checked_in',
      checked_in_at: status.checkInTime || null,
      checked_out_at: null,
    }
  }
  return { status: 'not_checked_in' }
}

// ============== INTERESTS/FAVORITES ==============

export async function toggleEventInterest(eventId: string) {
  const result = await apiClient.toggleInterest(eventId)
  if (result.success && result.data) {
    return result.data
  }
  return null
}

export async function getUserInterestedEventIds(eventIds?: string[]) {
  if (!eventIds || eventIds.length === 0) {
    return new Set<string>()
  }
  const result = await apiClient.getBatchInterestStatuses(eventIds)
  if (result.success && result.data?.interests) {
    const set = new Set<string>()
    Object.entries(result.data.interests).forEach(([eventId, interested]) => {
      if (interested) set.add(eventId)
    })
    return set
  }
  return new Set<string>()
}

export async function getEventInterestCounts(eventIds: string[]) {
  if (!eventIds || eventIds.length === 0) {
    return {}
  }
  const result = await apiClient.getBatchInterestCounts(eventIds)
  if (result.success && result.data?.counts) {
    return result.data.counts
  }
  return {}
}

// ============== CHAT ==============

export async function ensureUserInEventChat(eventId: string, _eventTitle?: string) {
  const result = await apiClient.getEventChat(eventId)
  if (result.success && result.data) {
    return {
      chatRoomId: result.data.id,
      roomName: result.data.name || 'Event Chat',
    }
  }
  return null
}

export async function sendChatMessage(
  chatGroupId: string,
  content: string,
  type: 'text' | 'image' | 'video' = 'text',
  metadata?: any
) {
  const result = await apiClient.sendChatMessage(chatGroupId, content, type, metadata)
  if (result.success) {
    return { data: result.data, error: null }
  }
  return { data: null, error: { message: result.error || 'Failed to send message' } }
}

export async function getChatMessages(chatGroupId: string, params?: { limit?: number; before?: string }) {
  const result = await apiClient.getChatMessages(chatGroupId, params)
  if (result.success && result.data) {
    return { data: result.data, error: null }
  }
  return { data: null, error: { message: result.error || 'Failed to fetch messages' } }
}

// ============== PROFILE ==============

export async function getProfile(userId: string) {
  const result = await apiClient.getProfile(userId)
  if (result.success && result.data) {
    return { data: result.data, error: null }
  }
  return { data: null, error: { message: result.error || 'Failed to fetch profile' } }
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
  const result = await apiClient.updateProfile(userId, updates)
  if (result.success && result.data) {
    return { data: result.data, error: null }
  }
  return { data: null, error: { message: result.error || 'Failed to update profile' } }
}

// ============== NOTIFICATIONS ==============

export async function registerPushToken(token: string, platform: 'ios' | 'android') {
  const result = await apiClient.registerPushToken(token, platform)
  return result.success
}

// ============== CATEGORIES ==============

export async function getCategories() {
  const result = await apiClient.getCategories()
  if (result.success && result.data) {
    return { data: result.data, error: null }
  }
  return { data: null, error: { message: result.error || 'Failed to fetch categories' } }
}

// Export flag for consumers to check (always true now)
export const USE_API_BACKEND = true

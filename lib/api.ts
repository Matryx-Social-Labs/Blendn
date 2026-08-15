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
  /** Scopes the list to one city. Values come from `apiClient.getEventCities()`. */
  city?: string
  lat?: number
  lon?: number
  /** A hard cut in km. Omit it for browsing — see `apiClient.getEvents`. */
  radius?: number
  categoryId?: string
  categorySlug?: string
  startDate?: string
  endDate?: string
  status?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  include?: string
  interestedPreviewLimit?: number
}

/** The server's own event shape, so the mapper below cannot drift from it. */
type EventPayload = NonNullable<
  Awaited<ReturnType<typeof apiClient.getEvents>>["data"]
>["events"][number]

/**
 * One server event, in the shape the app holds.
 *
 * Extracted from `getEvents` because it had been copied: two more sites in
 * `app/(tabs)/events.tsx` built the same object by hand from the active
 * check-ins payload, and they disagreed with each other. One kept the
 * coordinates, the other wrote `latitude: 0, longitude: 0` — the Gulf of
 * Guinea — and both called `setCheckedInEvents`, so whether a checked-in card
 * could compute a distance depended on which one had run last.
 *
 * Return type is inferred rather than annotated, because `BlendnEvent` is
 * defined *as* the return type; annotating it here would be circular.
 */
export function eventFromApi(e: EventPayload) {
  return {
      id: e.id,
      title: e.title,
      description: e.description || '',
      short_description: e.shortDescription || '',
      venue_name: e.venueName || '',
      address: e.address || '',
      start_time: e.startTime,
      end_time: e.endTime,
      timezone: e.timezone || 'UTC',
      price_cents: e.priceCents || 0,
      max_capacity: e.maxCapacity || 0,
      current_capacity: e.currentCapacity || 0,
      cover_image_url: e.coverImageUrl || null,
      category: e.categories?.[0]?.name || e.category || '',
      /*
       * The family this event belongs to, from the server's taxonomy.
       *
       * Events are tagged to leaves, so `category` is "Classical and Carnatic"
       * and grouping on it can only ever match that one leaf. The parent slug
       * is what "everything musical" means, and it comes from the same tree the
       * interest picker uses rather than from reading the leaf's name.
       *
       * Falls back to the leaf's own slug when the category is top level, so a
       * caller can group on this field alone without special-casing.
       */
      category_group: e.categories?.[0]?.parent?.slug || e.categories?.[0]?.slug || '',
      city: e.city,
      check_in_radius: e.checkInRadius || 100,
      latitude: e.latitude ?? null,
      longitude: e.longitude ?? null,
      distance: e.distance,
      media: Array.isArray(e.media) ? e.media : [],
      is_favorited: e.isFavorited === true,
      favorite_count: typeof e.favoriteCount === 'number' ? e.favoriteCount : 0,
      user_checkin: e.userCheckin || null,
    }
}

export async function getEvents(params?: EventsParams, options?: { force?: boolean }) {
  // API expects page starting from 1, not 0
  const apiParams = params ? {
    ...params,
    page: (params.page || 0) + 1,
  } : { page: 1 }
  const result = await apiClient.getEvents(apiParams, { force: !!options?.force })
  Logger.info('api', 'getEvents raw result', {
    success: result.success,
    eventCount: result.data?.events?.length || 0,
    firstEvent: result.data?.events?.[0] ? {
      id: result.data.events[0].id,
      title: result.data.events[0].title,
      coverImageUrl: result.data.events[0].coverImageUrl,
    } : null
  })
  if (result.success && result.data) {
    // Transform API response (camelCase) to mobile format (snake_case)
    const events = result.data.events.map(eventFromApi)
    Logger.info('api', 'getEvents transformed', {
      eventCount: events.length,
      firstEvent: events[0] ? {
        id: events[0].id,
        title: events[0].title,
        cover_image_url: events[0].cover_image_url,
        venue_name: events[0].venue_name,
      } : null
    })
    return {
      data: events,
      meta: {
        activeCheckins: result.data.activeCheckins,
        profile: result.data.profile,
      },
      error: null,
    }
  }
  Logger.warn('api', 'getEvents failed', { error: result.error })
  return { data: null, error: { message: result.error || 'Failed to fetch events' } }
}

/**
 * One event, in the shape the app actually holds.
 *
 * Derived from `getEvents` rather than hand-written, because it was
 * hand-written three times — `app/(tabs)/events.tsx`, `app/nearby-events.tsx`
 * and `components/EventCard.tsx` each declared their own `Event`, and they are
 * passed to each other, so TypeScript compared them structurally and they had
 * already drifted. Correcting a single field in one of them produced
 * `Type 'Event' is not assignable to type 'Event'` and broke a call site three
 * files away, which is why the drift was left standing instead of fixed.
 *
 * Deriving means the mapping above is the single definition. A field added
 * there appears here; a field whose nullability changes there becomes a
 * compile error at whichever consumer was assuming otherwise, which is exactly
 * where the error belongs.
 */
type MappedEvent = ReturnType<typeof eventFromApi>

export interface BlendnEvent extends MappedEvent {
  /**
   * The city to print on a card, resolved client-side by `resolveDisplayCity`.
   * Never sent by the API — `city` is, and it can be a raw coordinate pair on
   * older rows, which is what that function exists to filter out.
   */
  display_city?: string
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
  metadata?: Record<string, unknown>
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

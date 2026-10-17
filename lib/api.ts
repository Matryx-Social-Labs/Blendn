/**
 * The event list in the shape the app holds: `getEvents` over `apiClient`, and
 * the camelCase → snake_case mapper. Everything else calls `apiClient` directly.
 */

import { apiClient } from './apiClient'
import { sessionFromApi } from './eventSession'
import { Logger } from './logger'

type EventsParams = NonNullable<Parameters<typeof apiClient.getEvents>[0]>

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
      /** The linked venue the card names ("at …"), or null — `placeLabel`. */
      venue: e.venue ?? null,
      address: e.address || '',
      start_time: e.startTime,
      end_time: e.endTime,
      /** Judge LIVE by this, not the run above — `lib/eventSession.ts`. */
      session: sessionFromApi(e.session),
      timezone: e.timezone || 'UTC',
      price_cents: e.priceCents || 0,
      max_capacity: e.maxCapacity || 0,
      /** Distinct people checked in: the "here now" count, not going. */
      current_capacity: e.currentCapacity || 0,
      /** Inside now (the Room's rule), for "N here now"; null from an older server: no line, not a wrong number. */
      here_count: typeof e.hereCount === 'number' ? e.hereCount : null,
      /** RSVPs going; null from a server that does not send it yet. */
      going_count: typeof e.goingCount === 'number' ? e.goingCount : null,
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
  if (result.success && result.data) {
    // Transform API response (camelCase) to mobile format (snake_case)
    const events = result.data.events.map(eventFromApi)
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

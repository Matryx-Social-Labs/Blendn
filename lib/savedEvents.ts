/**
 * The Going tab's rows, from `GET /users/:id/favorites`.
 *
 * The server sends `{ events, timeFilter, pagination }`. The screen read
 * `result.data` as the array itself, `.map` threw, the `catch` swallowed it,
 * and the tab showed "No saved events yet" to everyone with saves — while the
 * Me tab beside it counted them (SCRUM-175). This is the one place the shape
 * is read, and the test feeds it the real payload.
 */

import { feedPoster, type EventMediaItem } from './feedMedia'

export interface SavedEventRow {
  id: string
  title: string
  venue_name: string
  address: string
  start_time: string
  end_time: string
  /**
   * What the card draws: the cover, else the event's first media item as the
   * Pulse would poster it (SCRUM-286). Null means the placeholder.
   */
  cover_image_url: string | null
  latitude: number
  longitude: number
  /** `cancelled` stays in the list — history — and the card must say so. */
  status: 'published' | 'cancelled' | 'completed' | 'draft'
}

export interface SavedEventsPayload {
  events: {
    id: string
    title: string
    venueName?: string | null
    address?: string | null
    startTime: string
    endTime: string
    coverImageUrl?: string | null
    /** The event's first `event_media` row, or null. */
    coverImage?: EventMediaItem | null
    latitude?: number | null
    longitude?: number | null
    status: SavedEventRow['status']
  }[]
  pagination?: { page: number; totalCount: number; hasMore: boolean }
}

export function savedEventRows(data: SavedEventsPayload | undefined | null): SavedEventRow[] {
  if (!data || !Array.isArray(data.events)) return []
  return data.events.map((e) => ({
    id: e.id,
    title: e.title,
    venue_name: e.venueName ?? '',
    address: e.address ?? '',
    start_time: e.startTime,
    end_time: e.endTime,
    cover_image_url: feedPoster(e.coverImage ? [e.coverImage] : null, e.coverImageUrl),
    latitude: e.latitude ?? NaN,
    longitude: e.longitude ?? NaN,
    status: e.status,
  }))
}

// ---------------------------------------------------------------------------
// The rest of the Going tab: what you are going to, and what you went to.
// ---------------------------------------------------------------------------

/**
 * `GET /me/rsvps` — the favourites route's event fields plus the RSVP.
 * Only `going` and `waitlisted` come back.
 */
export interface RsvpEventsPayload {
  events: (SavedEventsPayload['events'][number] & { rsvpStatus: 'going' | 'waitlisted' })[]
  pagination?: { page: number; totalCount: number; hasMore: boolean }
}

export type RsvpEventRow = SavedEventRow & { rsvpStatus: 'going' | 'waitlisted' }

export function rsvpEventRows(data: RsvpEventsPayload | undefined | null): RsvpEventRow[] {
  if (!data || !Array.isArray(data.events)) return []
  const rows = savedEventRows({ events: data.events })
  return rows.map((row, i) => ({ ...row, rsvpStatus: data.events[i].rsvpStatus }))
}

/** `GET /me/attendance` — snake_case, unlike the two above; it is its own route. */
export interface AttendancePayload {
  events: {
    id: string
    title: string
    cover_image_url: string | null
    start_time: string
    end_time: string
    venue_name: string | null
    city: string | null
    attendedAt: string
  }[]
  pagination?: { page: number; totalCount: number; hasMore: boolean }
}

export interface PastEventRow {
  id: string
  title: string
  venue_name: string
  start_time: string
  end_time: string
  cover_image_url: string | null
}

export type GoingItem =
  | { kind: 'header'; key: string; title: string }
  | { kind: 'going'; key: string; row: RsvpEventRow }
  | { kind: 'saved'; key: string; row: SavedEventRow }
  | { kind: 'past'; key: string; row: PastEventRow }

/**
 * The Going tab, top to bottom.
 *
 * **Going** — what you said yes to, soonest first. The tab was named for this
 * and listed only hearts, so somebody who tapped "I'm going" did not find the
 * event under Going. **Saved** — the hearts, minus anything already under
 * Going: one event, one card. **Past** — events you attended that have ended,
 * which is where "rate the people you met" lives; `rate/[eventId]` was reachable
 * only by reopening an old event.
 *
 * A section with nothing in it is left out, header and all.
 */
export function goingItems(
  going: RsvpEventRow[],
  saved: SavedEventRow[],
  attended: AttendancePayload['events'],
  now: number = Date.now()
): GoingItem[] {
  const goingIds = new Set(going.map((r) => r.id))
  const savedOnly = saved.filter((r) => !goingIds.has(r.id))
  const past: PastEventRow[] = attended
    .filter((e) => new Date(e.end_time).getTime() < now)
    .map((e) => ({
      id: e.id,
      title: e.title,
      venue_name: e.venue_name ?? '',
      start_time: e.start_time,
      end_time: e.end_time,
      cover_image_url: e.cover_image_url,
    }))

  const items: GoingItem[] = []
  if (going.length) {
    items.push({ kind: 'header', key: 'h:going', title: 'Going' })
    for (const row of going) items.push({ kind: 'going', key: `g:${row.id}`, row })
  }
  if (savedOnly.length) {
    items.push({ kind: 'header', key: 'h:saved', title: 'Saved' })
    for (const row of savedOnly) items.push({ kind: 'saved', key: `s:${row.id}`, row })
  }
  if (past.length) {
    items.push({ kind: 'header', key: 'h:past', title: 'Past' })
    for (const row of past) items.push({ kind: 'past', key: `p:${row.id}`, row })
  }
  return items
}

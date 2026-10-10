/**
 * The Going tab's rows, from `GET /users/:id/favorites`.
 *
 * The server sends `{ events, timeFilter, pagination }`. The screen read
 * `result.data` as the array itself, `.map` threw, the `catch` swallowed it,
 * and the tab showed "No saved events yet" to everyone with saves — while the
 * Me tab beside it counted them (SCRUM-175). This is the one place the shape
 * is read, and the test feeds it the real payload.
 */

import { sessionFromApi, type EventSession } from './eventSession'
import { feedPoster, type EventMediaItem } from './feedMedia'
import { groupByDay } from './pulse'

export interface SavedEventRow {
  id: string
  title: string
  venue_name: string
  /** The fallback place when the venue is unnamed — see `placeLabel`. */
  city: string | null
  address: string
  start_time: string
  end_time: string
  /** The day "Happening now" is judged by — `lib/eventSession.ts`. */
  session?: EventSession | null
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
    /** Both routes send it; optional so an older server still maps. */
    city?: string | null
    address?: string | null
    startTime: string
    endTime: string
    /** `/me/rsvps` sends it; the favourites route and older servers do not. */
    session?: { startTime: string; endTime: string } | null
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
    city: e.city ?? null,
    address: e.address ?? '',
    start_time: e.startTime,
    end_time: e.endTime,
    session: sessionFromApi(e.session),
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
  /**
   * Older nights hidden behind Blendn+ (step 11): 0 when the city is not gated
   * or you have Plus. When locked, `events` holds at most the latest 3 nights.
   * Absent from an older server.
   */
  lockedCount?: number
}

export interface PastEventRow {
  id: string
  title: string
  venue_name: string
  /** The fallback place when the venue is unnamed — see `placeLabel`. */
  city: string | null
  start_time: string
  end_time: string
  cover_image_url: string | null
}

/**
 * Events you attended that have ended, most recent first as the server sends
 * them. Shared by the Going tab's Past section and the Me tab's Recent list, so
 * the two can never disagree about what counts as "past".
 */
export function pastEventRows(
  attended: AttendancePayload['events'] | undefined | null,
  now: number = Date.now()
): PastEventRow[] {
  if (!Array.isArray(attended)) return []
  return attended
    .filter((e) => new Date(e.end_time).getTime() < now)
    .map((e) => ({
      id: e.id,
      title: e.title,
      venue_name: e.venue_name ?? '',
      city: e.city ?? null,
      start_time: e.start_time,
      end_time: e.end_time,
      cover_image_url: e.cover_image_url,
    }))
}

export type GoingItem =
  | { kind: 'next'; key: string; row: RsvpEventRow }
  | { kind: 'day'; key: string; title: string; weekday: string }
  | { kind: 'going'; key: string; row: RsvpEventRow }
  | { kind: 'header'; key: string; title: string }
  | { kind: 'saved'; key: string; row: SavedEventRow }
  | { kind: 'past'; key: string; row: PastEventRow }
  /** "{n} more nights with Blendn+" — the paywall's `recap` door. */
  | { kind: 'locked'; key: string; count: number }

/**
 * The Going tab, top to bottom.
 *
 * **Next up** — the soonest RSVP, as the one large card: the event you are
 * about to leave the house for, with its directions, calendar and share. **The
 * rest of your RSVPs** — under day headings, one row each, the way the Pulse's
 * Upcoming reads. The tab was named for these and once listed only hearts, so
 * somebody who tapped "I'm going" did not find the event under Going. There is
 * no "Going" heading over them: the screen's title already says it.
 * **Saved** — the hearts, minus anything already under Going: one event, one
 * row. **Past** — events you attended that have ended, which is where "rate
 * the people you met" lives; `rate/[eventId]` was reachable only by reopening
 * an old event.
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
  const past = pastEventRows(attended, now)

  const items: GoingItem[] = []
  const [next, ...rest] = going
  if (next) items.push({ kind: 'next', key: `n:${next.id}`, row: next })
  for (const day of groupByDay(rest, new Date(now))) {
    items.push({ kind: 'day', key: `d:${day.key}`, title: day.title, weekday: day.weekday })
    for (const row of day.items) items.push({ kind: 'going', key: `g:${row.id}`, row })
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

/**
 * The nights the server kept behind Blendn+ (`lockedCount`), as one row after
 * Past — under a Past heading of its own when none of the 3 shown has ended.
 */
export function withLockedNights(items: GoingItem[], lockedCount: number | null | undefined): GoingItem[] {
  if (!lockedCount || lockedCount <= 0) return items
  const header: GoingItem[] = items.some((i) => i.key === 'h:past') ? [] : [{ kind: 'header', key: 'h:past', title: 'Past' }]
  return [...items, ...header, { kind: 'locked', key: 'locked', count: lockedCount }]
}

export function lockedNightsLabel(count: number): string {
  return `${count} more night${count === 1 ? '' : 's'} with Blendn+`
}

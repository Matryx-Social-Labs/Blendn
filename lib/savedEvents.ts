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
import type { ChangedField } from './eventChange'
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
  /**
   * What moved under you while you were going (Flow 3 · 3.1 frame 03): the time or the venue, as the detail route says it
   * (`changedFields`). The list routes do not send it yet, so it is `[]` until they do and no row says "New time" before then.
   */
  changed?: ChangedField[]
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
    /** What the detail route sends (`changedFields`); the list routes may carry it beside it. Absent from the server today. */
    changedFields?: ChangedField[] | null
  }[]
  pagination?: { page: number; totalCount: number; hasMore: boolean; nextCursor?: string | null }
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
    changed: Array.isArray(e.changedFields) ? e.changedFields.filter((f) => f === 'time' || f === 'venue') : [],
  }))
}

/**
 * The tag a Going row wears when the night moved (frame 03): "New time", or "New venue" when only the place did. A cancel is
 * the row's own "Cancelled", so it is no tag here.
 */
export function changedTag(row: Pick<SavedEventRow, 'changed' | 'status'>): 'New time' | 'New venue' | null {
  if (row.status === 'cancelled') return null
  if (row.changed?.includes('time')) return 'New time'
  return row.changed?.includes('venue') ? 'New venue' : null
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
  pagination?: { page: number; totalCount: number; hasMore: boolean; nextCursor?: string | null }
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
    /** `venue_day` is a visit to a place you went live at; its `title` is bookkeeping, its `venue_name` the place (blendn-admin D-6). */
    kind?: 'event' | 'venue_day'
    /**
     * How long you were there, in minutes, and the place's own id (for its page): neither is on the route yet, so a visit says
     * its date alone and opens nothing until they are. Read from these names when the server sends them.
     */
    stay_minutes?: number | null
    venue_id?: string | null
    /** `venue_type` (a plate's type, when the server says what kind of place it was). */
    venue_type?: string | null
    /** When you rated the night, or null: sent by the list once the server has it (absent today, and then each row is asked). */
    ratedAt?: string | null
  }[]
  pagination?: { page: number; totalCount: number; hasMore: boolean; nextCursor?: string | null }
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
  /** A visit to a place you went live at, not an event: it reads "Live here · 28 Sep" under the place's name. */
  visit?: { attendedAt: string; stayMinutes: number | null; venueId: string | null; venueType: string | null }
}

/** "40m", "1h 40m", "2h": how long a visit lasted, or null when the server did not say. */
export function stayLabel(minutes: number | null | undefined): string | null {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 1) return null
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`
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
    .map((e): PastEventRow => ({
      id: e.id,
      // A visit is named for the place: its own title is the venue day's bookkeeping.
      title: e.kind === 'venue_day' && e.venue_name ? e.venue_name : e.title,
      venue_name: e.venue_name ?? '',
      city: e.city ?? null,
      start_time: e.start_time,
      end_time: e.end_time,
      cover_image_url: e.cover_image_url,
      ...(e.kind === 'venue_day' && {
        visit: { attendedAt: e.attendedAt || e.start_time, stayMinutes: e.stay_minutes ?? null, venueId: e.venue_id ?? null, venueType: e.venue_type ?? null },
      }),
    }))
}

export type GoingItem =
  | { kind: 'next'; key: string; row: RsvpEventRow }
  | { kind: 'day'; key: string; title: string; weekday: string }
  | { kind: 'going'; key: string; row: RsvpEventRow }
  | { kind: 'header'; key: string; title: string; /** The server's true count, when it is more than the rows held. */ count?: number }
  | { kind: 'saved'; key: string; row: SavedEventRow }
  | { kind: 'past'; key: string; row: PastEventRow }
  /** "{n} more nights with Blendn+" — the paywall's `recap` door. */
  | { kind: 'locked'; key: string; count: number }
  /** The end of a section the server has more of: "{n} more", said honestly, and what it is doing. */
  | { kind: 'more'; key: string; section: 'going' | 'saved' | 'past'; remaining: number; busy: boolean; failed: boolean }

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

/**
 * What Going did to a save that a read may not have seen yet: saved again
 * (Undo) or removed, and the newest load id when the request settled
 * (`Infinity` while it is out). A load started at or before that id may
 * carry the old answer; one started after it is the server's truth.
 */
export type PendingSave = { saved: boolean; row: SavedEventRow; settledAt: number }

/**
 * The saved rows a load returned, with this screen's own changes laid over
 * any the load could not have seen. Entries a newer load has caught up with
 * are dropped from `pending` (it is the screen's ref, mutated in place).
 */
export function withPendingSaves(rows: SavedEventRow[], pending: Map<string, PendingSave>, loadId: number): SavedEventRow[] {
  let out = rows
  for (const [id, op] of pending) {
    if (loadId > op.settledAt) {
      pending.delete(id)
      continue
    }
    const listed = out.some((r) => r.id === id)
    if (op.saved && !listed) out = [op.row, ...out]
    else if (!op.saved && listed) out = out.filter((r) => r.id !== id)
  }
  return out
}

/**
 * Which of a page of past nights say whether they were rated, and which must be asked one by one.
 *
 * The list sends `ratedAt` (a time, or null for "not rated") once the server has it: then the page already knows and nothing is
 * asked. Until then each night is a read of its own, so the ones asked are the first `cap` that are not visits (a visit has
 * nothing to rate), not already known rated here, and not already asked this session (`asked`).
 */
export function ratingsToRead(
  nights: AttendancePayload['events'],
  cap: number,
  isKnownRated: (id: string) => boolean,
  asked: ReadonlySet<string>
): { rated: string[]; ask: string[] } {
  const rated: string[] = []
  const ask: string[] = []
  for (const n of nights) {
    if (n.kind === 'venue_day') continue
    if (typeof n.ratedAt === 'string') rated.push(n.id)
    else if (n.ratedAt === undefined && ask.length < cap && !isKnownRated(n.id) && !asked.has(n.id)) ask.push(n.id)
  }
  return { rated, ask }
}

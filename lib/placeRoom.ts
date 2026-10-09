/**
 * A place's room (a venue day) wherever a room is drawn: the Banter's row, the
 * room's header, the Blend'n room. One rule each, so the three never disagree
 * (step 5 review).
 *
 * Two shapes arrive: a `GET /chat/groups` row (`name`, `event.kind`,
 * `event.venueId`, `memberCount`) and a `GET /checkins/active` entry (`kind`,
 * `venueId`, `event.venueName`).
 */
export type RoomLike = {
  kind?: string | null
  name?: string | null
  venueId?: string | null
  memberCount?: unknown
  event?: { kind?: string | null; title?: string | null; venueName?: string | null; venueId?: string | null } | null
}

export function isPlaceRoom(room: RoomLike | null | undefined): boolean {
  return room?.kind === 'venue_day' || room?.event?.kind === 'venue_day'
}

/**
 * The room's title: the place for a venue day (its event's title, "Venue day ·
 * ‹place› · ‹date›", is bookkeeping), else the event's. Null when neither says;
 * the caller keeps its own last resort.
 */
export function roomDisplayTitle(room: RoomLike | null | undefined): string | null {
  if (!room) return null
  if (isPlaceRoom(room)) {
    const place = room.name?.trim() || room.event?.venueName?.trim()
    if (place) return place
  }
  return room.event?.title?.trim() || null
}

/**
 * How many are in the room, or null. Never for a place's room: an exact count
 * that moves as people go live and expire is the differencing the venue's
 * bucket exists to stop (D-19) — whatever an older server still sends.
 */
export function roomMemberCount(room: RoomLike | null | undefined): number | null {
  if (!room || isPlaceRoom(room)) return null
  const count = Number(room.memberCount)
  return Number.isFinite(count) && count > 0 ? count : null
}

/** The place a venue day's room belongs to, for "Go live again"; null for an event's room. */
export function roomVenueId(room: RoomLike | null | undefined): string | null {
  if (!room || !isPlaceRoom(room)) return null
  return room.venueId ?? room.event?.venueId ?? null
}

/** What the room becomes when the server refuses it, by code — never by sentence. */
export type RoomRefusalState = 'left' | 'out' | 'not_live'

const ROOM_REFUSALS: Record<string, RoomRefusalState> = {
  // You left it yourself: Rejoin.
  LEFT_ROOM: 'left',
  // Not a member (or a leave made on another phone): Rejoin, or check in.
  FORBIDDEN: 'out',
  // A place's room after your Go Live there ended: go live again.
  NOT_LIVE: 'not_live',
}

export function roomRefusalState(errorCode: string | undefined | null): RoomRefusalState | null {
  return (errorCode && ROOM_REFUSALS[errorCode]) || null
}

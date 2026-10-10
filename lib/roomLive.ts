import type { AttendeeProfile } from './attendee'
import type { RoomAttendee } from './activeRoom'

/**
 * The Room's live state, and how each socket event changes it.
 *
 * Pure reducers, lifted out of the hook so the three rules that go wrong
 * quietly can be tested without a socket: an arrival that is already on the
 * roster must not be counted twice, a check-out must take somebody off the
 * arrivals row as well as the roster, and the server's count wins over the
 * client's arithmetic whenever it arrives.
 *
 * Each reducer returns the same object when nothing changed, so a duplicate
 * socket event (the server emits to two rooms for one check-in, and a
 * reconnect can replay) costs no render.
 */

/** The arrivals row shows this many faces; older ones fall off the end. */
export const ARRIVALS_MAX = 8

export interface LiveRoster {
  /** Server rank order, as the last fetch returned it, plus socket arrivals. */
  attendees: AttendeeProfile[]
  /** Who walked in while you were here, newest first. */
  arrivals: AttendeeProfile[]
  /**
   * Arrival times by user id, kept across refetches.
   *
   * The REST roster carries no arrival time — only the socket does — so a
   * refetch would otherwise turn "Just walked in" back into "Here now" thirty
   * seconds after somebody arrived.
   */
  arrivedAt: Record<string, string>
  hereCount: number
  hasMore: boolean
}

export const EMPTY_LIVE: LiveRoster = {
  attendees: [],
  arrivals: [],
  arrivedAt: {},
  hereCount: 0,
  hasMore: false,
}

/** Everything the roster payload carries, and nothing it doesn't. */
export function attendeeFromMatch(m: RoomAttendee): AttendeeProfile {
  return {
    user_id: m.userId,
    name: m.displayName,
    profile_photos: m.photo ? [m.photo] : undefined,
    interests: m.sharedInterests,
    sharedIntents: m.sharedIntents,
    workField: m.workField,
    sharedWorkField: m.sharedWorkField,
    sharedEvents: m.sharedEvents,
    sharedPlans: m.sharedPlans,
    age: m.age ?? undefined,
    insideNow: m.insideNow,
    youLiked: m.youLiked,
    overlaps: m.overlaps ?? [],
    sign: m.sign ?? null,
    badges: m.badges ?? [],
  }
}

/**
 * The count after an event: the server's when it sent one, else ±1.
 *
 * The server's number is authoritative because it is recounted, and a client
 * doing its own arithmetic drifts by one for every event it missed while
 * backgrounded. The fallback exists only for servers older than `hereCount`.
 */
export function nextHereCount(prev: number, reported: unknown, delta: number): number {
  if (typeof reported === 'number' && Number.isFinite(reported) && reported >= 0) {
    return Math.floor(reported)
  }
  return Math.max(0, prev + delta)
}

/**
 * The first count, before any socket event.
 *
 * `candidates` in order of trust (room preview, then the event's own
 * occupancy, then its check-in count); the first real number wins. Never below
 * the people the roster already shows inside plus you, because a count that
 * disagrees with the faces directly under it is the kind of wrong people
 * notice.
 */
export function seedHereCount(
  candidates: readonly unknown[],
  roster: readonly Pick<AttendeeProfile, 'insideNow'>[]
): number {
  const floor = roster.filter((a) => a.insideNow !== false).length + 1
  const reported = candidates.find(
    (c): c is number => typeof c === 'number' && Number.isFinite(c) && c > 0
  )
  return Math.max(floor, reported ?? 0)
}

/**
 * A fresh roster from the server.
 *
 * Arrivals are kept even when the ranked slice no longer includes them — the
 * row is "who walked in", not "who ranks" — but their profile is refreshed
 * from the new list when it does, since the REST shape is richer than the
 * socket's name and photo.
 */
export function withRoster(
  state: LiveRoster,
  attendees: AttendeeProfile[],
  hasMore: boolean
): LiveRoster {
  const byId = new Map(attendees.map((a) => [a.user_id, a]))
  const arrivals = state.arrivals.map((a) => {
    const fresh = byId.get(a.user_id)
    return fresh ? { ...fresh, last_seen: a.last_seen, insideNow: fresh.insideNow ?? true } : a
  })
  return { ...state, attendees, arrivals, hasMore }
}

export interface ArrivalPayload {
  userId: string
  userName: string
  userImage?: string
  checkInTime: string
  hereCount?: number
}

/**
 * Somebody walked in.
 *
 * Your own check-in only moves the count, and only to the server's number:
 * the seed already counted you, so a +1 for yourself would count you twice.
 * Somebody already on the roster is a duplicate delivery, not a second
 * arrival, and is treated the same way — unless the roster has them as gone
 * (`insideNow: false`): then they came back, which is an arrival (SCRUM-495).
 */
export function applyArrival(
  state: LiveRoster,
  data: ArrivalPayload,
  selfId: string | null | undefined
): LiveRoster {
  const listed = state.attendees.find((a) => a.user_id === data.userId)
  const known = data.userId === selfId || (listed !== undefined && listed.insideNow !== false)
  if (known) {
    const hereCount = nextHereCount(state.hereCount, data.hereCount, 0)
    return hereCount === state.hereCount ? state : { ...state, hereCount }
  }

  const person: AttendeeProfile = {
    ...listed,
    user_id: data.userId,
    name: data.userName,
    profile_photos: data.userImage ? [data.userImage] : listed?.profile_photos,
    last_seen: data.checkInTime,
    // Somebody who just checked in is, by definition, in the room.
    insideNow: true,
  }

  return {
    ...state,
    attendees: [person, ...state.attendees.filter((a) => a.user_id !== data.userId)],
    arrivals: [person, ...state.arrivals.filter((a) => a.user_id !== data.userId)].slice(
      0,
      ARRIVALS_MAX
    ),
    arrivedAt: { ...state.arrivedAt, [data.userId]: data.checkInTime },
    hereCount: nextHereCount(state.hereCount, data.hereCount, 1),
  }
}

export interface CheckoutPayload {
  userId: string
  hereCount?: number
}

/**
 * Somebody left.
 *
 * The fallback −1 applies when they were on screen, or when the roster is a
 * truncated slice (`hasMore`) and they could have been below it. Otherwise a
 * check-out for somebody this client never saw is most likely a duplicate, and
 * subtracting would under-count the room.
 */
export function applyCheckout(
  state: LiveRoster,
  data: CheckoutPayload,
  selfId: string | null | undefined
): LiveRoster {
  if (data.userId === selfId) {
    const hereCount = nextHereCount(state.hereCount, data.hereCount, 0)
    return hereCount === state.hereCount ? state : { ...state, hereCount }
  }

  const wasShown =
    state.attendees.some((a) => a.user_id === data.userId) ||
    state.arrivals.some((a) => a.user_id === data.userId)
  const delta = wasShown || state.hasMore ? -1 : 0
  const hereCount = nextHereCount(state.hereCount, data.hereCount, delta)

  if (!wasShown) return hereCount === state.hereCount ? state : { ...state, hereCount }

  const arrivedAt = { ...state.arrivedAt }
  delete arrivedAt[data.userId]
  return {
    ...state,
    attendees: state.attendees.filter((a) => a.user_id !== data.userId),
    arrivals: state.arrivals.filter((a) => a.user_id !== data.userId),
    arrivedAt,
    hereCount,
  }
}

/** Take somebody off every list — after a block or a report. */
export function withoutPerson(state: LiveRoster, userId: string): LiveRoster {
  if (
    !state.attendees.some((a) => a.user_id === userId) &&
    !state.arrivals.some((a) => a.user_id === userId)
  ) {
    return state
  }
  return {
    ...state,
    attendees: state.attendees.filter((a) => a.user_id !== userId),
    arrivals: state.arrivals.filter((a) => a.user_id !== userId),
  }
}

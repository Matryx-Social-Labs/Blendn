/**
 * Which room am I in, and who is in it?
 *
 * Lifted out of `MatchScreen.tsx` so it can be tested at all. The suite is
 * `jest-expo` with `testEnvironment: "node"` and no `@testing-library/react-native`,
 * so nothing inside a component is reachable from a test — the same reason
 * `lib/reveal.ts`, `lib/categories.ts` and `lib/geo.ts` were extracted in
 * #62/#67.
 *
 * ## The bug this exists to fix
 *
 * The loop over active check-ins used to `return` on any `/matches` failure
 * whose message was not literally `"event not found"`:
 *
 *     if (err.includes('event not found')) { continue }
 *     Logger.error(...)
 *     return          // <- abandons every remaining check-in
 *
 * A user with several active check-ins — which the 30-day seeded test event
 * produces by design — lost the entire screen to one bad row. Worse, the caller
 * then kept "previous stable UI to avoid flicker", and on a cold start the
 * previous state is nothing at all, so the screen sat on its spinner or claimed
 * "Not Checked In Yet" to somebody standing in the venue.
 *
 * ## Returning a state, not a room
 *
 * The old code returned "a room or nothing", which conflated four different
 * situations into one falsy value. They need different words on screen:
 *
 *     notCheckedIn  — the list came back empty. Say so.
 *     room          — we found one. Render it.
 *     empty         — checked in, but nobody matched yet. Not the same thing.
 *     error         — every attempt failed. Say THAT, and offer a retry.
 *
 * `error` is the one that did not exist before and is the whole point: an
 * honest failure beats a spinner that never stops.
 */

export interface RoomAttendee {
  userId: string
  displayName: string
  photo: string | null
  sharedInterests: string[]
  sharedIntents?: string[]
  workField?: string | null
  /**
   * Whether they work in *your* field.
   *
   * Server-decided, and it must stay that way. The obvious client-side version —
   * compare their `workField` to your own — would be wrong in exactly the case
   * the server is protecting: below eight people `workField` is suppressed to
   * null for everyone, and a client that derived this from its own profile could
   * reintroduce the attribute the floor withholds.
   */
  sharedWorkField?: boolean
  /** Whole years. Not suppressed in a small room — it is already public. */
  age?: number | null
  insideNow?: boolean
  youLiked?: boolean
}

export interface CheckinLike {
  revealed?: boolean
  event?: { id?: string; title?: string } | null
  eventId?: string
  event_id?: string
  checkInTime?: string | number | Date | null
  check_in_time?: string | number | Date | null
  createdAt?: string | number | Date | null
  created_at?: string | number | Date | null
}

export interface MatchesResult {
  success: boolean
  error?: string
  matches?: RoomAttendee[]
}

export type ActiveRoom =
  | { kind: 'notCheckedIn' }
  | { kind: 'error'; message: string }
  | {
      kind: 'room'
      eventId: string
      eventTitle?: string
      revealed: boolean
      attendees: RoomAttendee[]
    }

/** Every shape the check-in list has used for the event id, in one place. */
export function extractEventId(checkin: CheckinLike | null | undefined): string | null {
  if (!checkin) return null
  return checkin.event?.id ?? checkin.eventId ?? checkin.event_id ?? null
}

export function parseTimestamp(value: string | number | Date | null | undefined): number {
  if (value == null) return 0
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

/**
 * A stale check-in, as opposed to a request that failed.
 *
 * Only this one is silent. Everything else is worth a log line, because
 * everything else means the room exists and we could not read it.
 */
function isStaleCheckin(error: string | undefined): boolean {
  return String(error ?? '').toLowerCase().includes('event not found')
}

/**
 * Pick the newest check-in whose room actually answers.
 *
 * `fetchMatches` is injected rather than imported: the failure being fixed here
 * is "the first call fails", and a test cannot arrange that against a real
 * `apiClient`.
 */
export async function pickActiveRoom(
  checkins: readonly CheckinLike[],
  fetchMatches: (eventId: string) => Promise<MatchesResult>,
  options: { excludeUserId?: string; isBlocked?: (userId: string) => boolean } = {}
): Promise<ActiveRoom> {
  const usable = checkins.filter((c) => !!extractEventId(c))
  if (usable.length === 0) return { kind: 'notCheckedIn' }

  // Newest first: the room you walked into most recently is the one you are in.
  const sorted = [...usable].sort(
    (a, b) =>
      parseTimestamp(b.checkInTime ?? b.check_in_time ?? b.createdAt ?? b.created_at) -
      parseTimestamp(a.checkInTime ?? a.check_in_time ?? a.createdAt ?? a.created_at)
  )

  let lastError: string | undefined
  let sawRealFailure = false

  for (const checkin of sorted) {
    const eventId = extractEventId(checkin)
    if (!eventId) continue

    let result: MatchesResult
    try {
      result = await fetchMatches(eventId)
    } catch (e) {
      // A throw is a failure like any other. Previously this escaped to the
      // caller's catch, which abandoned the loop just as the `return` did.
      sawRealFailure = true
      lastError = e instanceof Error ? e.message : String(e)
      continue
    }

    if (!result.success || !result.matches) {
      /*
       * `continue`, not `return`. One unreadable room must not cost you the
       * others — and a stale check-in pointing at a deleted event is the most
       * ordinary reason to be here.
       */
      if (!isStaleCheckin(result.error)) {
        sawRealFailure = true
        lastError = result.error
      }
      continue
    }

    const attendees = result.matches.filter(
      (m) =>
        m.userId !== options.excludeUserId && !(options.isBlocked?.(m.userId) ?? false)
    )

    return {
      kind: 'room',
      eventId,
      eventTitle: checkin.event?.title,
      // Absent reads as anonymous: that matches the server default and is the
      // safe thing to claim about somebody's own visibility.
      revealed: checkin.revealed === true,
      attendees,
    }
  }

  /*
   * Nothing answered.
   *
   * If every failure was a stale check-in, the honest answer is that you are not
   * in a room — those events are gone. If any was a real failure, say so rather
   * than showing "Not Checked In Yet" to someone who is holding a wristband.
   */
  if (sawRealFailure) {
    return { kind: 'error', message: lastError || 'Could not load the room. Pull to retry.' }
  }
  return { kind: 'notCheckedIn' }
}

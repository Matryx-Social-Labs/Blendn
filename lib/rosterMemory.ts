import type { AttendeeProfile } from '../components/screens/MatchScreen'

/**
 * The last roster this session saw, so reopening the room paints instantly.
 *
 * ## Why the cache underneath is not enough
 *
 * `apiClient` caches the *response*, which removes the round trip. It does not
 * remove the **spinner**: `attendees` is component state, a remount starts it
 * at `[]`, and the render gate is
 *
 *     if (!authInitialized || (loading && attendees.length === 0)) → spinner
 *
 * so the screen still blanks for as long as it takes a cached promise to
 * resolve and React to commit. Closing the room and reopening it is exactly
 * that path, and it is the second half of the "wait a few seconds again"
 * report — the first half was `force: true` bypassing the cache entirely.
 *
 * Seeding the initial state from here means the first paint already has the
 * roster, and the fetch that follows updates it in place.
 *
 * ## Memory only. Never AsyncStorage, and this is not a preference
 *
 * A roster is pseudonyms, photos, shared interests and who is physically in a
 * room right now. Writing that to disk gives it a lifetime longer than the
 * event it belongs to: it would survive the app being closed, the event ending,
 * the 24-hour chat window closing, and the person leaving the venue — on a
 * device that may be shared, backed up, or later sold.
 *
 * The whole roster is deliberately ephemeral. A module-level `Map` dies with
 * the JS context, which is the correct lifetime and needs no expiry logic to
 * enforce it.
 *
 * ## Keyed by event
 *
 * Somebody can be checked into more than one event in a day, and showing the
 * previous room's faces for the first frame of the next one would be a
 * privacy-shaped bug wearing the clothes of a performance win.
 */

interface Entry {
  attendees: AttendeeProfile[]
  /** For the subtitle, so the header does not flash a missing title either. */
  eventTitle?: string
  at: number
}

const rosters = new Map<string, Entry>()

/**
 * How long a remembered roster may be painted before it is treated as gone.
 *
 * Presence is the volatile half of this data — who is *here now* — and a
 * ten-minute-old answer to that is worse than a spinner, because a spinner does
 * not assert anything. Five minutes is comfortably longer than a
 * close-and-reopen and comfortably shorter than a break outside the venue.
 *
 * The fetch still runs either way; this only bounds what may be shown *before*
 * it lands.
 */
export const ROSTER_MEMORY_MS = 5 * 60 * 1000

export function rememberRoster(
  eventId: string,
  attendees: AttendeeProfile[],
  eventTitle?: string
): void {
  if (!eventId) return
  rosters.set(eventId, { attendees, eventTitle, at: Date.now() })
}

/** The remembered roster, or null when there is none or it is too old. */
export function recallRoster(eventId: string | null | undefined): Entry | null {
  if (!eventId) return null
  const entry = rosters.get(eventId)
  if (!entry) return null
  if (Date.now() - entry.at > ROSTER_MEMORY_MS) {
    rosters.delete(eventId)
    return null
  }
  return entry
}

/**
 * Drop everything.
 *
 * Called on sign-out and on check-out. Sign-out is the obvious one: the next
 * person to use the device must not inherit a room. Check-out matters as much
 * and is easier to miss — leaving the venue ends your claim on the roster, and
 * a memory that outlived it would repaint the room you just left.
 */
export function forgetRosters(): void {
  rosters.clear()
}

/** Drop one event's roster, without disturbing another room in the same session. */
export function forgetRoster(eventId: string | null | undefined): void {
  if (eventId) rosters.delete(eventId)
}

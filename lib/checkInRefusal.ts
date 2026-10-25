/**
 * Why a check-in was refused, and what the screen should offer about it.
 *
 * ## The bug this replaces
 *
 * The screen classified refusals by **substring-matching the server's prose**:
 *
 *     result.error?.includes('too far') || result.error?.includes('TOO_FAR')
 *
 * The server sends neither. Its code is `OUT_OF_RANGE` and its sentence is
 * "You're about 45m outside the check-in area", so the branch never ran — and
 * with it the **Open Maps** action, which is the one thing a person standing
 * outside a geofence actually needs. They got "Check-in failed" and no way
 * forward.
 *
 * It was doubly dead: had it fired, it read `data.distance_meters` and
 * `data.required_radius`, which the server has never sent, and would have
 * rendered "You need to be within 100m. You are currently 0m away."
 *
 * `ApiResponse.errorCode` has existed the whole time. Its own docstring says it
 * was added because "every refusal arrived as prose that the UI could only
 * render as a generic failure" — and then no screen read it.
 *
 * ## The rule
 *
 * **The server owns the sentence; the client owns the affordance.** Where the
 * server's message carries a number the client cannot know — the shortfall in
 * metres — it is passed through verbatim rather than reconstructed. Re-deriving
 * it is exactly how the dead branch came to print "0m away".
 */

import type { IconName } from "../components/ui/Icon"
import { NO_LONGER_AVAILABLE, ORGANISER_SUSPENDED } from "./noLongerAvailable"

/** Codes `lib/api-response.ts` can attach to a refused check-in. */
export const CHECK_IN_CODES = {
  OUT_OF_RANGE: "OUT_OF_RANGE",
  EVENT_NOT_STARTED: "EVENT_NOT_STARTED",
  EVENT_ENDED: "EVENT_ENDED",
  AGE_RESTRICTED: "AGE_RESTRICTED",
  /** An unfinished profile is a 403 `FORBIDDEN` at the door (`lib/check-in-core.ts`); a current server adds `reasonCode: PROFILE_INCOMPLETE`. */
  FORBIDDEN: "FORBIDDEN",
  PROFILE_INCOMPLETE: "PROFILE_INCOMPLETE",
  /** The `reasonCode` of an `AGE_RESTRICTED` refusal for an age that is simply not on file, the one the person can fix. An old server says it only in the sentence. */
  AGE_UNKNOWN: "AGE_UNKNOWN",
  ALREADY_CHECKED_IN: "ALREADY_CHECKED_IN",
  EVENT_FULL: "EVENT_FULL",
  /** The `reasonCode` of the door's 404 for an event whose organiser was suspended: a refusal by design, not a failure. */
  ORGANISER_SUSPENDED,
} as const

/**
 * A refusal the door gives by design — too far, not open yet, full — as
 * opposed to a request that failed. Only the second is an error worth a Sentry
 * event: logging every "Not quite there yet" at error level reported each
 * person standing outside a venue as a crash (simulator, 2026-09-29).
 */
export function isExpectedRefusal(errorCode: string | undefined): boolean {
  return !!errorCode && (Object.values(CHECK_IN_CODES) as string[]).includes(errorCode)
}

export type CheckInRefusal = {
  title: string
  message: string
  /** The sheet's glyph (Flow 4 Tonight #16–#22): an affordance, so the client's. */
  icon?: IconName
  /**
   * Whether to offer directions.
   *
   * True for exactly one refusal. A map helps somebody who is in the wrong
   * place; it does nothing for somebody who is too early, too young, or at an
   * event that has ended, and offering it there is a button that cannot work.
   */
  offerDirections: boolean
  /**
   * The one thing the person can do about it, when there is one (Flow 15 15.22): the tray offers it as the primary beside
   * "Not now", and the refusal plays no haptic of its own, the fix does.
   */
  fix?: { kind: 'finish_profile' | 'add_age'; label: string }
}

/** The server's sentence for an age that is not on file ("… Add your age to your profile to check in."), until it sends `AGE_UNKNOWN`. */
const ADD_YOUR_AGE = /add your (age|date of birth)/i

const GENERIC = "We could not verify your check-in. Please try again."

/** The frame's own words (Flow 15 15.22): the client owns what to offer, so the client words it. */
const PROFILE_FIX: CheckInRefusal = {
  title: "Finish your profile first",
  message: "People in the room see your name or a creature. Add a name and a photo, then hold to check in.",
  offerDirections: false,
  icon: "user-round-pen",
  fix: { kind: "finish_profile", label: "Finish profile" },
}
const AGE_FIX: CheckInRefusal = {
  title: "Add your age to check in",
  message: "Events on Blend’n are 18+. Add your date of birth once; nobody else ever sees it.",
  offerDirections: false,
  icon: "calendar",
  fix: { kind: "add_age", label: "Add your age" },
}

/** `code` is the server's `reasonCode ?? errorCode` (`reasonOf`): `AGE_UNKNOWN` beside `AGE_RESTRICTED`, `PROFILE_INCOMPLETE` beside `FORBIDDEN`. */
export function checkInRefusal(
  errorCode: string | undefined,
  serverMessage: string | undefined
): CheckInRefusal {
  const message = serverMessage?.trim() || GENERIC

  switch (errorCode) {
    case CHECK_IN_CODES.OUT_OF_RANGE:
      return {
        title: "Not quite there yet",
        // The server's sentence carries the shortfall in metres. Ours cannot.
        message,
        offerDirections: true,
        icon: "map-pin",
      }
    case CHECK_IN_CODES.EVENT_NOT_STARTED:
      return { title: "Doors aren’t open", message, offerDirections: false, icon: "door-closed" }
    case CHECK_IN_CODES.EVENT_ENDED:
      return { title: "This one’s over", message, offerDirections: false, icon: "moon" }
    case CHECK_IN_CODES.AGE_UNKNOWN:
      return AGE_FIX
    case CHECK_IN_CODES.AGE_RESTRICTED:
      // Only an age that is not on file can be fixed here; a known age under the event's is a no, with no fix (Flow 15 #9).
      if (ADD_YOUR_AGE.test(message)) return AGE_FIX
      return { title: "Not open to you", message, offerDirections: false, icon: "circle-slash" }
    case CHECK_IN_CODES.PROFILE_INCOMPLETE:
      return PROFILE_FIX
    case CHECK_IN_CODES.FORBIDDEN:
      return PROFILE_FIX
    case ORGANISER_SUSPENDED:
      // The event's organiser was suspended (`reasonCode` on the door's 404): the same sentence as the Scene's, never "try again".
      return { title: NO_LONGER_AVAILABLE.title, message: NO_LONGER_AVAILABLE.body, offerDirections: false, icon: "calendar-off" }
    case CHECK_IN_CODES.EVENT_FULL:
      // ROUND3 C12 deleted this sheet: the server never sends it. Kept so a stray code still reads right.
      return { title: "At capacity", message, offerDirections: false, icon: "users" }
    case CHECK_IN_CODES.ALREADY_CHECKED_IN:
      /*
       * Kept although the check-in route is idempotent and does not currently
       * send this: a repeat check-in succeeds. Retained because the code exists
       * server-side and a future non-idempotent path would otherwise fall to
       * the generic branch. It is one line, and it is not claimed to be live.
       */
      return { title: "Already checked in", message, offerDirections: false }
    default:
      /*
       * Unknown or absent code. Still show the server's sentence — it is more
       * specific than anything written here, and one refusal ("Event is at full
       * capacity") ships with no code at all.
       */
      return { title: "Check-in failed", message, offerDirections: false, icon: "cloud-off" }
  }
}

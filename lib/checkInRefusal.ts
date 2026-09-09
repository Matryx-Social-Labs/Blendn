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

/** Codes `lib/api-response.ts` can attach to a refused check-in. */
export const CHECK_IN_CODES = {
  OUT_OF_RANGE: "OUT_OF_RANGE",
  EVENT_NOT_STARTED: "EVENT_NOT_STARTED",
  EVENT_ENDED: "EVENT_ENDED",
  AGE_RESTRICTED: "AGE_RESTRICTED",
  ALREADY_CHECKED_IN: "ALREADY_CHECKED_IN",
  EVENT_FULL: "EVENT_FULL",
} as const

export type CheckInRefusal = {
  title: string
  message: string
  /**
   * Whether to offer directions.
   *
   * True for exactly one refusal. A map helps somebody who is in the wrong
   * place; it does nothing for somebody who is too early, too young, or at an
   * event that has ended, and offering it there is a button that cannot work.
   */
  offerDirections: boolean
}

const GENERIC = "We could not verify your check-in. Please try again."

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
      }
    case CHECK_IN_CODES.EVENT_NOT_STARTED:
      return { title: "Doors aren't open", message, offerDirections: false }
    case CHECK_IN_CODES.EVENT_ENDED:
      return { title: "This one's over", message, offerDirections: false }
    case CHECK_IN_CODES.AGE_RESTRICTED:
      return { title: "Not open to you", message, offerDirections: false }
    case CHECK_IN_CODES.EVENT_FULL:
      return { title: "At capacity", message, offerDirections: false }
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
      return { title: "Check-in failed", message, offerDirections: false }
  }
}

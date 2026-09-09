/**
 * What to say when a like is refused.
 *
 * ## The silence this replaces
 *
 * `likeStateAfter({ ok: false })` returns `undefined`, so the screen deleted
 * the row and the heart reverted to unliked — **with nothing said**. The two
 * refusals that actually happen are invisible:
 *
 *   403  "Check in before liking anyone here"   a lapsed check-in
 *   429  rate limited                            liking fast in a busy room
 *
 * Auto-checkout makes the first ordinary rather than exotic: step outside for
 * ten minutes, come back, and every like silently does nothing. The person taps
 * again, and again. That is the exact failure `ApiResponse.errorCode` was added
 * to end — "a muted user retried forever with no idea they were muted".
 *
 * ## One rule above all others
 *
 * **A refusal must never read as rejection.** The product's whole promise is
 * that expressing interest costs nothing and carries no expectation, and
 * `likeAccessibilityLabel` already refuses to mention the other person's
 * feelings in any state. A failed like is about the room, the clock, or the
 * network — never about them. Nothing here names the other person or implies
 * anything was communicated to them.
 */

export type LikeRefusal = {
  message: string
  /**
   * `info` rather than `error` for the ones that are not the person's fault
   * and are fixable in a second. A red alert for "you are liking quickly" makes
   * a free action feel like a violation.
   */
  variant: "error" | "info"
}

const GENERIC = "That didn't go through. Try again."

export function likeRefusal(
  errorCode: string | undefined,
  serverMessage: string | undefined
): LikeRefusal {
  const message = serverMessage?.trim()

  switch (errorCode) {
    case "RATE_LIMITED":
      // Deliberately not the server's sentence: rate-limit copy is written for
      // an API caller, and this one is for somebody enjoying themselves.
      return { message: "Slow down a moment, then try again.", variant: "info" }

    case "FORBIDDEN":
      /*
       * Almost always the lapsed check-in. The server's sentence — "Check in
       * before liking anyone here" — already says the useful thing, and it is
       * about the room rather than about them.
       */
      return { message: message || "Check in before liking anyone here.", variant: "info" }

    case "NOT_CHECKED_IN":
      return { message: message || "Check in before liking anyone here.", variant: "info" }

    default:
      return { message: message || GENERIC, variant: "error" }
  }
}

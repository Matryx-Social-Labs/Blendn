/**
 * What to tell a person when a request was refused.
 *
 * The server's `error` is sometimes a sentence written for them — "You're
 * muted in this room.", "Add a photo to your profile first" — and sometimes a
 * developer's: "Failed to update profile", "Invalid input: expected string",
 * "Network request failed". Toasts that passed `result.error ||` straight
 * through showed both kinds, so the same screen spoke in two voices.
 *
 * The rule: the server's words only for an `errorCode` whose message is
 * written as copy (the list below — every one is a refusal the person can do
 * something about, worded server-side for exactly that). Everything else gets
 * the screen's own sentence, in the app's one error tone: "Couldn't … Try
 * again."
 */

/** Codes whose `error` the server writes for the person reading it. */
const SPOKEN_CODES = new Set([
  'RATE_LIMITED',
  'SPAM_BLOCKED',
  'USER_MUTED',
  'USER_BANNED',
  'CHAT_LOCKED',
  'CHAT_CLOSED',
  'LEFT_ROOM',
  'NOT_CHECKED_IN',
  'EVENT_ENDED',
  'EVENT_NOT_STARTED',
  'AGE_RESTRICTED',
  'WAVE_TOO_SOON',
  'RECIPIENT_NOT_HERE',
  'reveal_incomplete',
])

export function userMessage(
  result: { error?: string | null; errorCode?: string | null } | null | undefined,
  fallback: string
): string {
  const said = result?.error?.trim()
  if (said && result?.errorCode && SPOKEN_CODES.has(result.errorCode)) return said
  return fallback
}

/**
 * Why a session ended, or why an account was refused, as a typed reason (Flow 15 #1 to #4).
 *
 * The server says it two ways. Read first: the body's `reasonCode` (`ACCOUNT_SUSPENDED`, `ACCOUNT_STAFF`,
 * `ACCOUNT_DELETED`, `SESSION_REVOKED_ELSEWHERE`, `PASSWORD_RESET`), which sits beside an `errorCode` that keeps its old
 * value (`FORBIDDEN`, `NOT_FOUND`) for builds in the field; a refresh 401 repeats the reason in both. So a client reads
 * `reasonCode ?? errorCode` (`reasonOf`). The fallback, for a server that sends neither: a 403 `FORBIDDEN` whose
 * sentence is one of the two the server writes for a suspended or a staff account (`lib/mobile-auth.ts`
 * SUSPENDED_MESSAGE, STAFF_MESSAGE), and a Google or Apple 401 "Account not found" for a deleted one.
 *
 * A reason the client cannot tell stays `expired`, which is today's generic notice.
 */

export type SessionEndReason = 'suspended' | 'staff' | 'deleted' | 'elsewhere' | 'reset' | 'expired'

/** An account the server refused outright: a full-screen state, never a notice with the sign-in buttons beneath it. */
export type AccountRefusal = Extract<SessionEndReason, 'suspended' | 'staff' | 'deleted'>

/** The codes the server is asked to send (see the report: `lib/mobile-auth.ts`, `lib/api-response.ts`). */
export const SESSION_END_CODES: Record<string, SessionEndReason> = {
  ACCOUNT_SUSPENDED: 'suspended',
  ACCOUNT_STAFF: 'staff',
  ACCOUNT_DELETED: 'deleted',
  SESSION_REVOKED_ELSEWHERE: 'elsewhere',
  PASSWORD_RESET: 'reset',
}

type Failure = { error?: string; errorCode?: string; reasonCode?: string; status?: number }

/** The server's reason for a refusal: `reasonCode` when it sends one, else the `errorCode` it always sent. */
export const reasonOf = (failure: { errorCode?: string; reasonCode?: string } | null | undefined): string | undefined =>
  failure?.reasonCode ?? failure?.errorCode

/**
 * ponytail: the fallback reads the server's own sentences, for a server that sends no `reasonCode` (an old one). Delete it
 * when none is left in the field.
 * The prefixes are the two constants' first words, so a rewording of the rest cannot break it.
 */
function fromSentence({ error, errorCode }: Failure): SessionEndReason | null {
  const sentence = error?.trim() ?? ''
  if (errorCode === 'FORBIDDEN' || errorCode === undefined) {
    if (sentence.startsWith('This account has been suspended')) return 'suspended'
    if (sentence.startsWith('This app is for attendees')) return 'staff'
  }
  // Google and Apple refuse a deleted account with this and nothing else (`app/api/mobile/auth/google/route.ts`).
  if (errorCode === 'UNAUTHORIZED' && sentence === 'Account not found') return 'deleted'
  return null
}

/** The reason in a refused response: the code first, the sentence while the server does not send one. */
export function classifySessionEnd(failure: Failure): SessionEndReason {
  const code = reasonOf(failure)
  const coded = code ? SESSION_END_CODES[code] : undefined
  return coded ?? fromSentence(failure) ?? 'expired'
}

/** Whether a refused sign-in is an account state (and which), as opposed to a failed attempt that can be retried. */
export function accountRefusalOf(failure: Failure): AccountRefusal | null {
  const reason = classifySessionEnd(failure)
  return reason === 'suspended' || reason === 'staff' || reason === 'deleted' ? reason : null
}

/** The landing's notice for a session that ended without a full-screen state (Flow 15 #4). */
export const SESSION_END_NOTICE: Record<'elsewhere' | 'reset' | 'expired', string> = {
  elsewhere: 'You were signed out on another device. Sign in again to continue.',
  reset: 'Your password was reset. Sign in with the new one.',
  expired: 'You were signed out. Sign in again to continue.',
}

/**
 * The reason the server gave for refusing a socket handshake, from `error.data.code` (Flow 15 #21). Only an account state
 * counts: a password reset or a sign-out elsewhere is the session's to end through the refresh, not the socket's to name.
 */
export function endedByOf(error: Error): SessionEndReason | null {
  const code = (error as Error & { data?: { code?: unknown } }).data?.code
  const reason = typeof code === 'string' ? SESSION_END_CODES[code] : undefined
  return reason === 'suspended' || reason === 'staff' || reason === 'deleted' ? reason : null
}

/**
 * The token socket.io hands over on every connection attempt.
 *
 * ## Why a callback is not enough on its own
 *
 * `socketClient` passed `auth: { token }` — a plain object, read once at
 * connect time. socket.io keeps that object and replays it verbatim on every
 * reconnection attempt, so once the access token expired (15 minutes) every
 * retry failed the handshake with the same dead credential. Realtime died after
 * a quarter of an hour idle and only a manual Retry brought it back, because
 * only a fresh connect re-read the token.
 *
 * The obvious fix is to make `auth` function-valued so it is re-read per
 * attempt. **That alone changes nothing.** `TokenStorage.getAccessToken()` is a
 * bare SecureStore read:
 *
 *     static async getAccessToken(): Promise<string | null> {
 *       return this.secureGet(ACCESS_TOKEN_KEY)
 *     }
 *
 * No expiry check, no refresh. Only `apiClient`'s 401 handler ever refreshes,
 * and a socket handshake is not an HTTP 401. So a callback that re-reads storage
 * serves the *same expired token* it served before, and the bug survives a fix
 * that looks correct in review.
 *
 * This module refreshes first, then reads.
 *
 * ## Why the expiry is decoded here rather than imported
 *
 * `jose` is pure ESM with no CommonJS build, and importing it into anything the
 * test suite touches breaks Jest with `Unexpected token export`. This needs one
 * number out of an unverified payload — the server verifies the signature, this
 * only decides whether to bother refreshing — so a base64 decode of the middle
 * segment is both sufficient and the only option that stays testable.
 */

/**
 * Refresh when the token expires within this window.
 *
 * A handshake is not instant, and neither is the round trip that produced the
 * token. Sixty seconds of slack means we never hand over a credential that
 * dies mid-connection.
 */
export const REFRESH_SKEW_MS = 60_000

/**
 * Milliseconds until this JWT expires, or `null` if that cannot be determined.
 *
 * `null` is returned for anything unparseable rather than throwing or guessing.
 * Callers treat it as "refresh anyway": a token we cannot read is one we cannot
 * vouch for, and an unnecessary refresh is cheap where a failed handshake costs
 * the user their realtime connection.
 */
export function msUntilExpiry(token: string | null | undefined, now: number): number | null {
  if (typeof token !== 'string') return null

  const segments = token.split('.')
  if (segments.length !== 3) return null

  try {
    // Base64url → base64. `atob` exists in Hermes and on every RN engine this
    // app runs on; `Buffer` does not, without a polyfill.
    const padded = segments[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4)))

    // `exp` is seconds since epoch, per RFC 7519. Treating it as milliseconds
    // puts every expiry in 1970 and refreshes on literally every attempt.
    if (typeof payload?.exp !== 'number') return null
    return payload.exp * 1000 - now
  } catch {
    return null
  }
}

export function isExpiringSoon(
  token: string | null | undefined,
  now: number,
  skewMs: number = REFRESH_SKEW_MS
): boolean {
  const remaining = msUntilExpiry(token, now)
  // Unreadable counts as expiring. Failing towards a refresh is the safe side.
  if (remaining === null) return true
  return remaining <= skewMs
}

export interface AuthPayload {
  token: string | null
}

/**
 * Build the payload for one connection attempt, refreshing if needed.
 *
 * Dependencies are injected so this can be tested without SecureStore, without
 * a network, and without a clock — all three of which are why the original bug
 * was invisible until someone left the app open for twenty minutes.
 *
 * A failed refresh still sends whatever token exists rather than sending
 * nothing. The server rejects it and socket.io retries, which is a recoverable
 * state; sending `null` is an immediate, indistinguishable auth failure.
 */
export async function buildAuthPayload(deps: {
  getToken: () => Promise<string | null>
  refresh: () => Promise<boolean>
  now?: () => number
}): Promise<AuthPayload> {
  const now = deps.now ?? Date.now
  const token = await deps.getToken()

  if (!isExpiringSoon(token, now())) {
    return { token }
  }

  try {
    const refreshed = await deps.refresh()
    if (refreshed) {
      return { token: await deps.getToken() }
    }
  } catch {
    // Swallowed on purpose: this runs inside socket.io's connection machinery,
    // where a throw becomes an unhandled rejection rather than a retry.
  }

  return { token }
}

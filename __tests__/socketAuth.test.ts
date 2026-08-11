import {
  REFRESH_SKEW_MS,
  buildAuthPayload,
  isExpiringSoon,
  msUntilExpiry,
} from '../lib/socketAuth'

/**
 * The bug these pin down took twenty minutes of idling to reproduce by hand and
 * looked fixed by a change that did nothing. Both properties matter:
 * `msUntilExpiry` must read `exp` as seconds, and `buildAuthPayload` must
 * actually refresh rather than re-reading the same dead token.
 */

const NOW = 1_800_000_000_000 // fixed clock, ms

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.signature`
}

describe('msUntilExpiry', () => {
  it('reads exp as seconds, not milliseconds', () => {
    /*
     * The single highest-value assertion here. RFC 7519 says `exp` is seconds
     * since epoch. Treating it as milliseconds puts every expiry in January
     * 1970, which makes `isExpiringSoon` return true forever — so every socket
     * attempt would trigger a refresh, hammering the auth endpoint while
     * looking like it works.
     */
    const token = jwt({ exp: NOW / 1000 + 600 })
    expect(msUntilExpiry(token, NOW)).toBe(600_000)
  })

  it('goes negative for a token that has already expired', () => {
    expect(msUntilExpiry(jwt({ exp: NOW / 1000 - 30 }), NOW)).toBe(-30_000)
  })

  it('returns null rather than throwing on anything unreadable', () => {
    for (const bad of [null, undefined, '', 'not-a-jwt', 'a.b', 'a.b.c.d', 'a.!!!.c']) {
      expect(msUntilExpiry(bad as string, NOW)).toBeNull()
    }
  })

  it('returns null when the payload carries no exp', () => {
    expect(msUntilExpiry(jwt({ sub: 'user-1' }), NOW)).toBeNull()
    expect(msUntilExpiry(jwt({ exp: 'soon' }), NOW)).toBeNull()
  })
})

describe('isExpiringSoon', () => {
  it('is false for a token with plenty of life left', () => {
    expect(isExpiringSoon(jwt({ exp: NOW / 1000 + 600 }), NOW)).toBe(false)
  })

  it('is true inside the skew window, before actual expiry', () => {
    // The point of the skew: a handshake takes time, so a token that is
    // technically still valid can die mid-connection.
    expect(isExpiringSoon(jwt({ exp: NOW / 1000 + 30 }), NOW)).toBe(true)
    expect(REFRESH_SKEW_MS).toBeGreaterThan(0)
  })

  it('is true for an expired token — the original bug', () => {
    expect(isExpiringSoon(jwt({ exp: NOW / 1000 - 1 }), NOW)).toBe(true)
  })

  it('treats an unreadable or missing token as expiring', () => {
    // Fail towards a refresh: an unnecessary refresh is cheap, a failed
    // handshake costs the user their realtime connection.
    expect(isExpiringSoon(null, NOW)).toBe(true)
    expect(isExpiringSoon('garbage', NOW)).toBe(true)
  })
})

describe('buildAuthPayload', () => {
  const now = () => NOW

  it('passes a fresh token straight through without refreshing', async () => {
    const fresh = jwt({ exp: NOW / 1000 + 600 })
    const refresh = jest.fn().mockResolvedValue(true)

    const result = await buildAuthPayload({
      getToken: jest.fn().mockResolvedValue(fresh),
      refresh,
      now,
    })

    expect(result).toEqual({ token: fresh })
    expect(refresh).not.toHaveBeenCalled()
  })

  it('refreshes an expired token and returns the NEW one', async () => {
    /*
     * This is the whole fix.
     *
     * Making socket.io's `auth` function-valued re-reads storage per attempt,
     * but `TokenStorage.getAccessToken` has no expiry awareness and never
     * refreshes — so a re-read alone serves the same expired token and realtime
     * stays dead. If this test ever passes with `refresh` uncalled, the fix has
     * been silently reverted to the version that looks right and does nothing.
     */
    const expired = jwt({ exp: NOW / 1000 - 60 })
    const renewed = jwt({ exp: NOW / 1000 + 900 })

    const getToken = jest
      .fn()
      .mockResolvedValueOnce(expired)
      .mockResolvedValueOnce(renewed)
    const refresh = jest.fn().mockResolvedValue(true)

    const result = await buildAuthPayload({ getToken, refresh, now })

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ token: renewed })
    expect(result.token).not.toBe(expired)
  })

  it('still sends the old token when the refresh fails', async () => {
    // The server rejects it and socket.io retries — recoverable. Sending null
    // is an immediate auth failure with nothing to retry into.
    const expired = jwt({ exp: NOW / 1000 - 60 })
    const result = await buildAuthPayload({
      getToken: jest.fn().mockResolvedValue(expired),
      refresh: jest.fn().mockResolvedValue(false),
      now,
    })

    expect(result).toEqual({ token: expired })
  })

  it('does not throw when the refresh itself rejects', async () => {
    /*
     * This runs inside socket.io's connection machinery, which does not await
     * the callback — a throw escapes as an unhandled rejection, which
     * terminates the process on Node and is a hard crash in release RN.
     */
    const expired = jwt({ exp: NOW / 1000 - 60 })
    const result = await buildAuthPayload({
      getToken: jest.fn().mockResolvedValue(expired),
      refresh: jest.fn().mockRejectedValue(new Error('network down')),
      now,
    })

    expect(result).toEqual({ token: expired })
  })

  it('attempts a refresh when there is no token at all', async () => {
    const getToken = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce('recovered')
    const refresh = jest.fn().mockResolvedValue(true)

    const result = await buildAuthPayload({ getToken, refresh, now })

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ token: 'recovered' })
  })
})

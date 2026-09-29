import { buildAuthPayload } from '../lib/socketAuth'

/**
 * The bug these pin down took twenty minutes of idling to reproduce by hand and
 * looked fixed by a change that did nothing. `buildAuthPayload` must actually
 * refresh rather than re-reading the same dead token, and it must read `exp` as
 * seconds (RFC 7519) — read as milliseconds every expiry lands in 1970 and every
 * attempt refreshes, hammering the auth endpoint while looking like it works.
 * Everything goes through `buildAuthPayload`: the expiry helpers are private.
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

  it('refreshes a token that is still valid but about to expire', async () => {
    // The point of the skew: a handshake takes time, so a token that is
    // technically alive can die mid-connection.
    const dying = jwt({ exp: NOW / 1000 + 30 })
    const renewed = jwt({ exp: NOW / 1000 + 900 })
    const getToken = jest.fn().mockResolvedValueOnce(dying).mockResolvedValueOnce(renewed)
    const refresh = jest.fn().mockResolvedValue(true)

    const result = await buildAuthPayload({ getToken, refresh, now })

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ token: renewed })
  })

  it.each([
    ['not a jwt', 'garbage'],
    ['too few segments', 'a.b'],
    ['a payload that is not base64', 'a.!!!.c'],
    ['a payload with no exp', jwt({ sub: 'user-1' })],
    ['an exp that is not a number', jwt({ exp: 'soon' })],
  ])('refreshes rather than trusting %s', async (_name, unreadable) => {
    // A token we cannot read is one we cannot vouch for; an unnecessary
    // refresh is cheap, a failed handshake costs the user their realtime.
    const renewed = jwt({ exp: NOW / 1000 + 900 })
    const getToken = jest.fn().mockResolvedValueOnce(unreadable).mockResolvedValueOnce(renewed)
    const refresh = jest.fn().mockResolvedValue(true)

    const result = await buildAuthPayload({ getToken, refresh, now })

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ token: renewed })
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

import {
  extractEventId,
  parseTimestamp,
  pickActiveRoom,
  type CheckinLike,
  type MatchesResult,
} from '../lib/activeRoom'

/**
 * "I checked in to the event with multiple check ins you seeded with dating
 * intent setup from about you section and i cannot see anyone, the matchmaking
 * page just keeps loading."
 *
 * Two separate defects behind that sentence, and both are pinned here: one bad
 * check-in abandoning the rest, and failure being indistinguishable from
 * not-checked-in.
 */

const room = (id: string, extra: Partial<CheckinLike> = {}): CheckinLike => ({
  event: { id, title: `Event ${id}` },
  checkInTime: '2026-08-10T20:00:00Z',
  ...extra,
})

const ok = (userIds: string[]): MatchesResult => ({
  success: true,
  matches: userIds.map((userId) => ({
    userId,
    displayName: `User ${userId}`,
    photo: null,
    sharedInterests: [],
  })),
})

describe('pickActiveRoom', () => {
  it('returns the room and its attendees on the happy path', async () => {
    const result = await pickActiveRoom([room('e1')], async () => ok(['a', 'b']))

    expect(result).toMatchObject({ kind: 'room', eventId: 'e1', eventTitle: 'Event e1' })
    if (result.kind === 'room') expect(result.attendees).toHaveLength(2)
  })

  it('tries the next check-in when the first one fails', async () => {
    /*
     * The keystone.
     *
     * This used to `return` on any error that was not literally "event not
     * found", abandoning every remaining check-in. A user with several active
     * check-ins — which the 30-day seeded event produces by design — lost the
     * whole screen to one bad row.
     */
    const tried: string[] = []
    const result = await pickActiveRoom([room('bad'), room('good')], async (id) => {
      tried.push(id)
      return id === 'bad' ? { success: false, error: 'Internal server error' } : ok(['a'])
    })

    expect(tried).toEqual(['bad', 'good'])
    expect(result).toMatchObject({ kind: 'room', eventId: 'good' })
  })

  it('keeps going when a fetch throws, not just when it returns failure', async () => {
    const result = await pickActiveRoom([room('boom'), room('fine')], async (id) => {
      if (id === 'boom') throw new Error('socket hang up')
      return ok(['a'])
    })

    expect(result).toMatchObject({ kind: 'room', eventId: 'fine' })
  })

  it('skips stale check-ins silently and keeps looking', async () => {
    const result = await pickActiveRoom([room('deleted'), room('live')], async (id) =>
      id === 'deleted' ? { success: false, error: 'Event not found' } : ok(['a'])
    )

    expect(result).toMatchObject({ kind: 'room', eventId: 'live' })
  })

  it('reports an error when every room failed for a real reason', async () => {
    /*
     * The second defect. The old code returned nothing here and the caller kept
     * "previous stable UI" — which on a cold start is nothing at all, so the
     * screen either span forever or told a checked-in user they were not
     * checked in. An error state has to be reachable for the UI to be honest.
     */
    const result = await pickActiveRoom([room('e1'), room('e2')], async () => ({
      success: false,
      error: 'Internal server error',
    }))

    expect(result.kind).toBe('error')
    if (result.kind === 'error') expect(result.message).toContain('Internal server error')
  })

  it('says not-checked-in when every check-in was merely stale', async () => {
    // Different from the case above: these events are gone, so "you are not in
    // a room" is the truth, not a failure to read one.
    const result = await pickActiveRoom([room('a'), room('b')], async () => ({
      success: false,
      error: 'Event not found',
    }))

    expect(result).toEqual({ kind: 'notCheckedIn' })
  })

  it('says not-checked-in for an empty list', async () => {
    expect(await pickActiveRoom([], async () => ok([]))).toEqual({ kind: 'notCheckedIn' })
  })

  it('says not-checked-in when no check-in carries an event id', async () => {
    const result = await pickActiveRoom([{ event: null }, {}], async () => ok(['a']))
    expect(result).toEqual({ kind: 'notCheckedIn' })
  })

  it('distinguishes an empty room from not being in one', async () => {
    // Checked in, nobody matched yet. "Not Checked In Yet" would be a lie.
    const result = await pickActiveRoom([room('e1')], async () => ok([]))

    expect(result.kind).toBe('room')
    if (result.kind === 'room') expect(result.attendees).toEqual([])
  })

  it('picks the most recent check-in first', async () => {
    const tried: string[] = []
    await pickActiveRoom(
      [
        room('old', { checkInTime: '2026-08-01T10:00:00Z' }),
        room('new', { checkInTime: '2026-08-10T22:00:00Z' }),
      ],
      async (id) => {
        tried.push(id)
        return ok(['a'])
      }
    )

    expect(tried[0]).toBe('new')
  })

  it('does not mutate the array it was given', async () => {
    const input = [
      room('old', { checkInTime: '2026-08-01T10:00:00Z' }),
      room('new', { checkInTime: '2026-08-10T22:00:00Z' }),
    ]
    const before = input.map((c) => c.event?.id)

    await pickActiveRoom(input, async () => ok(['a']))
    expect(input.map((c) => c.event?.id)).toEqual(before)
  })

  it('drops yourself and anyone blocked, in both directions', async () => {
    const result = await pickActiveRoom([room('e1')], async () => ok(['me', 'blocked', 'ok']), {
      excludeUserId: 'me',
      isBlocked: (id) => id === 'blocked',
    })

    if (result.kind !== 'room') throw new Error('expected a room')
    expect(result.attendees.map((a) => a.userId)).toEqual(['ok'])
  })

  it('treats a missing reveal flag as anonymous', async () => {
    // The safe claim about somebody's own visibility, and it matches the
    // server default.
    for (const value of [undefined, null, false, 'true']) {
      const result = await pickActiveRoom(
        [room('e1', { revealed: value as boolean | undefined })],
        async () => ok(['a'])
      )
      if (result.kind !== 'room') throw new Error('expected a room')
      expect(result.revealed).toBe(false)
    }

    const revealed = await pickActiveRoom([room('e1', { revealed: true })], async () => ok(['a']))
    if (revealed.kind !== 'room') throw new Error('expected a room')
    expect(revealed.revealed).toBe(true)
  })
})

describe('extractEventId', () => {
  it('accepts every shape the check-in list has used', () => {
    expect(extractEventId({ event: { id: 'a' } })).toBe('a')
    expect(extractEventId({ eventId: 'b' })).toBe('b')
    expect(extractEventId({ event_id: 'c' })).toBe('c')
  })

  it('returns null rather than undefined for anything else', () => {
    for (const bad of [null, undefined, {}, { event: null }]) {
      expect(extractEventId(bad as CheckinLike)).toBeNull()
    }
  })
})

describe('parseTimestamp', () => {
  it('handles the four field shapes without producing NaN', () => {
    expect(parseTimestamp('2026-08-10T20:00:00Z')).toBe(Date.parse('2026-08-10T20:00:00Z'))
    expect(parseTimestamp(new Date('2026-08-10T20:00:00Z'))).toBe(
      Date.parse('2026-08-10T20:00:00Z')
    )
    expect(parseTimestamp(1700000000000)).toBe(1700000000000)
  })

  it('sorts unparseable values last rather than poisoning the comparison', () => {
    // NaN in a comparator makes the sort order undefined, which would scramble
    // which room you are considered to be in.
    expect(parseTimestamp('not a date')).toBe(0)
    expect(parseTimestamp(null)).toBe(0)
    expect(parseTimestamp(undefined)).toBe(0)
  })
})

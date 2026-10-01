import type { AttendeeProfile } from '../lib/attendee'
import {
  ARRIVALS_MAX,
  EMPTY_LIVE,
  applyArrival,
  applyCheckout,
  attendeeFromMatch,
  nextHereCount,
  seedHereCount,
  withRoster,
  withoutPerson,
  type LiveRoster,
} from '../lib/roomLive'

/**
 * The Room's live roster: arrivals, check-outs and the count.
 *
 * The failures here are all quiet ones — a face counted twice, a departed
 * person still on the arrivals row, a count that drifts because the client
 * trusted its own arithmetic over the server's.
 */

const ME = 'me'
const person = (id: string, extra: Partial<AttendeeProfile> = {}): AttendeeProfile => ({
  user_id: id,
  name: `Anon ${id}`,
  ...extra,
})
const arrival = (id: string, extra: object = {}) => ({
  userId: id,
  userName: `Anon ${id}`,
  checkInTime: '2026-09-28T20:00:00.000Z',
  ...extra,
})
const room = (patch: Partial<LiveRoster> = {}): LiveRoster => ({
  ...EMPTY_LIVE,
  attendees: [person('a'), person('b')],
  hereCount: 3,
  ...patch,
})

describe('nextHereCount', () => {
  it("takes the server's number whenever it sends one", () => {
    expect(nextHereCount(5, 12, 1)).toBe(12)
    expect(nextHereCount(5, 0, -1)).toBe(0)
  })

  it('falls back to ±1 for an older server, never below zero', () => {
    expect(nextHereCount(5, undefined, 1)).toBe(6)
    expect(nextHereCount(0, undefined, -1)).toBe(0)
    expect(nextHereCount(5, 'x', -1)).toBe(4)
    expect(nextHereCount(5, -3, 0)).toBe(5)
  })
})

describe('seedHereCount', () => {
  it('uses the first real number, in order of trust', () => {
    expect(seedHereCount([14, 9], [])).toBe(14)
    expect(seedHereCount([undefined, 9], [])).toBe(9)
  })

  it('never shows fewer than the faces on screen plus you', () => {
    const roster = [person('a'), person('b'), person('c', { insideNow: false })]
    expect(seedHereCount([1], roster)).toBe(3)
    expect(seedHereCount([], roster)).toBe(3)
    expect(seedHereCount([0, null], [])).toBe(1)
  })
})

describe('applyArrival', () => {
  it('puts a newcomer at the top of the roster and the arrivals row', () => {
    const next = applyArrival(room(), arrival('c', { userImage: 'https://x/c.jpg' }), ME)
    expect(next.attendees.map((a) => a.user_id)).toEqual(['c', 'a', 'b'])
    expect(next.arrivals.map((a) => a.user_id)).toEqual(['c'])
    expect(next.attendees[0]).toMatchObject({ insideNow: true, profile_photos: ['https://x/c.jpg'] })
    expect(next.arrivedAt.c).toBe('2026-09-28T20:00:00.000Z')
    expect(next.hereCount).toBe(4)
  })

  it("prefers the server's count to +1", () => {
    expect(applyArrival(room(), arrival('c', { hereCount: 40 }), ME).hereCount).toBe(40)
  })

  it('does not count a duplicate delivery twice', () => {
    const state = room()
    expect(applyArrival(state, arrival('a'), ME)).toBe(state)
    expect(applyArrival(state, arrival('a', { hereCount: 7 }), ME).hereCount).toBe(7)
  })

  it('brings back somebody who had left, inside again and at the top (SCRUM-495)', () => {
    // The roster keeps people who checked out, as insideNow: false. Coming
    // back is an arrival, not a duplicate: treated as one, they stayed "left".
    const state = room({ attendees: [person('a'), person('b', { insideNow: false })] })
    const next = applyArrival(state, arrival('b'), ME)
    expect(next.attendees.map((a) => [a.user_id, a.insideNow !== false])).toEqual([
      ['b', true],
      ['a', true],
    ])
    expect(next.arrivals.map((a) => a.user_id)).toEqual(['b'])
    expect(next.hereCount).toBe(4)
  })

  it('moves only the count for your own check-in, and only to the server number', () => {
    const state = room()
    expect(applyArrival(state, arrival(ME), ME)).toBe(state)
    const next = applyArrival(state, arrival(ME, { hereCount: 9 }), ME)
    expect(next.hereCount).toBe(9)
    expect(next.attendees).toBe(state.attendees)
  })

  it(`keeps the newest ${ARRIVALS_MAX} arrivals`, () => {
    let state = room()
    for (let i = 0; i < ARRIVALS_MAX + 3; i++) state = applyArrival(state, arrival(`n${i}`), ME)
    expect(state.arrivals).toHaveLength(ARRIVALS_MAX)
    expect(state.arrivals[0].user_id).toBe(`n${ARRIVALS_MAX + 2}`)
  })
})

describe('applyCheckout', () => {
  it('takes them off the roster, the arrivals row and the arrival times', () => {
    const arrived = applyArrival(room(), arrival('c'), ME)
    const next = applyCheckout(arrived, { userId: 'c' }, ME)
    expect(next.attendees.map((a) => a.user_id)).toEqual(['a', 'b'])
    expect(next.arrivals).toEqual([])
    expect(next.arrivedAt.c).toBeUndefined()
    expect(next.hereCount).toBe(3)
  })

  it("prefers the server's count", () => {
    expect(applyCheckout(room(), { userId: 'a', hereCount: 20 }, ME).hereCount).toBe(20)
  })

  it('counts down for somebody below a truncated roster, but not for a stranger in a full one', () => {
    expect(applyCheckout(room({ hasMore: true }), { userId: 'zz' }, ME).hereCount).toBe(2)
    const full = room({ hasMore: false })
    expect(applyCheckout(full, { userId: 'zz' }, ME)).toBe(full)
  })

  it('moves only the count for your own check-out', () => {
    const state = room()
    expect(applyCheckout(state, { userId: ME }, ME)).toBe(state)
    expect(applyCheckout(state, { userId: ME, hereCount: 2 }, ME).attendees).toBe(state.attendees)
  })
})

describe('withRoster', () => {
  it('replaces the ranked list but keeps the arrivals row, refreshed where it can be', () => {
    const arrived = applyArrival(applyArrival(room(), arrival('c'), ME), arrival('d'), ME)
    const next = withRoster(arrived, [person('c', { workField: 'Design' }), person('a')], true)
    expect(next.attendees.map((a) => a.user_id)).toEqual(['c', 'a'])
    expect(next.hasMore).toBe(true)
    expect(next.arrivals.map((a) => a.user_id)).toEqual(['d', 'c'])
    expect(next.arrivals[1]).toMatchObject({ workField: 'Design', last_seen: '2026-09-28T20:00:00.000Z' })
    expect(next.arrivedAt).toEqual(arrived.arrivedAt)
  })
})

describe('withoutPerson', () => {
  it('removes somebody from every list, and is a no-op for a stranger', () => {
    const arrived = applyArrival(room(), arrival('c'), ME)
    const next = withoutPerson(arrived, 'c')
    expect(next.attendees.some((a) => a.user_id === 'c')).toBe(false)
    expect(next.arrivals).toEqual([])
    expect(withoutPerson(arrived, 'zz')).toBe(arrived)
  })
})

describe('attendeeFromMatch', () => {
  it('carries every field the roster sends', () => {
    expect(
      attendeeFromMatch({
        userId: 'u',
        displayName: 'Blue Heron',
        photo: null,
        sharedInterests: ['Jazz'],
        sharedIntents: ['dating'],
        workField: 'Design',
        sharedWorkField: true,
        sharedEvents: 2,
        sharedPlans: 1,
        age: null,
        insideNow: true,
        youLiked: false,
      })
    ).toEqual({
      user_id: 'u',
      name: 'Blue Heron',
      profile_photos: undefined,
      interests: ['Jazz'],
      sharedIntents: ['dating'],
      workField: 'Design',
      sharedWorkField: true,
      sharedEvents: 2,
      sharedPlans: 1,
      age: undefined,
      insideNow: true,
      youLiked: false,
    })
  })
})

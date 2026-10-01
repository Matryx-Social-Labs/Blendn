import {
  JUST_ARRIVED_MS,
  REASON_MAX,
  everyoneHead,
  hereNowStack,
  meetNext,
  pickTonight,
  reasonLine,
  shuffleCountdownLabel,
  startsLabel,
  timeHereLabel,
} from '../lib/roomMoments'

/**
 * The Room's sentences and clocks.
 *
 * The rules worth pinning are the ones that fail quietly: a reason line that
 * wraps under a face, a "Meet next" that reshuffles on every render, a
 * countdown that goes negative, a LIVE tag on something that ended.
 */

const NOW = new Date(2026, 8, 28, 20, 0, 0).getTime()
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString()
const minutesFromNow = (m: number) => new Date(NOW + m * 60_000).toISOString()

describe('reasonLine', () => {
  it('leads with dating, because the server only sends it when it is mutual', () => {
    expect(
      reasonLine({ sharedIntents: ['networking', 'dating'], sharedPlans: 2, interests: ['Jazz'] }, NOW)
    ).toBe('Both open to dating')
  })

  it('then plans, then history, in the Grid card order', () => {
    expect(reasonLine({ sharedPlans: 2, sharedEvents: 3 }, NOW)).toBe('Going to 2 more together')
    expect(reasonLine({ sharedEvents: 3, interests: ['Jazz'] }, NOW)).toBe('Both at 3 nights before')
    expect(reasonLine({ sharedEvents: 1 }, NOW)).toBe('Both at 1 night before')
  })

  it('never claims two people met', () => {
    for (const n of [1, 2, 9, 40]) {
      expect(reasonLine({ sharedEvents: n }, NOW)).not.toMatch(/met/i)
    }
  })

  it('then interests as a count and the first one', () => {
    expect(reasonLine({ interests: ['Jazz', 'Techno', 'Chess'] }, NOW)).toBe('3 shared · Jazz')
    expect(reasonLine({ interests: ['Jazz'] }, NOW)).toBe('1 shared · Jazz')
  })

  it('then the shared field, only when the server says it is shared', () => {
    expect(reasonLine({ sharedWorkField: true, workField: 'Design' }, NOW)).toBe('Both in Design')
    expect(reasonLine({ sharedWorkField: false, workField: 'Design' }, NOW)).toBe('Here now')
    expect(reasonLine({ sharedWorkField: true, workField: null }, NOW)).toBe('Here now')
  })

  it('says "Just walked in" for ten minutes, then falls back to presence', () => {
    expect(reasonLine({ arrivedAt: minutesAgo(3) }, NOW)).toBe('Just walked in')
    expect(reasonLine({ arrivedAt: new Date(NOW - JUST_ARRIVED_MS).toISOString() }, NOW)).toBe(
      'Here now'
    )
    expect(reasonLine({ arrivedAt: 'not a date' }, NOW)).toBe('Here now')
  })

  it('says somebody who checked out was here, never that they are checked in (SCRUM-495)', () => {
    expect(reasonLine({ insideNow: false }, NOW)).toBe('Was here')
    // Not "Just walked in" either, for the ten minutes after they arrived.
    expect(reasonLine({ insideNow: false, arrivedAt: minutesAgo(3) }, NOW)).toBe('Was here')
    expect(reasonLine({}, NOW)).toBe('Here now')
  })

  it('always fits under a face', () => {
    const lines = [
      reasonLine({ sharedPlans: 12 }, NOW),
      reasonLine({ sharedPlans: 1234 }, NOW),
      reasonLine({ sharedEvents: 99 }, NOW),
      reasonLine({ sharedEvents: 12345 }, NOW),
      reasonLine({ interests: ['Classical and Carnatic music appreciation'] }, NOW),
      reasonLine({ interests: new Array(120).fill('Jazz and blues') }, NOW),
      reasonLine({ sharedWorkField: true, workField: 'Architecture and urban planning' }, NOW),
    ]
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(REASON_MAX)
    expect(reasonLine({ sharedPlans: 12 }, NOW)).toBe('Both going to 12 more')
    expect(reasonLine({ interests: ['Classical and Carnatic'] }, NOW)).toBe('1 shared · Classical an…')
  })

  it('ignores blank interest names rather than printing an empty label', () => {
    expect(reasonLine({ interests: ['  ', ''] }, NOW)).toBe('Here now')
  })
})

describe('meetNext', () => {
  const people = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, matched: false }))
  const WINDOW = 15 * 60_000

  it('holds the same picks for the whole window', () => {
    const start = Math.floor(NOW / WINDOW) * WINDOW
    const a = meetNext(people, { now: start, eventId: 'e1' })
    const b = meetNext(people, { now: start + WINDOW - 1, eventId: 'e1' })
    expect(b.picks).toEqual(a.picks)
    expect(a.nextShuffleAt).toBe(start + WINDOW)
    expect(b.nextShuffleAt).toBe(start + WINDOW)
  })

  it('moves to different people in the next window', () => {
    const a = meetNext(people, { now: NOW, eventId: 'e1' })
    const b = meetNext(people, { now: NOW + WINDOW, eventId: 'e1' })
    expect(b.picks.map((p) => p.id)).not.toEqual(a.picks.map((p) => p.id))
  })

  it('agrees across phones: same event and time, same picks', () => {
    const copy = people.map((p) => ({ ...p }))
    expect(meetNext(copy, { now: NOW, eventId: 'e1' }).picks.map((p) => p.id)).toEqual(
      meetNext(people, { now: NOW, eventId: 'e1' }).picks.map((p) => p.id)
    )
  })

  it('only reaches into the top of the ranking, and covers all of it over time', () => {
    const seen = new Set<string>()
    for (let w = 0; w < 9; w++) {
      const { picks } = meetNext(people, { now: NOW + w * WINDOW, eventId: 'e1', pool: 9 })
      expect(picks).toHaveLength(3)
      picks.forEach((p) => seen.add(p.id))
    }
    expect([...seen].sort()).toEqual(people.slice(0, 9).map((p) => p.id).sort())
  })

  it('returns picks in rank order', () => {
    for (let w = 0; w < 5; w++) {
      const ids = meetNext(people, { now: NOW + w * WINDOW, eventId: 'x' }).picks.map((p) =>
        Number(p.id.slice(1))
      )
      expect([...ids].sort((a, b) => a - b)).toEqual(ids)
    }
  })

  it('skips people you already matched', () => {
    const withMatch = people.map((p, i) => (i < 2 ? { ...p, matched: true } : p))
    for (let w = 0; w < 5; w++) {
      const { picks } = meetNext(withMatch, { now: NOW + w * WINDOW, eventId: 'e1' })
      expect(picks.some((p) => p.matched)).toBe(false)
    }
  })

  it('is stable when there are no more people than picks', () => {
    const few = people.slice(0, 2)
    const a = meetNext(few, { now: NOW, eventId: 'e1' })
    const b = meetNext(few, { now: NOW + 5 * WINDOW, eventId: 'e1' })
    expect(a.picks.map((p) => p.id)).toEqual(['p0', 'p1'])
    expect(b.picks).toEqual(a.picks)
    expect(meetNext([], { now: NOW, eventId: 'e1' }).picks).toEqual([])
  })
})

/*
 * The room's pool is everyone who checked in to the event at all, so somebody
 * who has gone home is still in `people` with `insideNow: false` (SCRUM-495).
 * "1 here now" sat over the face of the one person who had left.
 */
describe('who is here now', () => {
  const here = (id: string) => ({ id, insideNow: true })
  const left = (id: string) => ({ id, insideNow: false })
  const ids = (xs: { id: string }[]) => xs.map((p) => p.id)

  it('puts only people inside under "here now", arrivals first, without repeats', () => {
    const stack = hereNowStack([here('x'), here('a'), left('b')], [left('c'), here('a'), here('d')], 5)
    expect(ids(stack)).toEqual(['x', 'a', 'd'])
  })

  it('fills the stack from people inside, however many ahead of them left', () => {
    const people = [left('a'), left('b'), here('c'), left('d'), left('e'), here('f'), here('g')]
    expect(ids(hereNowStack([], people, 3))).toEqual(['c', 'f', 'g'])
  })

  it('counts somebody presence says nothing about as inside', () => {
    expect(ids(hereNowStack([], [{ id: 'a' }], 3))).toEqual(['a'])
    expect(everyoneHead([{}], { hasMore: false, hereCount: 2 }).title).toBe('Everyone here')
  })

  it('never suggests meeting somebody who has left, and still finds three who are here', () => {
    // Eight who left rank above four who are here: the rotation's pool of nine
    // must be nine people inside, not nine people with one inside among them.
    const people = [...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(left), ...['i', 'j', 'k', 'l'].map(here)]
    for (let w = 0; w < 8; w++) {
      const { picks } = meetNext(people, { now: NOW + w * 15 * 60_000, eventId: 'e1' })
      expect(picks).toHaveLength(3)
      expect(picks.every((p) => p.insideNow)).toBe(true)
    }
    expect(ids(meetNext([left('a'), here('b')], { now: NOW, eventId: 'e1' }).picks)).toEqual(['b'])
  })

  it('calls the grid "Everyone here" only while everyone in it is', () => {
    const head = (people: { insideNow?: boolean }[]) => everyoneHead(people, { hasMore: false, hereCount: 9 })
    expect(head([here('a'), here('b')])).toEqual({ title: 'Everyone here', count: 2 })
    expect(head([])).toEqual({ title: 'Everyone here', count: 0 })
    expect(head([here('a'), left('b')])).toEqual({ title: 'Everyone who came', count: 2 })
  })

  it("gives the room's number only where it is the right kind of number", () => {
    // With more to load, the number is the room's count of people inside:
    // true of "Everyone here", the wrong number for "Everyone who came".
    expect(everyoneHead([here('a')], { hasMore: true, hereCount: 30 })).toEqual({ title: 'Everyone here', count: 29 })
    expect(everyoneHead([here('a'), left('b')], { hasMore: true, hereCount: 30 })).toEqual({
      title: 'Everyone who came',
      count: 0,
    })
  })
})

describe('timeHereLabel', () => {
  it('counts minutes, then hours and minutes, then stops at 3h+', () => {
    expect(timeHereLabel(minutesAgo(0), NOW)).toBe('Just now')
    expect(timeHereLabel(minutesAgo(12), NOW)).toBe('12m')
    expect(timeHereLabel(minutesAgo(72), NOW)).toBe('1h 12m')
    expect(timeHereLabel(minutesAgo(120), NOW)).toBe('2h')
    expect(timeHereLabel(minutesAgo(179), NOW)).toBe('2h 59m')
    expect(timeHereLabel(minutesAgo(180), NOW)).toBe('3h+')
    expect(timeHereLabel(minutesAgo(600), NOW)).toBe('3h+')
  })

  it('says nothing without a time, and never goes negative', () => {
    expect(timeHereLabel(null, NOW)).toBe('')
    expect(timeHereLabel('nope', NOW)).toBe('')
    expect(timeHereLabel(minutesFromNow(5), NOW)).toBe('Just now')
  })
})

describe('shuffleCountdownLabel', () => {
  it('reads m:ss and never goes below 0:00', () => {
    expect(shuffleCountdownLabel(NOW + (4 * 60 + 12) * 1000, NOW)).toBe('4:12')
    expect(shuffleCountdownLabel(NOW + 15 * 60_000, NOW)).toBe('15:00')
    expect(shuffleCountdownLabel(NOW + 5_000, NOW)).toBe('0:05')
    expect(shuffleCountdownLabel(NOW + 400, NOW)).toBe('0:01')
    expect(shuffleCountdownLabel(NOW - 1000, NOW)).toBe('0:00')
  })
})

describe('startsLabel', () => {
  it('LIVE while running, ENDED after', () => {
    expect(startsLabel({ startsAt: minutesAgo(30), endsAt: minutesFromNow(60) }, NOW)).toEqual({
      kind: 'live',
      text: 'LIVE',
    })
    expect(startsLabel({ startsAt: minutesAgo(120), endsAt: minutesAgo(1) }, NOW)).toEqual({
      kind: 'ended',
      text: 'ENDED',
    })
  })

  it('minutes under an hour, rounded up', () => {
    expect(startsLabel({ startsAt: minutesFromNow(25) }, NOW)).toEqual({ kind: 'soon', text: 'IN 25M' })
    expect(startsLabel({ startsAt: new Date(NOW + 20_000).toISOString() }, NOW).text).toBe('IN 1M')
  })

  it('hours up to six, then the clock time', () => {
    expect(startsLabel({ startsAt: minutesFromNow(120) }, NOW)).toEqual({ kind: 'later', text: 'IN 2H' })
    expect(startsLabel({ startsAt: minutesFromNow(110) }, NOW).text).toBe('IN 2H')
    const eightThirtyTomorrow = new Date(2026, 8, 29, 20, 30).toISOString()
    expect(startsLabel({ startsAt: eightThirtyTomorrow }, NOW)).toEqual({ kind: 'later', text: '8:30 PM' })
    const morning = new Date(2026, 8, 29, 9, 5).toISOString()
    expect(startsLabel({ startsAt: morning }, NOW).text).toBe('9:05 AM')
    const midnight = new Date(2026, 8, 29, 0, 0).toISOString()
    expect(startsLabel({ startsAt: midnight, endsAt: null }, NOW - 12 * 3600_000).text).toBe('12:00 AM')
  })

  it('has nothing to say about a missing start', () => {
    expect(startsLabel({ startsAt: null }, NOW)).toEqual({ kind: 'later', text: '' })
  })
})

describe('pickTonight', () => {
  const ev = (id: string, startMin: number, endMin: number | null, distanceKm: number | null, going = false) => ({
    id,
    startsAt: minutesFromNow(startMin),
    endsAt: endMin === null ? null : minutesFromNow(endMin),
    distanceKm,
    going,
  })

  it('keeps what is live or starts within six hours', () => {
    const picked = pickTonight(
      [
        ev('live', -30, 120, 1),
        ev('soon', 60, 240, 2),
        ev('tomorrow', 7 * 60, 9 * 60, 0.1),
        ev('over', -180, -1, 0.2),
      ],
      NOW
    ).map((e) => e.id)
    expect(picked).toEqual(['live', 'soon'])
  })

  it('puts yours first, then nearest, then soonest', () => {
    const picked = pickTonight(
      [
        ev('far', 10, 200, 9),
        ev('near', 100, 200, 0.5),
        ev('mine', 200, 300, 20, true),
        ev('noDistLate', 90, 200, null),
        ev('noDistEarly', 30, 200, null),
      ],
      NOW
    ).map((e) => e.id)
    expect(picked).toEqual(['mine', 'near', 'far', 'noDistEarly', 'noDistLate'])
  })

  it('does not keep an event with no end time live for ever', () => {
    expect(pickTonight([ev('open', -60, null, 1)], NOW)).toHaveLength(1)
    expect(pickTonight([ev('stale', -7 * 60, null, 1)], NOW)).toHaveLength(0)
  })
})

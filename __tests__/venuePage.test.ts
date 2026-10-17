import type { VenueDetail } from '../lib/apiClient'
import {
  againLabel,
  apiChoice,
  boardEventId,
  bucketWord,
  clock24,
  dayLabel,
  dialChoice,
  dockMode,
  goodToKnow,
  kmParam,
  liveWords,
  nextTickMs,
  ringWords,
  sessionTime,
  spokenLeft,
  timeRange,
  upcomingRows,
  venueGate,
  venueHero,
  venueTiles,
  whereLine,
  ZERO_RETRY_MS,
} from '../lib/venuePage'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

const NOW = new Date(2026, 9, 17, 21, 0, 0).getTime()
const min = (n: number) => NOW + n * 60_000
const iso = (ms: number) => new Date(ms).toISOString()

const detail = (over: { venue?: Partial<VenueDetail['venue']>; live?: Partial<VenueDetail['live']>; tonight?: VenueDetail['tonight'] } = {}): VenueDetail => ({
  venue: { id: 'v1', name: 'Toit', address: '100 Feet Road', city: 'Bengaluru', latitude: 12.97, longitude: 77.64, venueTypeLabel: 'Brewery', claimed: false, ...over.venue },
  live: { open: true, closedReason: null, eventId: null, liveNow: '5-9', youAreLive: false, ...over.live },
  claim: null,
  tonight: over.tonight ?? null,
})

describe('the hero', () => {
  it('tonight’s cover when there is one — the only artwork a venue has — else the type’s plate', () => {
    const tonight = { id: 'e1', title: 'Vinyl Night', startTime: iso(min(60)), endTime: iso(min(240)), coverImageUrl: 'https://cdn.example/c.jpg' }
    expect(venueHero(detail({ tonight }))).toEqual({ kind: 'cover', uri: 'https://cdn.example/c.jpg' })
    expect(venueHero(detail({ venue: { venueType: 'brewery' }, tonight: { ...tonight, coverImageUrl: null } }))).toEqual({ kind: 'plate', plate: 'brewery' })
    expect(venueHero(detail({ venue: { venueType: 'restaurant' } }))).toEqual({ kind: 'plate', plate: 'restaurant' })
    // A server that does not send the type yet: the bar’s plate, never a grey box.
    expect(venueHero(detail())).toEqual({ kind: 'plate', plate: 'bar' })
  })
})

describe('the tiles', () => {
  it('draws only the fields the server sent, in the design’s order', () => {
    expect(venueTiles(detail({ live: { liveNow: null } }), NOW)).toEqual([])
    expect(venueTiles(detail(), NOW)).toEqual([{ label: 'LIVE', value: '5–9 so far', mono: false }])
    const full = detail({ venue: { hours: { opensAt: iso(min(-300)), closesAt: iso(min(240)) }, dayResetHour: 6, capacity: 300 } })
    expect(venueTiles(full, NOW)).toEqual([
      { label: 'OPEN', value: 'Till 1 AM', mono: true },
      { label: 'LIVE', value: '5–9 so far', mono: false },
      { label: 'RESET', value: '06:00', mono: true },
      { label: 'SIZE', value: '300 people', mono: true },
    ])
  })

  it('Open: before it opens, after it closes', () => {
    const open = (a: number, b: number) => venueTiles(detail({ venue: { hours: { opensAt: iso(min(a)), closesAt: iso(min(b)) } }, live: { liveNow: null } }), NOW)[0]
    expect(open(180, 600).value).toBe('Opens 12 AM')
    expect(open(-600, -60).value).toBe('Closed')
  })

  it('the live tile is a bucket, never below the floor', () => {
    for (const bucket of ['quiet', '5-9', '10-19', '20+'] as const) {
      expect(bucketWord(bucket)).not.toMatch(/(^|[^–\d])[0-4]($|[^\d])/)
    }
  })

  it('a reset hour that is not an hour, or an empty capacity, is not a tile', () => {
    expect(venueTiles(detail({ venue: { dayResetHour: 30, capacity: 0 }, live: { liveNow: null } }), NOW)).toEqual([])
    expect(venueTiles(detail({ venue: { capacity: 1 }, live: { liveNow: null } }), NOW)).toEqual([{ label: 'SIZE', value: '1 person', mono: true }])
  })
})

describe('good to know, coming up, the board', () => {
  it('one tile per amenity; a nameless one is dropped, not drawn blank', () => {
    expect(goodToKnow([{ id: 'a', name: ' Rooftop ' }, { id: 'b', name: '  ' }])).toEqual([{ label: 'GOOD TO KNOW', value: 'Rooftop' }])
    expect(goodToKnow(null)).toEqual([])
  })

  it('the first three upcoming events with their day and going count', () => {
    const rows = upcomingRows([
      { id: 'a', title: 'Bass Thursday', startTime: new Date(2026, 9, 22, 22).toISOString(), goingCount: 31 },
      { id: 'b', title: 'Comedy', startTime: new Date(2026, 9, 24, 21).toISOString(), goingCount: 0 },
      { id: 'c', title: 'Trivia', startTime: new Date(2026, 9, 29, 21).toISOString() },
      { id: 'd', title: 'Fourth', startTime: new Date(2026, 9, 30, 21).toISOString() },
    ])
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ id: 'a', title: 'Bass Thursday', day: 'Thu 22 Oct', going: '31 going' })
    expect(rows[1].going).toBeNull()
    expect(upcomingRows(undefined)).toEqual([])
  })

  it('the Board row is for an event here that has not opened its doors', () => {
    const tonight = (startMin: number) => ({ id: 'e1', title: 'Vinyl Night', startTime: iso(min(startMin)), endTime: iso(min(startMin + 180)) })
    expect(boardEventId(tonight(60), NOW)).toBe('e1')
    expect(boardEventId(tonight(-10), NOW)).toBeNull()
    expect(boardEventId(null, NOW)).toBeNull()
  })

  it('dates read in the phone’s local day', () => {
    expect(dayLabel(new Date(2026, 9, 9, 22).toISOString())).toBe('Fri 9 Oct')
    expect(dayLabel('nonsense')).toBe('')
    expect(timeRange(new Date(2026, 9, 9, 21).toISOString(), new Date(2026, 9, 10, 1).toISOString())).toBe('9 PM – 1 AM')
  })

  it('where line: city and distance, whichever is known', () => {
    expect(whereLine('Bengaluru', 0.35)).toBe('Bengaluru · 350 m')
    expect(whereLine(null, 4.8)).toBe('4.8 km')
    expect(whereLine('Bengaluru', null)).toBe('Bengaluru')
  })
})

describe('the dock', () => {
  it('one slot: go live, live, the hand-off, or the server’s sentence', () => {
    expect(dockMode({ kind: 'goLive' }, null)).toEqual({ kind: 'goLive', again: null })
    expect(dockMode({ kind: 'goLive' }, { minutes: 45 })).toEqual({ kind: 'goLive', again: { minutes: 45 } })
    expect(dockMode({ kind: 'live' }, null)).toEqual({ kind: 'live' })
    expect(dockMode({ kind: 'handoff', eventId: 'e1' }, null)).toEqual({ kind: 'handoff', eventId: 'e1' })
    expect(dockMode({ kind: 'closed', message: 'You can’t go live here yet.' }, null)).toEqual({ kind: 'closed', message: 'You can’t go live here yet.' })
  })

  it('go live again names the window; a stay is never repeated in one tap', () => {
    expect(againLabel({ minutes: 45 })).toBe('Go live again · 45 minutes')
    expect(againLabel({ minutes: 60 })).toBe('Go live again · 1 hour')
    expect(againLabel({ stay: true })).toBe('Go live again')
  })

  it('the dial and the API speak about the same windows', () => {
    expect(dialChoice({ minutes: 20 })).toBe(20)
    expect(dialChoice({ stay: true })).toBe('stay')
    expect(apiChoice(60)).toEqual({ minutes: 60 })
    expect(apiChoice('stay')).toEqual({ stay: true })
  })
})

describe('where your window stands', () => {
  it('minutes with the end clock; the last five minutes as mm:ss with the new end an Extend gives; stay', () => {
    expect(sessionTime({ expiresAt: iso(min(32)) }, NOW)).toEqual({ kind: 'minutes', left: 32, until: clock24(min(32)) })
    // Partial minutes round up: 31:01 left reads 32.
    expect(sessionTime({ expiresAt: iso(min(31) + 1000) }, NOW)).toMatchObject({ kind: 'minutes', left: 32 })
    expect(sessionTime({ expiresAt: iso(min(5)) }, NOW)).toEqual({ kind: 'ending', clock: '5:00', extendUntil: clock24(min(45)) })
    expect(sessionTime({ expiresAt: iso(NOW + 4 * 60_000 + 59_000) }, NOW)).toMatchObject({ kind: 'ending', clock: '4:59' })
    expect(sessionTime({ expiresAt: iso(min(10)), stay: true, stayUntil: iso(min(200)) }, NOW)).toEqual({ kind: 'stay', endsBy: clock24(min(200)) })
    // A stay with no hard end sent: says nothing about one.
    expect(sessionTime({ expiresAt: iso(min(10)), stay: true }, NOW)).toEqual({ kind: 'stay', endsBy: undefined })
    expect(sessionTime({ expiresAt: null }, NOW)).toBeNull()
  })

  it('the ticks: when the minute turns, each second in the last five, never for a stay, a retry at zero', () => {
    // 365 s left reads 7 min and turns to 6 in 5 s.
    expect(nextTickMs({ expiresAt: iso(NOW + 365_000) }, NOW)).toBe(5_000)
    expect(nextTickMs({ expiresAt: iso(min(32)) }, NOW)).toBe(60_000)
    expect(nextTickMs({ expiresAt: iso(min(5) - 1) }, NOW)).toBe(1_000)
    expect(nextTickMs({ expiresAt: iso(min(2)), stay: true }, NOW)).toBeNull()
    expect(nextTickMs({ expiresAt: iso(NOW - 1000) }, NOW)).toBe(ZERO_RETRY_MS)
    expect(nextTickMs({ expiresAt: null }, NOW)).toBeNull()
  })

  it('the words on the pill, the ring and for a screen reader', () => {
    const t = sessionTime({ expiresAt: iso(min(42)) }, NOW)
    expect(liveWords(t)).toBe('You’re live · 42 min')
    expect(ringWords(t)).toBe('Live · 42 min left')
    expect(spokenLeft(t!)).toBe('42 minutes left')
    const ending = sessionTime({ expiresAt: iso(NOW + 4 * 60_000 + 59_000) }, NOW)!
    expect(liveWords(ending)).toBe('You’re live · 4:59')
    expect(spokenLeft(ending)).toBe('4:59 left, ending soon')
    const stay = sessionTime({ expiresAt: null, stay: true }, NOW)!
    expect(liveWords(stay)).toBe('You’re live · staying')
    expect(ringWords(stay)).toBe('Live · staying')
    expect(liveWords(null)).toBe('You’re live')
  })
})

describe('a read that did not come back', () => {
  it('a refusal no retry fixes is the server’s own sentence; no such place is its own state; anything else may pass', () => {
    expect(venueGate('FORBIDDEN', 'Finish setting up first.')).toEqual({ kind: 'refused', icon: 'id-card', title: 'Not yet', body: 'Finish setting up first.' })
    expect(venueGate('AGE_RESTRICTED', undefined)).toMatchObject({ kind: 'refused', body: expect.stringMatching(/18/) })
    expect(venueGate('NOT_FOUND', 'Venue not found')).toEqual({ kind: 'notFound' })
    expect(venueGate(undefined, undefined)).toEqual({ kind: 'failed' })
    expect(venueGate('SERVER_ERROR', 'boom')).toEqual({ kind: 'failed' })
  })

  it('the distance the list handed over is a plain number or nothing (a link can carry anything)', () => {
    expect(kmParam('0.35')).toBe(0.35)
    expect(kmParam('12')).toBe(12)
    expect(kmParam('1e9')).toBeNull()
    expect(kmParam('-3')).toBeNull()
    expect(kmParam('x')).toBeNull()
    expect(kmParam(undefined)).toBeNull()
  })
})

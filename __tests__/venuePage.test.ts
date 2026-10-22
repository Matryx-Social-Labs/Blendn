import type { VenueDetail } from '../lib/apiClient'
import {
  againLabel,
  apiChoice,
  boardEventId,
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
  sheetRefusal,
  liveToast,
  washColor,
  ZERO_RETRY_MS,
} from '../lib/venuePage'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

const NOW = new Date(2026, 9, 17, 21, 0, 0).getTime()
const min = (n: number) => NOW + n * 60_000
const iso = (ms: number) => new Date(ms).toISOString()

/**
 * `GET /venues/:venueId` as the server sends it (app/api/mobile/venues/[venueId]/route.ts, admin origin/dev): the week's
 * `hours` as `{ day, open, close }` rows in wall-clock HH:MM, `amenities` as names, `upcoming` without a going count.
 * NOW is a Saturday, 21:00 (day 6).
 */
const SAT = 6
const hoursOf = (...rows: { day: number; open: string; close: string }[]) => rows

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
    const full = detail({ venue: { hours: hoursOf({ day: SAT, open: '16:00', close: '01:00' }), dayResetHour: 6, capacity: 300 } })
    expect(venueTiles(full, NOW)).toEqual([
      { label: 'OPEN', value: 'Till 1 AM', mono: true },
      { label: 'LIVE', value: '5–9 so far', mono: false },
      { label: 'RESET', value: '06:00', mono: true },
      { label: 'SIZE', value: '300 people', mono: true },
    ])
  })

  it('Open: before it opens, while it is open past midnight, after it closes', () => {
    const open = (...rows: { day: number; open: string; close: string }[]) =>
      venueTiles(detail({ venue: { hours: rows }, live: { liveNow: null } }), NOW)[0]
    expect(open({ day: SAT, open: '23:00', close: '02:00' }).value).toBe('Opens 11 PM')
    expect(open({ day: SAT, open: '18:00', close: '01:00' }).value).toBe('Till 1 AM')
    expect(open({ day: SAT, open: '12:00', close: '15:00' }).value).toBe('Closed')
  })

  it('Open: hours given for other days only is Closed today; a split day answers with its evening opening', () => {
    const open = (...rows: { day: number; open: string; close: string }[]) =>
      venueTiles(detail({ venue: { hours: rows }, live: { liveNow: null } }), NOW)[0]
    expect(open({ day: 1, open: '12:00', close: '23:00' }).value).toBe('Closed')
    expect(open({ day: SAT, open: '12:00', close: '15:00' }, { day: SAT, open: '19:00', close: '23:30' }).value).toBe('Till 11:30 PM')
  })

  it('Open: the venue day starts at its reset hour, so 01:00 Sunday is still Saturday’s row', () => {
    const sunday1am = new Date(2026, 9, 18, 1, 0, 0).getTime()
    const at = (hours: { day: number; open: string; close: string }[], reset: number) =>
      venueTiles(detail({ venue: { hours, dayResetHour: reset }, live: { liveNow: null } }), sunday1am)[0]
    expect(at([{ day: SAT, open: '18:00', close: '02:00' }], 6).value).toBe('Till 2 AM')
    // With a midnight reset it is already Sunday, which has no row.
    expect(at([{ day: SAT, open: '18:00', close: '02:00' }], 0).value).toBe('Closed')
  })

  it('no hours, an empty list, or rows that are not the server’s shape draw no Open tile', () => {
    const tiles = (hours: unknown) => venueTiles(detail({ venue: { hours: hours as never }, live: { liveNow: null } }), NOW)
    expect(tiles(null)).toEqual([])
    expect(tiles([])).toEqual([])
    expect(tiles({ opensAt: iso(min(-60)), closesAt: iso(min(60)) })).toEqual([])
    expect(tiles([{ day: SAT, open: 18, close: null }])[0].value).toBe('Closed')
    expect(tiles([{ day: SAT, open: 'late', close: 'later' }])[0].value).toBe('Closed')
  })

  it('the live tile is a bucket, and under five there is no live tile at all', () => {
    expect(venueTiles(detail({ live: { liveNow: 'quiet' } }), NOW)).toEqual([])
    expect(venueTiles(detail({ live: { liveNow: '20+' } }), NOW)).toEqual([{ label: 'LIVE', value: '20+ so far', mono: false }])
  })

  it('a reset hour that is not an hour, or an empty capacity, is not a tile', () => {
    expect(venueTiles(detail({ venue: { dayResetHour: 30, capacity: 0 }, live: { liveNow: null } }), NOW)).toEqual([])
    expect(venueTiles(detail({ venue: { capacity: 1 }, live: { liveNow: null } }), NOW)).toEqual([{ label: 'SIZE', value: '1 person', mono: true }])
  })
})

describe('good to know, coming up, the board', () => {
  it('one tile per amenity; a nameless one is dropped, not drawn blank', () => {
    // The server sends the names, `string[]`.
    expect(goodToKnow([' Rooftop ', '  ', 'Live music'])).toEqual([
      { label: 'GOOD TO KNOW', value: 'Rooftop' },
      { label: 'GOOD TO KNOW', value: 'Live music' },
    ])
    expect(goodToKnow(null)).toEqual([])
    expect(goodToKnow([{ id: 'a', name: 'Rooftop' }] as never)).toEqual([])
  })

  it('upcoming events as the server sends them (no going count) with their day', () => {
    const row = (id: string, title: string, start: Date) => ({
      id,
      title,
      slug: null,
      coverImageUrl: null,
      startTime: start.toISOString(),
      endTime: new Date(start.getTime() + 3 * 3_600_000).toISOString(),
    })
    const rows = upcomingRows([
      row('a', 'Bass Thursday', new Date(2026, 9, 22, 22)),
      row('b', 'Comedy', new Date(2026, 9, 24, 21)),
      row('c', 'Trivia', new Date(2026, 9, 29, 21)),
      row('d', 'Fourth', new Date(2026, 9, 30, 21)),
    ])
    // All four are rows; the page shows UPCOMING_SHOWN of them and keeps the rest behind See all.
    expect(rows).toHaveLength(4)
    expect(rows[0]).toEqual({ id: 'a', title: 'Bass Thursday', day: 'Thu 22 Oct', going: null })
    // A later server that adds a count gets it drawn; zero is not drawn.
    expect(upcomingRows([{ ...row('e', 'Quiz', new Date(2026, 9, 31, 20)), goingCount: 12 }])[0].going).toBe('12 going')
    expect(upcomingRows([{ ...row('f', 'Quiz', new Date(2026, 9, 31, 20)), goingCount: 0 }])[0].going).toBeNull()
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

  it('upcoming: every event with a title and a day; the page shows three and the rest sit behind See all', () => {
    const e = (n: number) => ({ id: `e${n}`, title: `T${n}`, startTime: new Date(2026, 9, 20 + n, 21).toISOString() })
    expect(upcomingRows([e(1), e(2), e(3), e(4), { ...e(5), title: '' }])).toHaveLength(4)
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

describe('a refusal of Go Live, as the sheet draws it', () => {
  const refused = (reason: string, over = {}) => ({ kind: 'refused' as const, reason, title: 'Server title', message: 'Server words.', offerDirections: false, ...over }) as never
  it('each answer is its own sheet, with the server’s sentence where the design shows server copy', () => {
    expect(sheetRefusal(refused('notHere'))).toEqual({ kind: 'notHere', message: 'Server words.' })
    expect(sheetRefusal(refused('gps'))).toEqual({ kind: 'gps', message: 'Server words.' })
    expect(sheetRefusal(refused('timeout'))).toEqual({ kind: 'timeout', message: 'Server words.' })
    expect(sheetRefusal(refused('rate'))).toEqual({ kind: 'rate', message: 'Server words.' })
    expect(sheetRefusal(refused('noArea'))).toEqual({ kind: 'noArea', message: 'Server words.' })
    expect(sheetRefusal(refused('age'))).toEqual({ kind: 'age', message: 'Server words.' })
    expect(sheetRefusal(refused('other'))).toEqual({ kind: 'other', title: 'Server title', message: 'Server words.' })
  })

  it('an event that has the place is a hand-off to its check-in; Blend’n+ for a stay is its own sheet', () => {
    expect(sheetRefusal({ kind: 'handoff', eventId: 'e1', message: 'On.' })).toEqual({ kind: 'eventOn', eventId: 'e1', message: 'On.' })
    expect(sheetRefusal({ kind: 'plus' })).toEqual({ kind: 'stay' })
  })

  it('the success toast writes 24-hour time and, for a stay, names no end (it rolls)', () => {
    expect(liveToast({ expiresAt: iso(min(45)), stay: false })).toBe(`You’re live until ${clock24(min(45))}`)
    expect(liveToast({ expiresAt: iso(min(45)), stay: true })).toBe('You’re live for as long as you’re here')
    expect(liveToast({ expiresAt: 'nonsense' })).toBe('You’re live')
  })

  it('the wash under the hero takes the plate’s second colour; a cover uses the brewery’s, the design’s own', () => {
    expect(washColor({ kind: 'plate', plate: 'bar' })).toBe('#4A3A2E')
    expect(washColor({ kind: 'plate', plate: 'restaurant' })).toBe('#3A2A24')
    expect(washColor({ kind: 'cover', uri: 'x' })).toBe('#5A3328')
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

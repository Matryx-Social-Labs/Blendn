import type { VenueListItem } from '../lib/apiClient'
import {
  distanceText,
  EAGER_PAGES,
  mayReadNext,
  peekLine,
  placeLabel,
  placeRows,
  PLACE_TYPES,
  placesCount,
  plateFor,
  quietLine,
  splitPlaces,
  tonightEvent,
} from '../lib/placesPane'

const NOW = new Date(2026, 9, 17, 18, 0).getTime()
const at = (h: number, m = 0, day = 0) => new Date(2026, 9, 17 + day, h, m).toISOString()

const venue = (over: Partial<VenueListItem> = {}): VenueListItem => ({
  id: 'v1',
  name: 'Toit',
  address: '298, 100 Feet Road',
  city: 'Bengaluru',
  latitude: 12.97,
  longitude: 77.64,
  venueType: 'brewery',
  venueTypeLabel: 'Brewery',
  distance: 0.35,
  upcomingEventCount: 0,
  liveNow: 'quiet',
  nextEvent: null,
  ...over,
})
const event = (startH: number, endH: number, day = 0) => ({
  id: 'e1',
  title: 'Vinyl Night',
  slug: null,
  coverImageUrl: 'https://cdn.example/toit.jpg',
  startTime: at(startH, 0, day),
  endTime: at(endH, 0, day),
})

describe('the plates', () => {
  it('draws each server type on its plate, and the bar’s for a type with none', () => {
    expect(plateFor('pub_bar')).toBe('bar')
    expect(plateFor('brewery')).toBe('brewery')
    expect(plateFor('nightclub')).toBe('club')
    expect(plateFor('live_music_venue')).toBe('liveMusic')
    expect(plateFor('lounge_rooftop')).toBe('gardenBar')
    expect(plateFor('cafe')).toBe('cafe')
    expect(plateFor('restaurant')).toBe('restaurant')
    expect(plateFor('stadium')).toBe('bar')
    expect(plateFor(null)).toBe('bar')
  })

  it('the chip row asks the server for a type it has', () => {
    expect(PLACE_TYPES.map((t) => t.label)).toEqual(['All', 'Bars', 'Breweries', 'Clubs', 'Live music', 'Cafés'])
    expect(PLACE_TYPES.map((t) => t.venueType)).toEqual([null, 'pub_bar', 'brewery', 'nightclub', 'live_music_venue', 'cafe'])
  })
})

describe('words', () => {
  it('distance: metres to the nearest 50 under a kilometre, kilometres above, nothing without a fix', () => {
    expect(distanceText(0.35)).toBe('350 m')
    expect(distanceText(0.02)).toBe('50 m')
    expect(distanceText(4.84)).toBe('4.8 km')
    expect(distanceText(null)).toBeNull()
    expect(distanceText(-1)).toBeNull()
  })

  it('counts and the fold line', () => {
    expect(placesCount(1)).toBe('1 place')
    expect(placesCount(3)).toBe('3 places')
    expect(quietLine(1, false)).toBe('1 quiet place')
    expect(quietLine(12, false)).toBe('12 quiet places')
    // Pages remain: the number is what has been read, not a total.
    expect(quietLine(12, true)).toBe('12+ quiet places')
  })
})

describe('tonight’s event at a place', () => {
  it('reads in the one date grammar: Live, In 25 min, 9 PM', () => {
    expect(tonightEvent(event(17, 23), NOW)).toMatchObject({ when: 'Live', title: 'Vinyl Night' })
    expect(tonightEvent({ ...event(18, 23), startTime: at(18, 25) }, NOW)).toMatchObject({ when: 'In 25 min' })
    expect(tonightEvent(event(21, 23), NOW)).toMatchObject({ when: '9 PM', cover: 'https://cdn.example/toit.jpg' })
  })

  it('is nothing when the next event is another day, or over', () => {
    expect(tonightEvent(event(21, 23, 1), NOW)).toBeNull()
    expect(tonightEvent(event(10, 12), NOW)).toBeNull()
    expect(tonightEvent(null, NOW)).toBeNull()
  })

  it('a night that began yesterday and is still on counts', () => {
    expect(tonightEvent({ ...event(20, 23), startTime: at(20, 0, -1), endTime: at(23) }, NOW)).toMatchObject({ when: 'Live' })
  })
})

describe('the strata', () => {
  const live = venue({ id: 'live', liveNow: '5-9' })
  const packed = venue({ id: 'packed', liveNow: '20+', nextEvent: event(21, 23) })
  const open = venue({ id: 'open', nextEvent: event(21, 23) })
  const quiet = venue({ id: 'quiet' })
  const later = venue({ id: 'later', nextEvent: event(21, 23, 1) })
  const unknown = venue({ id: 'unknown', liveNow: null })

  it('sorts by what is true tonight and keeps the server’s order inside each', () => {
    const s = splitPlaces([quiet, packed, open, live, later, unknown], NOW)
    expect(s.live.map((v) => v.id)).toEqual(['packed', 'live'])
    expect(s.open.map((v) => v.id)).toEqual(['open'])
    // Another day's event is not tonight; a null bucket (the server tells this viewer nothing) is quiet, not live.
    expect(s.quiet.map((v) => v.id)).toEqual(['quiet', 'later', 'unknown'])
  })

  it('rows: live tiles in one row, open rows under their heading, the fold, then quiet rows only when unfolded', () => {
    const s = splitPlaces([packed, open, quiet, later], NOW)
    expect(placeRows(s, false, false).map((r) => r.kind)).toEqual(['live', 'openHeader', 'open', 'fold'])
    expect(placeRows(s, true, false).map((r) => r.kind)).toEqual(['live', 'openHeader', 'open', 'fold', 'quiet', 'quiet'])
    expect(placeRows(s, false, false).find((r) => r.kind === 'fold')).toMatchObject({ count: 2, more: false, open: false })
  })

  it('no live, no open: just the fold; nothing quiet: no fold', () => {
    expect(placeRows(splitPlaces([quiet], NOW), false, false).map((r) => r.kind)).toEqual(['fold'])
    expect(placeRows(splitPlaces([live], NOW), false, false).map((r) => r.kind)).toEqual(['live'])
    expect(placeRows(splitPlaces([], NOW), false, false)).toEqual([])
  })

  it('every row has its own key, even for a venue in two strata of one list', () => {
    const rows = placeRows(splitPlaces([packed, open, quiet], NOW), true, true)
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length)
  })
})

describe('paging with thousands of venues', () => {
  it('folded, reads on its own only for the first few pages; unfolded, as far as the person scrolls', () => {
    expect(mayReadNext({ page: 1, hasMore: true }, false)).toBe(true)
    expect(mayReadNext({ page: EAGER_PAGES - 1, hasMore: true }, false)).toBe(true)
    expect(mayReadNext({ page: EAGER_PAGES, hasMore: true }, false)).toBe(false)
    expect(mayReadNext({ page: EAGER_PAGES, hasMore: true }, true)).toBe(true)
    expect(mayReadNext({ page: 1, hasMore: false }, true)).toBe(false)
  })
})

describe('a server that orders live first (liveFirst)', () => {
  it('folded, it reads exactly as far as the last live or open venue — no page cap — and stops at the first quiet one', () => {
    const state = { page: EAGER_PAGES + 4, hasMore: true, liveFirst: true }
    expect(mayReadNext(state, false, false)).toBe(true)
    expect(mayReadNext(state, false, true)).toBe(false)
    expect(mayReadNext({ ...state, hasMore: false }, true, true)).toBe(false)
    // Unfolded it reads as far as the person scrolls, quiet or not.
    expect(mayReadNext(state, true, true)).toBe(true)
  })

  it('without it, the first few pages are the cap, as before', () => {
    expect(mayReadNext({ page: EAGER_PAGES, hasMore: true, liveFirst: false }, false, false)).toBe(false)
  })
})

describe('the peek line (Places.html 04)', () => {
  const v = (id: string, over: Partial<VenueListItem> = {}) => venue({ id, ...over })
  it('“N places live · M open tonight”, with a + while pages remain, and nothing before anything is known', () => {
    const s = splitPlaces([v('a', { liveNow: '5-9' }), v('b', { liveNow: '20+' }), v('c', { nextEvent: event(21, 23) }), v('d')], NOW)
    expect(peekLine(s, false)).toBe('2 places live · 1 open tonight')
    expect(peekLine(s, true)).toBe('2+ places live · 1+ open tonight')
    expect(peekLine(splitPlaces([v('a', { liveNow: '5-9' })], NOW), false)).toBe('1 place live · 0 open tonight')
    expect(peekLine(splitPlaces([], NOW), false)).toBeNull()
  })
})

describe('what a tile is read as', () => {
  it('name, type, distance, live bucket and tonight’s event — the people line, never who', () => {
    const label = placeLabel(venue({ liveNow: '10-19', nextEvent: event(21, 23) }), NOW)
    expect(label).toBe('Toit. Brewery. 350 m. 10–19 live. 9 PM, Vinyl Night')
    expect(placeLabel(venue({ liveNow: null, distance: null }), NOW)).toBe('Toit. Brewery')
    // A quiet row passes no clock, so its label (and its memo) does not move with it.
    expect(placeLabel(venue({ liveNow: 'quiet', nextEvent: event(21, 23) }))).toBe('Toit. Brewery. 350 m. Under 5 live')
  })
})

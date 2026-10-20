import type { VenueListItem } from '../lib/apiClient'
import {
  activeFilterCount,
  distanceText,
  EAGER_PAGES,
  emptyReason,
  fitBounds,
  glowFor,
  hoursLine,
  KIND_TILES,
  mayReadNext,
  moreLine,
  nearLabel,
  placeArea,
  PLACES_STICKY,
  SHOW_AREA_SECTION,
  nearPins,
  NO_FILTERS,
  openLabel,
  peekLine,
  placeLabel,
  placeRows,
  PLACE_TYPES,
  placesCount,
  plateFor,
  RAIL_CAP,
  splitPlaces,
  statLine,
  tierOf,
  tileLabel,
  tonightEvent,
  type PlaceFilters,
  type PlaceView,
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
    expect(PLACE_TYPES.map((t) => t.label)).toEqual(['All', 'Bars', 'Breweries', 'Clubs', 'Live music', 'Rooftops', 'Cafés'])
    expect(PLACE_TYPES.map((t) => t.venueType)).toEqual([null, 'pub_bar', 'brewery', 'nightclub', 'live_music_venue', 'lounge_rooftop', 'cafe'])
    // The kind plates are the same set without "All", in the design's order.
    expect(KIND_TILES.map((t) => t.label)).toEqual(['Bars', 'Breweries', 'Clubs', 'Live music', 'Rooftops', 'Cafés'])
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
    expect(moreLine(1, false)).toBe('1 more place')
    expect(moreLine(12, false)).toBe('12 more places')
    // Pages remain: the number is what has been read, not a total.
    expect(moreLine(12, true)).toBe('12+ more places')
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

})

/** A view with a fix and nothing set, over the given venues; each test changes what it is about. */
const viewOf = (venues: VenueListItem[], over: Partial<PlaceView> = {}): PlaceView => ({
  status: 'ready',
  strata: splitPlaces(venues, NOW),
  more: false,
  quietOpen: false,
  near: [],
  hasFix: true,
  filters: NO_FILTERS,
  searching: false,
  ...over,
})
const kinds = (view: PlaceView) => placeRows(view).map((r) => r.kind)

describe('the rows (BUILD-SPEC B)', () => {
  const live = venue({ id: 'live', liveNow: '5-9' })
  const packed = venue({ id: 'packed', liveNow: '20+', nextEvent: event(21, 23) })
  const open = venue({ id: 'open', nextEvent: event(21, 23) })
  const quiet = venue({ id: 'quiet' })
  const later = venue({ id: 'later', nextEvent: event(21, 23, 1) })
  const nearby = [venue({ id: 'n1' }), venue({ id: 'n2' })]

  it('header, Live now, Open tonight, Near you, the kinds, then the fold; each stratum is one rail row', () => {
    expect(kinds(viewOf([packed, open, quiet, later], { near: nearby }))).toEqual(['title', 'search', 'live', 'open', 'near', 'kinds', 'fold'])
  })

  it('quiet rows only when the fold is open', () => {
    expect(kinds(viewOf([quiet, later], { quietOpen: true }))).toEqual(['title', 'search', 'kinds', 'fold', 'quiet', 'quiet'])
    expect(placeRows(viewOf([packed, open, quiet, later])).find((r) => r.kind === 'fold')).toMatchObject({ count: 2, more: false, open: false, nearest: true })
  })

  it('Live now and Open tonight are absent at 0: no quiet filler, no apology', () => {
    expect(kinds(viewOf([quiet]))).toEqual(['title', 'search', 'kinds', 'fold'])
    expect(kinds(viewOf([open, quiet]))).toEqual(['title', 'search', 'open', 'kinds', 'fold'])
    expect(kinds(viewOf([live, quiet]))).toEqual(['title', 'search', 'live', 'kinds', 'fold'])
  })

  it('Near you: the location card without a fix, absent with a fix and no places, rows with both', () => {
    const noFix = placeRows(viewOf([quiet], { hasFix: false })).find((r) => r.kind === 'near')
    expect(noFix).toMatchObject({ kind: 'near', hasFix: false, venues: [] })
    expect(kinds(viewOf([quiet], { near: [] }))).not.toContain('near')
    const rows = placeRows(viewOf([quiet], { near: [...nearby, ...nearby, ...nearby] }))
    // Never more than five.
    expect((rows.find((r) => r.kind === 'near') as { venues: unknown[] }).venues).toHaveLength(5)
  })

  it('a fold with no fix says A–Z (nearest: false)', () => {
    expect(placeRows(viewOf([quiet], { hasFix: false })).find((r) => r.kind === 'fold')).toMatchObject({ nearest: false })
  })

  it('a rail holds twelve; focusing the stratum ("See all") lifts the cap and hides the other sections', () => {
    const many = Array.from({ length: 20 }, (_, i) => venue({ id: `l${i}`, liveNow: '5-9' }))
    const capped = placeRows(viewOf(many)).find((r) => r.kind === 'live') as { venues: unknown[]; total: number; focused: boolean }
    expect(capped.venues).toHaveLength(RAIL_CAP)
    expect(capped.total).toBe(20)
    const focusedView = viewOf([...many, open, quiet], { filters: { ...NO_FILTERS, whatsOn: 'live' } })
    const focused = placeRows(focusedView).find((r) => r.kind === 'live') as { venues: unknown[]; focused: boolean }
    expect(focused.venues).toHaveLength(20)
    expect(focused.focused).toBe(true)
    expect(kinds(focusedView)).toEqual(['title', 'search', 'live'])
  })

  it('a kind chosen hides the kinds grid and Near you (a chip carries it); the strata stay', () => {
    expect(kinds(viewOf([packed, quiet], { near: nearby, filters: { ...NO_FILTERS, venueType: 'brewery' } }))).toEqual(['title', 'search', 'live', 'fold'])
  })

  it('a search is a flat list under one label, whatever the strata', () => {
    expect(kinds(viewOf([packed, open, quiet], { searching: true }))).toEqual(['title', 'search', 'label', 'quiet', 'quiet', 'quiet'])
  })

  it('loading, failing and empty are rows under the real header', () => {
    expect(kinds(viewOf([], { status: 'loading' }))).toEqual(['title', 'search', 'skeleton'])
    expect(kinds(viewOf([], { status: 'idle' }))).toEqual(['title', 'search', 'skeleton'])
    expect(kinds(viewOf([], { status: 'error' }))).toEqual(['title', 'search', 'error'])
    expect(kinds(viewOf([], { status: 'ready' }))).toEqual(['title', 'search', 'empty'])
  })

  it('a focused stratum with nothing in it is the empty row, not the header alone', () => {
    const view = viewOf([open, quiet], { filters: { ...NO_FILTERS, whatsOn: 'live' } })
    expect(placeRows(view).map((r) => r.kind)).toEqual(['title', 'search', 'empty'])
    expect(emptyReason(view)).toBe('filters')
  })

  it('why it is empty decides the words', () => {
    expect(emptyReason({ searching: true, filters: NO_FILTERS })).toBe('search')
    expect(emptyReason({ searching: false, filters: { ...NO_FILTERS, radiusKm: 2 } })).toBe('filters')
    expect(emptyReason({ searching: false, filters: { ...NO_FILTERS, venueType: 'cafe' } })).toBe('kind')
    expect(emptyReason({ searching: false, filters: NO_FILTERS })).toBe('city')
  })

  it('every row has its own key, even for a venue in two strata of one list', () => {
    const rows = placeRows(viewOf([packed, open, quiet], { quietOpen: true, more: true, near: nearby }))
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length)
  })
})

describe('the area (BUILD-SPEC B5, C4)', () => {
  it('a row names the server’s area, else the address, else the city', () => {
    expect(placeArea({ area: ' Indiranagar ', address: '298, 100 Feet Road', city: 'Bengaluru' })).toBe('Indiranagar')
    expect(placeArea({ area: null, address: '298, 100 Feet Road', city: 'Bengaluru' })).toBe('298, 100 Feet Road')
    expect(placeArea({ address: null, city: 'Bengaluru' })).toBe('Bengaluru')
    expect(placeArea({ area: '', address: ' ', city: null })).toBeNull()
    expect(tileLabel(venue({ area: 'Indiranagar' }))).toContain('Brewery, Indiranagar, 350 metres')
  })

  it('the By area section stays hidden behind its constant, even with areas to show', () => {
    expect(SHOW_AREA_SECTION).toBe(false)
    const areas = [{ slug: 'a', name: 'A', count: 4, liveCount: 1 }, { slug: 'b', name: 'B', count: 3, liveCount: 0 }]
    expect(kinds(viewOf([venue({ id: 'q' })], { areas }))).not.toContain('areas')
  })
})

describe('the sticky search', () => {
  it('the title is row 0 and the search row 1, the one the list pins, in every state', () => {
    expect(PLACES_STICKY).toEqual([1])
    for (const status of ['idle', 'loading', 'error', 'ready'] as const) {
      const rows = placeRows(viewOf([], { status }))
      expect(rows.slice(0, 2).map((r) => r.kind)).toEqual(['title', 'search'])
    }
    expect(kinds(viewOf([venue({ id: 'q' })], { searching: true })).slice(0, 2)).toEqual(['title', 'search'])
  })
})

describe('the stat line', () => {
  const strata = splitPlaces([venue({ id: 'a', liveNow: '5-9' }), venue({ id: 'b', nextEvent: event(21, 23) }), venue({ id: 'c', nextEvent: event(20, 23) })], NOW)

  it('"{total} places · {live} live · {open} open tonight", with the total as the server counts it', () => {
    expect(statLine({ total: 6422, strata, more: false, kind: null })).toEqual({
      text: '6,422 places · 1 live · 2 open tonight',
      spoken: '6,422 places, 1 live, 2 open tonight',
    })
  })

  it('"+" on the strata while pages remain; the total is the server’s and never has one', () => {
    expect(statLine({ total: 6422, strata, more: true, kind: null })?.text).toBe('6,422 places · 1+ live · 2+ open tonight')
  })

  it('a part that is 0 is dropped; nothing known is no line', () => {
    expect(statLine({ total: 40, strata: splitPlaces([], NOW), more: false, kind: null })?.text).toBe('40 places')
    expect(statLine({ total: null, strata: splitPlaces([], NOW), more: false, kind: null })).toBeNull()
  })

  it('a kind chosen names it: "96 breweries · 1 live"', () => {
    expect(statLine({ total: 96, strata: splitPlaces([venue({ id: 'a', liveNow: '5-9' })], NOW), more: false, kind: 'brewery' })?.text).toBe('96 breweries · 1 live')
  })
})

describe('the glow and the pins', () => {
  it('the glow steps with the bucket and a quiet or unknown one has none', () => {
    expect(glowFor('5-9')).toEqual({ alpha: 0.35, radius: 40 })
    expect(glowFor('10-19')).toEqual({ alpha: 0.6, radius: 60 })
    expect(glowFor('20+')).toEqual({ alpha: 0.9, radius: 84 })
    expect(glowFor('quiet')).toBeNull()
    expect(glowFor(null)).toBeNull()
  })

  it('pins are numbered as the rows are, only those with a position, at most five', () => {
    const vs = [1, 2, 3, 4, 5, 6].map((n) => venue({ id: `p${n}`, latitude: n === 2 ? null : 12 + n / 100, longitude: 77 }))
    expect(nearPins(vs).map((p) => [p.id, p.n])).toEqual([['p1', 1], ['p3', 3], ['p4', 4], ['p5', 5]])
  })

  it('"Show on map" fits the pins and you', () => {
    const pins = nearPins([venue({ id: 'a', latitude: 12.9, longitude: 77.5 }), venue({ id: 'b', latitude: 13, longitude: 77.7 })])
    expect(fitBounds(pins, { latitude: 12.8, longitude: 77.6 })).toEqual([77.5, 12.8, 77.7, 13])
    expect(fitBounds(pins, null)).toEqual([77.5, 12.9, 77.7, 13])
    expect(fitBounds([], null)).toBeNull()
  })
})

describe('the filters', () => {
  it('count the ones set, for the badge', () => {
    const f = (over: Partial<PlaceFilters>) => ({ ...NO_FILTERS, ...over })
    expect(activeFilterCount(NO_FILTERS)).toBe(0)
    expect(activeFilterCount(f({ venueType: 'cafe', whatsOn: 'live', radiusKm: 5 }))).toBe(3)
    expect(activeFilterCount(f({ whatsOn: 'open' }))).toBe(1)
  })
})

describe('what a card is read as', () => {
  it('a tile: name, type, area, distance spoken, and the bucket in words', () => {
    expect(tileLabel(venue({ liveNow: '10-19', distance: 0.35 }))).toBe('Toit. Brewery, 298, 100 Feet Road, 350 metres. 10 to 19 people live')
    expect(tileLabel(venue({ liveNow: '20+', distance: 4.8 }))).toContain('4.8 kilometres. 20 or more people live')
  })

  it('an open card: tonight’s event, or hours when the item carries them, or just where it is', () => {
    expect(openLabel(venue({ nextEvent: event(21, 23) }), NOW)).toBe('Toit. Brewery, 298, 100 Feet Road, 350 metres. Tonight 9 PM, Vinyl Night.')
    expect(openLabel(venue({ tonight: { opensAt: '12:00', closesAt: '23:30' } }), NOW)).toContain('Open till 11:30 PM.')
    expect(openLabel(venue(), NOW)).toBe('Toit. Brewery, 298, 100 Feet Road, 350 metres')
  })

  it('a near row: its place in the five', () => {
    expect(nearLabel(venue({ distance: 0.35 }), 2)).toBe('2 of 5 nearest. Toit, Brewery, 298, 100 Feet Road, 350 metres')
  })

  it('the hours line: wall-clock strings, Opens before opening, Open till while open, nothing once it is over', () => {
    // NOW is 18:00.
    expect(hoursLine({ opensAt: '19:00', closesAt: '23:00' }, NOW)).toEqual({ lead: 'Opens', time: '7 PM' })
    expect(hoursLine({ opensAt: '12:00', closesAt: '23:00' }, NOW)).toEqual({ lead: 'Open till', time: '11 PM' })
    expect(hoursLine({ opensAt: '12:00', closesAt: '17:00' }, NOW)).toBeNull()
    expect(hoursLine({ opensAt: '17:30', closesAt: '22:30' }, NOW)).toEqual({ lead: 'Open till', time: '10:30 PM' })
    expect(hoursLine(undefined, NOW)).toBeNull()
    expect(hoursLine(null, NOW)).toBeNull()
  })

  it('a close at or before the open is past midnight: open from the evening, and still open in the small hours', () => {
    expect(hoursLine({ opensAt: '17:00', closesAt: '01:30' }, NOW)).toEqual({ lead: 'Open till', time: '1:30 AM' })
    expect(hoursLine({ opensAt: '19:00', closesAt: '01:30' }, NOW)).toEqual({ lead: 'Opens', time: '7 PM' })
    // 00:30 on the clock: last night's opening is still running.
    const small = new Date(2026, 9, 18, 0, 30).getTime()
    expect(hoursLine({ opensAt: '17:00', closesAt: '01:30' }, small)).toEqual({ lead: 'Open till', time: '1:30 AM' })
    // 03:00: it closed at 01:30 and opens at 17:00 again.
    const late = new Date(2026, 9, 18, 3, 0).getTime()
    expect(hoursLine({ opensAt: '17:00', closesAt: '01:30' }, late)).toEqual({ lead: 'Opens', time: '5 PM' })
    // 24 hours (open 00:00, close 00:00) reads as always open.
    expect(hoursLine({ opensAt: '00:00', closesAt: '00:00' }, NOW)).toEqual({ lead: 'Open till', time: '12 AM' })
  })

  it('times it cannot read are no line: a guess is worse than a blank', () => {
    expect(hoursLine({ opensAt: '6 PM', closesAt: '1 AM' }, NOW)).toBeNull()
    expect(hoursLine({ opensAt: '25:00', closesAt: '23:00' }, NOW)).toBeNull()
    expect(hoursLine({ opensAt: '', closesAt: '23:00' }, NOW)).toBeNull()
  })
})

describe('the server’s tier (open by hours alone)', () => {
  const v = (id: string, over: Partial<VenueListItem> = {}) => venue({ id, ...over })

  it('tier wins where it is sent: a venue open by its hours, with no event, is Open tonight, not quiet', () => {
    expect(tierOf(v('a', { tier: 'open' }), NOW)).toBe('open')
    expect(tierOf(v('b', { tier: 'live', liveNow: 'quiet' }), NOW)).toBe('live')
    // The server says quiet even where the client would have found an event: its word is the stratum.
    expect(tierOf(v('c', { tier: 'quiet', nextEvent: event(21, 23) }), NOW)).toBe('quiet')
  })

  it('absent, or not one of the three, it falls back to the live bucket and tonight’s event', () => {
    expect(tierOf(v('a', { liveNow: '5-9' }), NOW)).toBe('live')
    expect(tierOf(v('b', { nextEvent: event(21, 23) }), NOW)).toBe('open')
    expect(tierOf(v('c'), NOW)).toBe('quiet')
    expect(tierOf(v('d', { tier: 'weird' as never, liveNow: '20+' }), NOW)).toBe('live')
  })

  it('splits the strata by tier, and a mixed list (some with tier, some without) still sorts', () => {
    const s = splitPlaces([v('hours', { tier: 'open' }), v('q', { tier: 'quiet' }), v('live', { tier: 'live' }), v('old', { liveNow: '10-19' })], NOW)
    expect(s.live.map((x) => x.id)).toEqual(['live', 'old'])
    expect(s.open.map((x) => x.id)).toEqual(['hours'])
    expect(s.quiet.map((x) => x.id)).toEqual(['q'])
  })

  it('paging goes on through venues open by hours alone, and stops at the first quiet tier', () => {
    const state = { page: 5, hasMore: true, orderedLive: true }
    const onlyHours = splitPlaces([v('a', { tier: 'live' }), v('b', { tier: 'open' }), v('c', { tier: 'open' })], NOW)
    expect(mayReadNext(state, false, onlyHours.quiet.length > 0)).toBe(true)
    const reached = splitPlaces([v('a', { tier: 'open' }), v('b', { tier: 'quiet' })], NOW)
    expect(mayReadNext(state, false, reached.quiet.length > 0)).toBe(false)
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

describe('a server that asks for and is given ?order=live', () => {
  it('folded, it reads exactly as far as the last live or open venue — no page cap — and stops at the first quiet one', () => {
    const state = { page: EAGER_PAGES + 4, hasMore: true, orderedLive: true }
    expect(mayReadNext(state, false, false)).toBe(true)
    expect(mayReadNext(state, false, true)).toBe(false)
    expect(mayReadNext({ ...state, hasMore: false }, true, true)).toBe(false)
    // Unfolded it reads as far as the person scrolls, quiet or not.
    expect(mayReadNext(state, true, true)).toBe(true)
  })

  it('without it, the first few pages are the cap, as before', () => {
    expect(mayReadNext({ page: EAGER_PAGES, hasMore: true, orderedLive: false }, false, false)).toBe(false)
  })
})

describe('the peek line (Places.html 04)', () => {
  const v = (id: string, over: Partial<VenueListItem> = {}) => venue({ id, ...over })
  it('“N places live · M open tonight”, with a + while pages remain, and nothing before anything is known', () => {
    const s = splitPlaces([v('a', { liveNow: '5-9' }), v('b', { liveNow: '20+' }), v('c', { nextEvent: event(21, 23) }), v('d')], NOW)
    expect(peekLine(s, false)).toBe('2 places live · 1 open tonight')
    expect(peekLine(s, true)).toBe('2+ places live · 1+ open tonight')
    // A part whose count is 0 is dropped; both 0 is no line.
    expect(peekLine(splitPlaces([v('a', { liveNow: '5-9' })], NOW), false)).toBe('1 place live')
    expect(peekLine(splitPlaces([v('c', { nextEvent: event(21, 23) })], NOW), false)).toBe('1 open tonight')
    expect(peekLine(splitPlaces([v('q')], NOW), false)).toBeNull()
    expect(peekLine(splitPlaces([], NOW), false)).toBeNull()
  })
})

describe('what a tile is read as', () => {
  it('name, type, distance, live bucket and tonight’s event — the people line, never who', () => {
    const label = placeLabel(venue({ liveNow: '10-19', nextEvent: event(21, 23) }), NOW)
    expect(label).toBe('Toit. Brewery. 350 m. 10–19 live. 9 PM, Vinyl Night')
    expect(placeLabel(venue({ liveNow: null, distance: null }), NOW)).toBe('Toit. Brewery')
    // A quiet row passes no clock, so its label (and its memo) does not move with it.
    expect(placeLabel(venue({ liveNow: 'quiet', nextEvent: event(21, 23) }))).toBe('Toit. Brewery. 350 m')
  })
})

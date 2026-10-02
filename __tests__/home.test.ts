import { readFileSync } from 'fs'
import { join } from 'path'

// The mapper, not the network: as in apiEvent.test.ts.
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))

import { eventFromApi } from '../lib/api'
import {
  DRAWER_HEADER_HEIGHT,
  drawerSnapPoints,
  liveNowLabel,
  settleSnap,
  stepSnap,
  tonightLine,
} from '../lib/home'
import { placeLabel } from '../lib/pulse'

/**
 * The home screen of plan v2 step 2: the drawer's resting points, how a place
 * reads in Places, and "at <Venue>" on an event card.
 */

const PHONE = { height: 844, topChrome: 47 + 64, tabBarTop: 760 }

describe('the drawer', () => {
  const points = drawerSnapPoints(PHONE)

  it('rests under the top bar, mid-screen, and with only its header above the tab bar', () => {
    expect(points).toEqual({ full: 111, half: 422, peek: 760 - DRAWER_HEADER_HEIGHT })
    expect(points.full).toBeLessThan(points.half)
    expect(points.half).toBeLessThan(points.peek)
  })

  it('keeps its order on a screen too short for a middle', () => {
    const short = drawerSnapPoints({ height: 400, topChrome: 111, tabBarTop: 300 })
    expect(short.full).toBeLessThanOrEqual(short.half)
    expect(short.half).toBeLessThanOrEqual(short.peek)
  })

  it('settles a slow release on the nearest snap', () => {
    expect(settleSnap(points.peek - 40, 0, points)).toBe('peek')
    expect(settleSnap(points.half + 30, 0, points)).toBe('half')
    expect(settleSnap(points.full + 20, 0, points)).toBe('full')
  })

  it('carries a flick on to the next snap', () => {
    // From half, a firm flick up lands at full, and down lands at peek.
    expect(settleSnap(points.half, -2500, points)).toBe('full')
    expect(settleSnap(points.half, 2500, points)).toBe('peek')
  })

  it('steps one snap at a time for a tap or a screen reader, and stops at the ends', () => {
    expect(stepSnap('peek', 'up')).toBe('half')
    expect(stepSnap('half', 'up')).toBe('full')
    expect(stepSnap('full', 'up')).toBe('full')
    expect(stepSnap('full', 'down')).toBe('half')
    expect(stepSnap('peek', 'down')).toBe('peek')
  })
})

describe('a place in the list', () => {
  it('says how many are live as a bucket, never a number under five (D-19)', () => {
    expect(liveNowLabel('quiet')).toBe('Under 5 live')
    expect(liveNowLabel('5-9')).toBe('5–9 live')
    expect(liveNowLabel('10-19')).toBe('10–19 live')
    expect(liveNowLabel('20+')).toBe('20+ live')
    // An older server with no field reads as quiet, not as nothing or zero.
    expect(liveNowLabel(undefined)).toBe('Under 5 live')
  })

  it("names tonight's event, and nothing when the next one is another day", () => {
    const now = new Date(2026, 9, 2, 18, 0)
    const at = (h: number, dayOffset = 0) => new Date(2026, 9, 2 + dayOffset, h, 0).toISOString()
    expect(tonightLine({ title: 'Jazz Night', startTime: at(21), endTime: at(23) }, now)).toMatch(/^Tonight · .* · Jazz Night$/)
    expect(tonightLine({ title: 'Jazz Night', startTime: at(17), endTime: at(23) }, now)).toBe('Happening now · Jazz Night')
    expect(tonightLine({ title: 'Brunch', startTime: at(11, 1), endTime: at(14, 1) }, now)).toBeNull()
    expect(tonightLine(null, now)).toBeNull()
  })
})

describe('"at <Venue>" on an event card (HM-U08)', () => {
  it('names the linked venue the server vouches for', () => {
    expect(placeLabel({ venue: { name: 'The Humming Tree' }, venue_name: 'humming tree indiranagar', city: 'Bengaluru' })).toBe(
      'at The Humming Tree'
    )
  })

  it("falls back to the organiser's words, then the city, when the server names no venue (disputed, archived, none)", () => {
    expect(placeLabel({ venue: null, venue_name: 'Some rooftop', city: 'Bengaluru' })).toBe('Some rooftop')
    expect(placeLabel({ venue: null, venue_name: '', city: 'Bengaluru' })).toBe('Bengaluru')
    expect(placeLabel({ venue_name: '  ', city: null })).toBeNull()
  })

  it('reaches the card: eventFromApi keeps the venue the server sent', () => {
    const base = { id: 'e', title: 't', startTime: '2026-10-02T15:00:00Z', endTime: '2026-10-02T18:00:00Z', venueName: 'free text' }
    expect(eventFromApi({ ...base, venue: { id: 'v', name: 'The Humming Tree' } } as never).venue).toEqual({
      id: 'v',
      name: 'The Humming Tree',
    })
    expect(eventFromApi(base as never).venue).toBeNull()
  })
})

/*
 * Read as source: each is a valid component that renders and does the wrong
 * thing, which no render test here would see.
 */
const read = (rel: string) =>
  readFileSync(join(__dirname, '..', rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('the home map never draws the check-in boundary (HM-CU01, plan v2 §4)', () => {
  it.each(['components/home/HomeMap.tsx', 'components/home/HomeShell.tsx', 'components/home/PlacesList.tsx'])(
    '%s imports no shape that would outline an area',
    (rel) => {
      expect(read(rel)).not.toMatch(/\b(Polygon|Circle|Polyline|Geojson|Overlay)\b/)
    }
  )
})

describe('Places takes the server at its word (HM-CU04)', () => {
  it('filters nothing by time on the phone: the hiding rule is the server\'s alone', () => {
    // One rule, `lib/venue-visibility.ts`. A second copy here is how the list and the map come to disagree.
    const src = read('components/home/PlacesList.tsx')
    expect(src).not.toMatch(/Date\.now\(|new Date\(|startTime|endTime/)
  })
})

describe('the Pulse moved into the drawer without growing (HM-CU03)', () => {
  it('app/(tabs)/events.tsx is no longer than it was', () => {
    const lines = readFileSync(join(__dirname, '..', 'app', '(tabs)', 'events.tsx'), 'utf8').split('\n').length
    expect(lines).toBeLessThanOrEqual(3276)
  })
})

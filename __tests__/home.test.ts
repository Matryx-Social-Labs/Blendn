import { readFileSync } from 'fs'
import { join } from 'path'

// The mapper, not the network: as in apiEvent.test.ts.
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))

import { eventFromApi } from '../lib/api'
import {
  DRAWER_HANDLE_HEIGHT,
  DRAWER_HEADER_HEIGHT,
  DRAWER_PEEK_LINE,
  DRAWER_SEGMENTED_HEIGHT,
  drawerContentHeight,
  drawerSnapPoints,
  liveNowLabel,
  liveNowWord,
  settleSnap,
  snapOnKeyboard,
  stepSnap,
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

describe('the drawer, wired to the screen (step 2 review)', () => {
  const points = drawerSnapPoints(PHONE)

  it('gives the handle and each segment a 44pt target', () => {
    expect(DRAWER_HANDLE_HEIGHT).toBeGreaterThanOrEqual(44)
    // The title tabs' 48: each word is a 48 pt target.
    expect(DRAWER_SEGMENTED_HEIGHT).toBe(48)
    expect(DRAWER_HEADER_HEIGHT).toBeGreaterThanOrEqual(DRAWER_HANDLE_HEIGHT + DRAWER_SEGMENTED_HEIGHT)
  })

  it("sizes the pane to what shows, so a list's last row is reachable at half", () => {
    expect(drawerContentHeight(points, 'half', PHONE.height)).toBe(PHONE.height - points.half - DRAWER_HEADER_HEIGHT)
    expect(drawerContentHeight(points, 'full', PHONE.height)).toBeGreaterThan(drawerContentHeight(points, 'half', PHONE.height))
    expect(drawerContentHeight(points, 'peek', PHONE.height)).toBeGreaterThanOrEqual(0)
  })

  it('opens fully for the keyboard and goes back where it was when the keyboard closes', () => {
    const shown = snapOnKeyboard({ snap: 'half', restore: null }, 'show')
    expect(shown).toEqual({ snap: 'full', restore: 'half' })
    expect(snapOnKeyboard(shown, 'hide')).toEqual({ snap: 'half', restore: null })
    // Already full: nothing to put back.
    expect(snapOnKeyboard({ snap: 'full', restore: null }, 'show')).toEqual({ snap: 'full', restore: null })
    expect(snapOnKeyboard({ snap: 'full', restore: null }, 'hide')).toEqual({ snap: 'full', restore: null })
  })
})

describe('a place in the list', () => {
  it('says how many are live as a bucket, never a number (D-19)', () => {
    expect(liveNowLabel('5-9')).toBe('5–9 live')
    expect(liveNowLabel('10-19')).toBe('10–19 live')
    expect(liveNowLabel('20+')).toBe('20+ live')
  })

  it('under five shows no live label at all, and an older server with no field shows none either', () => {
    expect(liveNowLabel('quiet')).toBeNull()
    expect(liveNowLabel(undefined)).toBeNull()
    expect(liveNowLabel(null)).toBeNull()
    expect(liveNowWord('quiet')).toBeNull()
    expect(liveNowWord('5-9')).toBe('5–9')
  })
})

describe('the peek line makes room only when a pane has one', () => {
  const screen = { height: 800, topChrome: 100, tabBarTop: 700 }
  it('peek rises by the line; full and half do not move', () => {
    const plain = drawerSnapPoints(screen)
    const withLine = drawerSnapPoints({ ...screen, peekExtra: DRAWER_PEEK_LINE })
    expect(withLine.peek).toBe(plain.peek - DRAWER_PEEK_LINE)
    expect(withLine.full).toBe(plain.full)
    expect(withLine.half).toBe(plain.half)
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

describe('the Events | Places switch is the drawer’s title tabs, tap only', () => {
  const shell = read('components/home/HomeShell.tsx')

  it('uses TitleTabs, which has no drag (it would compete with the drawer and map gestures), with the city chip trailing', () => {
    expect(shell).toMatch(/<TitleTabs[\s\S]*?testID="home-segmented"/)
    expect(shell).toContain('testID="home-city"')
    expect(shell).toContain('onPress={browse.openCityPicker}')
    expect(shell).not.toMatch(/SegmentedControl|draggable/)
  })

  it('keeps no segment of its own, and plays no haptic of its own (the control plays H.select)', () => {
    expect(shell).not.toMatch(/styles\.segment|segmentOn|EMBER_RADIUS|H\.select/)
  })
})

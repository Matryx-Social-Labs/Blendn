import { readFileSync } from 'fs'
import { join } from 'path'

import {
  backoffMs,
  buildingUnder,
  insideLastCircle,
  lightCandidates,
  lightSignature,
  liveAt,
  loadPins,
  MAX_QUERY_RADIUS_KM,
  pinsFor,
  roundQuery,
  shadeOf,
  shouldFollowCity,
  shouldFollowFix,
  viewportQuery,
} from '../lib/homeMap'
import { glowRadius } from '../lib/mapLit'
import { CITY_BUILDINGS, EMBER_MAP_STYLE, homeMapStyle, styleHost } from '../lib/mapStyleEmber'
import { MAP_THEME } from '../lib/mapTheme'

/**
 * The 3D home map (plan v2 §4, step 2 PR B): what a viewport asks for, which
 * pins show, which building a pin lights — and that the map never draws where
 * somebody may check in.
 */

describe('a viewport becomes the lists\' own query (HM-CU02)', () => {
  it('asks for its centre and a radius reaching its corners', () => {
    // About 2.2 km corner to corner around central Bengaluru.
    const q = viewportQuery([77.59, 12.96, 77.6, 12.975])
    expect(q.lat).toBeCloseTo(12.9675, 4)
    expect(q.lon).toBeCloseTo(77.595, 4)
    expect(q.radius).toBeGreaterThan(0.9)
    expect(q.radius).toBeLessThan(1.1)
  })

  it("never asks past the server's bound, and never for nothing", () => {
    expect(viewportQuery([70, 5, 90, 25]).radius).toBe(MAX_QUERY_RADIUS_KM)
    expect(viewportQuery([77.5946, 12.9716, 77.5946, 12.9716]).radius).toBe(0.1)
  })
})

const at = (minutesFromNow: number) => new Date(Date.now() + minutesFromNow * 60_000).toISOString()
const event = (id: string, startIn: number, endIn: number, coords = { latitude: 12.97, longitude: 77.59 }) => ({
  id,
  title: id,
  ...coords,
  start_time: at(startIn),
  end_time: at(endIn),
})

describe('the pins follow the segment (HM-CU04)', () => {
  const data = {
    events: [event('running', -30, 90), event('tonight', 120, 240), event('nowhere', 10, 60, { latitude: 0, longitude: 0 })],
    venues: [
      { id: 'quiet', name: 'Quiet', latitude: 12.97, longitude: 77.59, liveNow: 'quiet' as const },
      { id: 'busy', name: 'Busy', latitude: 12.98, longitude: 77.6, liveNow: '20+' as const },
      { id: 'unplaced', name: 'Unplaced', latitude: null, longitude: null, liveNow: '5-9' as const },
    ],
  }

  it('Events shows event pins only, brighter while one is on', () => {
    const pins = pinsFor('events', data)
    expect(pins.map((p) => [p.id, p.kind, p.live])).toEqual([
      ['running', 'event', true],
      ['tonight', 'event', false],
    ])
  })

  it('Places shows venue pins only, glowing by bucket and never by a count', () => {
    const pins = pinsFor('places', data)
    expect(pins.map((p) => [p.id, p.kind, p.live, p.glow])).toEqual([
      ['quiet', 'venue', false, 1],
      ['busy', 'venue', true, 4],
    ])
  })

  it('reads a venue with no bucket (an older server) as quiet, never live', () => {
    const [pin] = pinsFor('places', { events: [], venues: [{ id: 'old', name: 'Old', latitude: 12.97, longitude: 77.59 }] })
    expect(pin).toMatchObject({ live: false, glow: 1 })
  })

  it('leaves nothing out by time: every placed item the server sent is a pin', () => {
    // Which venues are listed is the server's rule (lib/venue-visibility.ts); a second copy here is how the map and the list disagree.
    const later = { events: [event('next-week', 7 * 24 * 60, 7 * 24 * 60 + 120)], venues: [] }
    expect(pinsFor('events', later)).toHaveLength(1)
  })

  it('shades events ember and venues violet-rose, brighter when live', () => {
    expect(shadeOf('event', true)).not.toBe(shadeOf('event', false))
    expect(shadeOf('venue', true)).not.toBe(shadeOf('event', true))
  })
})

describe('the building a pin lights', () => {
  const square = (x: number, y: number, d: number) => [
    [x, y],
    [x + d, y],
    [x + d, y + d],
    [x, y + d],
    [x, y],
  ]
  const building = (id: string, rings: number[][][]) => ({ id, geometry: { type: 'Polygon', coordinates: rings } })
  const pin = { latitude: 12.9705, longitude: 77.5905 }

  it('is the one whose footprint holds the pin, not the first the tilt put under it', () => {
    const inFront = building('in-front', [square(77.6, 12.97, 0.001)])
    const under = building('under', [square(77.59, 12.97, 0.001)])
    expect(buildingUnder(pin, [inFront, under])?.id).toBe('under')
    expect(buildingUnder(pin, [inFront, under])?.geometry.coordinates).toEqual([square(77.59, 12.97, 0.001)])
  })

  it("is the stadium around a pin on its pitch (the ring's hole): the place is the ring", () => {
    const stadium = building('stadium', [square(77.589, 12.969, 0.003), square(77.5902, 12.9702, 0.0006)])
    expect(buildingUnder(pin, [stadium])?.id).toBe('stadium')
  })

  it('is a building standing in the courtyard of another, not the ring around it (holes count first)', () => {
    const ring = building('ring', [square(77.589, 12.969, 0.003), square(77.5902, 12.9702, 0.0006)])
    const inCourtyard = building('in-courtyard', [square(77.5903, 12.9703, 0.0004)])
    expect(buildingUnder(pin, [ring, inCourtyard])?.id).toBe('in-courtyard')
  })

  it('is the tallest of the parts that hold the pin (a tower over its podium)', () => {
    const podium = { ...building('podium', [square(77.59, 12.97, 0.001)]), properties: { render_height: 10 } }
    const tower = { ...building('tower', [square(77.5902, 12.9702, 0.0005)]), properties: { render_height: 60 } }
    expect(buildingUnder(pin, [podium, tower])?.id).toBe('tower')
    expect(buildingUnder(pin, [tower, podium])?.id).toBe('tower')
  })

  it('is none on open ground, so only the glow shows', () => {
    const away = building('away', [square(77.6, 12.98, 0.001)])
    expect(buildingUnder(pin, [away])).toBeNull()
    expect(buildingUnder(pin, [])).toBeNull()
  })

  it('lights only the part of a merged multipolygon that holds the pin, never the whole block', () => {
    // The tiles merge neighbouring buildings into one feature; lighting the feature lit a whole neighbourhood.
    const block = {
      id: 'block',
      properties: { render_height: 12 },
      geometry: { type: 'MultiPolygon', coordinates: [[square(77.6, 12.97, 0.001)], [square(77.59, 12.97, 0.001)], [square(77.58, 12.97, 0.001)]] },
    }
    const lit = buildingUnder(pin, [block])
    expect(lit?.id).toBe('block')
    expect(lit?.geometry).toEqual({ type: 'Polygon', coordinates: [square(77.59, 12.97, 0.001)] })
  })
})

/** Read as source: a layer that draws the boundary renders fine and is wrong. */
const code = (rel: string) =>
  readFileSync(join(__dirname, '..', rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('the check-in boundary is never drawn (HM-CU01, plan v2 §4)', () => {
  const component = code('components/home/HomeMap.tsx')
  // The map's own layers live in two files: the component and its lit layers.
  const layers = component + code('components/home/MapLitLayers.tsx')
  // Everything that decides what the map draws: the component, its layers, its lighting, its pure parts, its style and its theme.
  const drawing = [
    'components/home/HomeMap.tsx',
    'components/home/MapLitLayers.tsx',
    'components/home/useMapLighting.ts',
    'lib/homeMap.ts',
    'lib/mapLit.ts',
    'lib/mapStyleEmber.ts',
    'lib/mapTheme.ts',
  ]

  it.each(drawing)('%s reads no area off any payload', (file) => {
    expect(code(file)).not.toMatch(/geofence|checkInRadius|check_in_radius|buffer|fence/i)
  })

  it('adds only extruded buildings and circles: no fill or line that could outline an area', () => {
    const types = [...layers.matchAll(/type="([a-z-]+)"/g)].map((m) => m[1])
    expect(types.length).toBeGreaterThan(0)
    expect(types.filter((t) => t !== 'fill-extrusion' && t !== 'circle')).toEqual([])
  })

  it('moves the camera only with the drawer padding, so the centre stays above the drawer', () => {
    const moves = component.split('\n').filter((line) => /\.(easeTo|flyTo|jumpTo)\(/.test(line))
    expect(moves.length).toBeGreaterThan(0)
    for (const line of moves) expect(line).toMatch(/padding:/)
    // …and the first frame has it too: a padding-only camera change is a no-op on Android (review H3).
    expect(component).toMatch(/initialViewState=\{\{[\s\S]*?padding: \{ bottom: bottomInset \}/)
  })

  it("draws the person's dot as a plain puck, never one that follows the compass (Android redrew the map forever)", () => {
    expect(component).toMatch(/<NativeUserLocation mode="default" \/>/)
  })

  it('is tilted between 45° and 60°', () => {
    expect(MAP_THEME.camera.pitch).toBeGreaterThanOrEqual(45)
    expect(MAP_THEME.camera.pitch).toBeLessThanOrEqual(60)
    expect(component).toMatch(/pitch: MAP_THEME\.camera\.pitch/)
  })

  it("sizes circles only by the theme: the bucket's glow, the fixed dot, the fixed ground glow — never anything a place carries", () => {
    const radii = [...layers.matchAll(/'circle-radius':\s*([^,\n]+(?:,[^\n]*?\])?)\s*,?\s*\n/g)].map((m) => m[1].trim().replace(/,$/, ''))
    expect(radii.length).toBe(3)
    for (const r of radii) {
      expect(["['*', ['get', 'glow'], MAP_THEME.pin.glowPxPerStep]", 'MAP_THEME.pin.dotRadiusPx', 'GLOW_RADIUS']).toContain(r)
    }
    expect(layers).toMatch(/const GLOW_RADIUS = glowRadius\(\)/)
    // The ground glow is the theme's metres at every zoom, read off nothing.
    expect(JSON.stringify(glowRadius())).not.toMatch(/get|feature|properties/)
  })

  it('lights only public shapes: the building layer the basemap drew, or the pin', () => {
    // The only geometry read is the city's own buildings; the only coordinates written are a pin's or a building's.
    const lighting = code('components/home/useMapLighting.ts')
    const queried = [...lighting.matchAll(/layers:\s*\[([^\]]*)\]/g)].map((m) => m[1].trim())
    expect(queried).toEqual(['layer'])
    expect(lighting).toMatch(/const layer = featureIds \? OWN_BUILDINGS_LAYER_ID : BUILDING_LAYER_ID/)
    expect(component).not.toMatch(/queryRenderedFeatures/)
  })

  it("keeps OpenFreeMap's buildings extrudable and its attribution on", () => {
    expect(CITY_BUILDINGS).toMatchObject({ id: 'blendn-buildings', source: 'openmaptiles', sourceLayer: 'building' })
    expect(layers).toMatch(/<CityBuildings \/>/)
    expect(EMBER_MAP_STYLE.sources).toHaveProperty('openmaptiles')
    expect(component).toMatch(/\battribution\b(?!=\{false\})/)
    expect(component).not.toMatch(/attribution=\{false\}/)
  })
})

describe('asking for pins (step 2 review)', () => {
  it('rounds a view to ~100 m, so a nudge is the same question', () => {
    expect(roundQuery({ lat: 12.971634, lon: 77.594612, radius: 1.23456 })).toEqual({ lat: 12.972, lon: 77.595, radius: 1.23 })
  })

  it('asks nothing for a view inside the circle already loaded, and asks for one that leaves it', () => {
    const last = { lat: 12.97, lon: 77.59, radius: 2 }
    expect(insideLastCircle(last, { lat: 12.971, lon: 77.591, radius: 1 })).toBe(true)
    expect(insideLastCircle(last, { lat: 12.99, lon: 77.59, radius: 1 })).toBe(false)
    expect(insideLastCircle(last, { lat: 12.97, lon: 77.59, radius: 3 })).toBe(false)
    expect(insideLastCircle(null, last)).toBe(false)
  })

  it("backs off on refusals, doubling to a minute, and never earlier than the server's Retry-After", () => {
    expect(backoffMs(0)).toBe(0)
    expect(backoffMs(1)).toBe(2_000)
    expect(backoffMs(3)).toBe(8_000)
    expect(backoffMs(10)).toBe(60_000)
    expect(backoffMs(1, 30)).toBe(30_000)
  })

  const ok = <T,>(data: T) => Promise.resolve({ success: true, data })
  const venues = [{ id: 'v', name: 'V', latitude: 12.97, longitude: 77.59, liveNow: '5-9' as const }]
  const events = [event('e', -10, 60)]

  it('asks the segment showing, and only it', async () => {
    const api = { getEvents: jest.fn(() => ok({ events })), getVenues: jest.fn(() => ok({ venues })) }
    const q = { lat: 12.97, lon: 77.59, radius: 1 }
    const places = await loadPins('places', q, api, 50)
    expect(places).toEqual({ kind: 'pins', pins: [expect.objectContaining({ id: 'v', kind: 'venue', glow: 2 })], truncated: false })
    expect(api.getVenues).toHaveBeenCalledWith({ ...q, limit: 50, sortBy: 'distance' })
    expect(api.getEvents).not.toHaveBeenCalled()
    const evts = await loadPins('events', q, api, 50)
    expect(evts).toEqual({ kind: 'pins', pins: [expect.objectContaining({ id: 'e', kind: 'event', live: true })], truncated: false })
  })

  it('says a full page may not be all there is, so it never counts as covering the circle (review M2)', async () => {
    const api = { getEvents: jest.fn(), getVenues: jest.fn(() => ok({ venues: [...venues, { ...venues[0], id: 'w' }] })) }
    const q = { lat: 12.97, lon: 77.59, radius: 1 }
    expect(await loadPins('places', q, api, 2)).toMatchObject({ kind: 'pins', truncated: true })
    expect(await loadPins('places', q, api, 3)).toMatchObject({ kind: 'pins', truncated: false })
  })

  it('reports a refusal as rate-limited (with its wait) and anything else as failed, never throwing', async () => {
    const q = { lat: 12.97, lon: 77.59, radius: 1 }
    const refused = { getEvents: jest.fn(), getVenues: jest.fn(() => Promise.resolve({ success: false, errorCode: 'RATE_LIMITED', retryAfter: 12 })) }
    expect(await loadPins('places', q, refused, 50)).toEqual({ kind: 'rate_limited', retryAfter: 12 })
    const broken = { getEvents: jest.fn(() => Promise.reject(new Error('offline'))), getVenues: jest.fn() }
    expect(await loadPins('events', q, broken, 50)).toEqual({ kind: 'failed' })
  })
})

describe('lighting, once per view (step 2 review)', () => {
  const venue = (id: string, latitude: number, longitude: number) => ({ id, name: id, latitude, longitude, liveNow: 'quiet' as const })
  const view = { centre: [77.59, 12.97] as [number, number], zoom: 16, pitch: 55 }

  it('needs no second pass for the same pins over the same view, and one when the view or a pin\'s liveness moves', () => {
    const pins = pinsFor('places', { events: [], venues: [venue('v', 12.97, 77.59)] })
    expect(lightSignature(pins, view)).toBe(lightSignature(pins, view))
    expect(lightSignature(pins, { ...view, centre: [77.591, 12.97] })).not.toBe(lightSignature(pins, view))
    expect(lightSignature(pins, { ...view, zoom: 17 })).not.toBe(lightSignature(pins, view))
    expect(lightSignature([{ ...pins[0], live: true }], view)).not.toBe(lightSignature(pins, view))
  })

  it('looks at the pins in view only, the nearest to the centre first, at most the cap (review H1)', () => {
    const pins = pinsFor('places', {
      events: [],
      venues: [venue('far', 12.979, 77.599), venue('outside', 13.5, 77.59), venue('centre', 12.97, 77.59), venue('near', 12.971, 77.591)],
    })
    const bounds: [number, number, number, number] = [77.58, 12.96, 77.6, 12.98]
    expect(lightCandidates(pins, bounds, [77.59, 12.97], 2).map((p) => p.id)).toEqual(['centre', 'near'])
    expect(lightCandidates(pins, bounds, [77.59, 12.97], 10).map((p) => p.id)).toEqual(['centre', 'near', 'far'])
  })
})

describe('an event lights up when its doors open, without a new read (review M1)', () => {
  it('reads liveness from the window as the clock moves', () => {
    const t0 = Date.now()
    const [pin] = pinsFor('events', { events: [event('e', 30, 90)], venues: [] }, t0)
    expect(pin.live).toBe(false)
    expect(liveAt(pin, t0 + 31 * 60_000)).toMatchObject({ live: true, glow: 3 })
    expect(liveAt(pin, t0 + 91 * 60_000)).toMatchObject({ live: false, glow: 1 })
    // Unchanged is the same object, so nothing downstream re-renders.
    expect(liveAt(pin, t0)).toBe(pin)
  })

  it("leaves a venue's liveness to its bucket", () => {
    const [busy] = pinsFor('places', { events: [], venues: [{ id: 'b', name: 'B', latitude: 12.97, longitude: 77.59, liveNow: '20+' }] })
    expect(liveAt(busy, Date.now() + 10 * 86_400_000)).toBe(busy)
  })
})

describe('the map style can move without a release (step 2 review)', () => {
  const saved = process.env.EXPO_PUBLIC_MAP_STYLE_URL
  afterEach(() => {
    process.env.EXPO_PUBLIC_MAP_STYLE_URL = saved
  })

  it('uses EXPO_PUBLIC_MAP_STYLE_URL when set, else the Ember style over OpenFreeMap', () => {
    delete process.env.EXPO_PUBLIC_MAP_STYLE_URL
    expect(homeMapStyle()).toBe(EMBER_MAP_STYLE)
    process.env.EXPO_PUBLIC_MAP_STYLE_URL = 'https://maps.blendn.app/styles/ember.json'
    expect(homeMapStyle()).toBe('https://maps.blendn.app/styles/ember.json')
  })

  it('reports only the host of a style that failed, and never throws on a bad URL', () => {
    expect(styleHost('https://maps.blendn.app/styles/ember.json')).toBe('maps.blendn.app')
    expect(styleHost('not a url')).toBe('invalid-url')
    expect(styleHost(EMBER_MAP_STYLE)).toBe('tiles.openfreemap.org')
  })
})

describe('the map and the city (step 2 drive)', () => {
  it("follows a city the person picks, but the city resolved at launch never takes the map from their own position", () => {
    // Launch: the city arrives after the fix — the fix wins.
    expect(shouldFollowCity({ firstCity: true, hasFix: true, touched: false })).toBe(false)
    // Launch with no fix: the city is the best place to look.
    expect(shouldFollowCity({ firstCity: true, hasFix: false, touched: false })).toBe(true)
    // Launch after the person already moved the map: theirs.
    expect(shouldFollowCity({ firstCity: true, hasFix: false, touched: true })).toBe(false)
    // A later pick is the person asking: follow it, fix or not.
    expect(shouldFollowCity({ firstCity: false, hasFix: true, touched: true })).toBe(true)
  })
})

describe('the map and the fix (step 2 drive)', () => {
  it('follows a fix that moved, a cached one then the live one, until the person moves the map', () => {
    const cached = { latitude: 12.9655, longitude: 77.5855 }
    const live = { latitude: 12.9672, longitude: 77.5855 }
    expect(shouldFollowFix(null, cached, false)).toBe(true)
    // The live fix ~190 m from the cached one: follow it.
    expect(shouldFollowFix(cached, live, false)).toBe(true)
    // A jitter of a few metres is not a move.
    expect(shouldFollowFix(live, { latitude: 12.96721, longitude: 77.58551 }, false)).toBe(false)
    // Once the person has moved the map, it is theirs.
    expect(shouldFollowFix(cached, live, true)).toBe(false)
  })
})

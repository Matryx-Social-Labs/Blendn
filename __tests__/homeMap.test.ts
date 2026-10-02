import { readFileSync } from 'fs'
import { join } from 'path'

import { buildingUnder, MAX_QUERY_RADIUS_KM, pinsFor, shadeOf, viewportQuery } from '../lib/homeMap'
import { EMBER_MAP_STYLE } from '../lib/mapStyleEmber'

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
  const map = code('components/home/HomeMap.tsx')

  it('reads no area off any payload', () => {
    expect(map).not.toMatch(/geofence|checkInRadius|check_in_radius|buffer/i)
  })

  it('adds only extruded buildings and pin circles: no fill or line that could outline an area', () => {
    const types = [...map.matchAll(/type="([a-z-]+)"/g)].map((m) => m[1])
    expect(types.length).toBeGreaterThan(0)
    expect(types.filter((t) => t !== 'fill-extrusion' && t !== 'circle')).toEqual([])
  })

  it('is tilted between 45° and 60°', () => {
    const pitch = Number(map.match(/const PITCH = (\d+)/)?.[1])
    expect(pitch).toBeGreaterThanOrEqual(45)
    expect(pitch).toBeLessThanOrEqual(60)
  })

  it("keeps OpenFreeMap's buildings extrudable and its attribution on", () => {
    expect(EMBER_MAP_STYLE.layers.some((l) => l.id === 'building-3d' && l.type === 'fill-extrusion')).toBe(true)
    expect(map).toMatch(/\battribution\b(?!=\{false\})/)
    expect(map).not.toMatch(/attribution=\{false\}/)
  })
})

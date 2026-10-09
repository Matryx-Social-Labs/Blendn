import { readFileSync } from 'fs'
import { join } from 'path'

import { litPlaceFor, pinsFor, type Pin } from '../lib/homeMap'
import {
  bandsFor,
  chipLiftPx,
  chipLine,
  circleRing,
  colourAt,
  dedupeLit,
  glowBreathes,
  glowFor,
  glowOpacity,
  glowRadius,
  litTopM,
  nearest,
  outsetRing,
  topOfM,
  type LitPlace,
  type Ring,
} from '../lib/mapLit'
import { buildingHeights, cityColour, EMBER_MAP_STYLE } from '../lib/mapStyleEmber'
import { MAP_THEME } from '../lib/mapTheme'

/**
 * The lit look of the home map (step 2c; research §4.2): what a lit building,
 * a beacon and a glow are made of, and the theme they are made from.
 */

const M_PER_DEG_LAT = 111_320
const LAT = 12.97
const LNG = 77.64
const kx = M_PER_DEG_LAT * Math.cos((LAT * Math.PI) / 180)
/** A ring from metre offsets around (LNG, LAT), closed. */
const ringM = (pts: [number, number][]): Ring => [...pts, pts[0]].map(([x, y]) => [LNG + x / kx, LAT + y / M_PER_DEG_LAT])
/** A ring back to metre offsets, open. */
const toM = (ring: Ring) => ring.slice(0, -1).map(([x, y]) => [Math.round((x - LNG) * kx * 100) / 100, Math.round((y - LAT) * M_PER_DEG_LAT * 100) / 100])

const square = (d: number) => ringM([
  [0, 0],
  [d, 0],
  [d, d],
  [0, d],
])

const place = (over: Partial<LitPlace>): LitPlace => ({
  id: 'p',
  kind: 'event',
  live: false,
  at: [LNG, LAT],
  footprint: [square(10)],
  height: 5,
  base: 0,
  ...over,
})

describe('a lit building is drawn around the city\'s own, never on it', () => {
  it('moves every edge of a square out by the outset, whichever way the ring winds', () => {
    expect(toM(outsetRing(square(10), 0.5))).toEqual([
      [-0.5, -0.5],
      [10.5, -0.5],
      [10.5, 10.5],
      [-0.5, 10.5],
    ])
    const clockwise = ringM([
      [0, 0],
      [0, 10],
      [10, 10],
      [10, 0],
    ])
    expect(toM(outsetRing(clockwise, 0.5))).toEqual([
      [-0.5, -0.5],
      [-0.5, 10.5],
      [10.5, 10.5],
      [10.5, -0.5],
    ])
  })

  it("moves an L-shape's inner corner out of the building, not into it", () => {
    // Scaling from the centre pulled this corner (4,4) inwards and the city's walls showed through.
    const l = ringM([
      [0, 0],
      [20, 0],
      [20, 4],
      [4, 4],
      [4, 20],
      [0, 20],
    ])
    const inner = toM(outsetRing(l, 0.5))[3]
    expect(inner).toEqual([4.5, 4.5])
  })

  it('shrinks a courtyard when moved by a negative outset', () => {
    expect(toM(outsetRing(square(10), -0.5))[0]).toEqual([0.5, 0.5])
  })

  it('stands at least the stylised minimum, always above the city copy (owner, 2026-10-09)', () => {
    expect(litTopM(5)).toBe(MAP_THEME.lit.minHeightM + MAP_THEME.lit.raiseM)
    expect(litTopM(40)).toBe(40 + MAP_THEME.lit.raiseM)
    expect(MAP_THEME.lit.minHeightM).toBe(15)
    expect(MAP_THEME.lit.raiseM).toBeGreaterThan(0)
    expect(MAP_THEME.lit.outsetM).toBeGreaterThan(0)
  })

  it('is walls then a lighter crown over the top quarter, in the event shades', () => {
    const [walls, crown] = bandsFor(place({ height: 5 }))
    const top = litTopM(5)
    expect(walls.properties).toMatchObject({ color: MAP_THEME.event.walls, base: 0, height: top * 0.75 })
    expect(crown.properties).toMatchObject({ color: MAP_THEME.event.crown, base: top * 0.75, height: top })
    // Drawn on the outline moved out, not the outline itself.
    expect(walls.geometry.coordinates[0]).toEqual(outsetRing(square(10), MAP_THEME.lit.outsetM))
  })

  it('keeps a courtyard open, shrunk so its inner walls also clear the city', () => {
    const court = ringM([
      [3, 3],
      [3, 7],
      [7, 7],
      [7, 3],
    ])
    const [walls] = bandsFor(place({ footprint: [square(10), court] }))
    expect(walls.geometry.coordinates[1]).toEqual(outsetRing(court, -MAP_THEME.lit.outsetM))
  })

  it('draws a venue in rose with a light-purple crown', () => {
    const [walls, crown] = bandsFor(place({ kind: 'venue' }))
    expect([walls.properties.color, crown.properties.color]).toEqual([MAP_THEME.venue.walls, MAP_THEME.venue.crown])
  })
})

describe('which building a pin lights, or a beacon (the beacon choice)', () => {
  const pin: Pin = pinsFor('events', {
    events: [{ id: 'e', title: 'E', latitude: LAT + 5 / M_PER_DEG_LAT, longitude: LNG + 5 / kx, start_time: new Date().toISOString(), end_time: null }],
    venues: [],
  })[0]

  it('lights the building the pin stands in, at its own height', () => {
    const lit = litPlaceFor(pin, [{ geometry: { type: 'Polygon', coordinates: [square(10)] }, properties: { render_height: 22, render_min_height: 3 } }])
    expect(lit).toMatchObject({ id: 'e', footprint: [square(10)], height: 22, base: 3 })
  })

  it('stands a beacon on the pin when no building holds it, or the buildings could not be read', () => {
    const away = { geometry: { type: 'Polygon', coordinates: [ringM([[50, 50], [60, 50], [60, 60], [50, 60]])] }, properties: {} }
    expect(litPlaceFor(pin, [away]).footprint).toBeNull()
    expect(litPlaceFor(pin, []).footprint).toBeNull()
    expect(litPlaceFor(pin, null).footprint).toBeNull()
    expect(litPlaceFor(pin, null).at).toEqual([pin.longitude, pin.latitude])
  })

  it('makes a beacon a banded 16-sided pillar of the theme radius on the pin, 40–60 m tall', () => {
    const at: [number, number] = [LNG, LAT]
    const bands = bandsFor(place({ footprint: null, at }))
    const { radiusM, sides, heightM, bands: n } = MAP_THEME.beacon
    expect(bands).toHaveLength(n)
    expect(bands[0].properties.base).toBe(0)
    expect(bands[n - 1].properties.height).toBe(heightM)
    expect(heightM).toBeGreaterThanOrEqual(40)
    expect(heightM).toBeLessThanOrEqual(60)
    const ring = bands[0].geometry.coordinates[0]
    expect(ring).toHaveLength(sides + 1)
    for (const [x, y] of ring) expect(Math.hypot((x - LNG) * kx, (y - LAT) * M_PER_DEG_LAT)).toBeCloseTo(radiusM, 1)
    expect(ring).toEqual(circleRing(at, radiusM, sides))
  })

  it('bands an event beacon ember → rose → purple and a venue beacon rose → purple, bottom to top', () => {
    const event = bandsFor(place({ footprint: null })).map((b) => b.properties.color)
    const venue = bandsFor(place({ footprint: null, kind: 'venue' })).map((b) => b.properties.color)
    expect(event[0]).toBe(colourAt(MAP_THEME.beacon.event, 0.5 / MAP_THEME.beacon.bands))
    expect(new Set(event).size).toBe(event.length)
    expect(venue[venue.length - 1]).toBe(colourAt(MAP_THEME.beacon.venue, 1 - 0.5 / MAP_THEME.beacon.bands))
    expect(colourAt(['#000000', '#FFFFFF'], 0.5)).toBe('#808080')
    expect(colourAt(MAP_THEME.beacon.event, 0)).toBe(MAP_THEME.beacon.event[0])
    expect(colourAt(MAP_THEME.beacon.event, 1)).toBe(MAP_THEME.beacon.event[2])
  })

  it('reads heights where the tiles keep them, and never NaN', () => {
    expect(buildingHeights({ render_height: 12, render_min_height: 2 })).toEqual({ height: 12, base: 2 })
    expect(buildingHeights(null)).toEqual({ height: 0, base: 0 })
    expect(buildingHeights({ render_height: 'x' })).toEqual({ height: 0, base: 0 })
  })
})

describe('a live event wins at its venue', () => {
  const event = (live: boolean) => place({ id: live ? 'event-live' : 'event-later', kind: 'event', live })
  const venue = (live: boolean) => place({ id: live ? 'venue-live' : 'venue-quiet', kind: 'venue', live })

  it('gives a building two pins share to the live event, whatever the order', () => {
    expect(dedupeLit([venue(true), event(true)]).map((p) => p.id)).toEqual(['event-live'])
    expect(dedupeLit([event(true), venue(true)]).map((p) => p.id)).toEqual(['event-live'])
  })

  it('else to whoever is live now, else the first', () => {
    expect(dedupeLit([event(false), venue(true)]).map((p) => p.id)).toEqual(['venue-live'])
    expect(dedupeLit([event(false), venue(false)]).map((p) => p.id)).toEqual(['event-later'])
  })

  it('keeps one beacon per spot, and different buildings apart', () => {
    const beacons = dedupeLit([place({ id: 'a', footprint: null }), place({ id: 'b', footprint: null, live: true })])
    expect(beacons.map((p) => p.id)).toEqual(['b'])
    const twoBuildings = dedupeLit([place({ id: 'a' }), place({ id: 'b', footprint: [ringM([[30, 0], [40, 0], [40, 10], [30, 10]])] })])
    expect(twoBuildings).toHaveLength(2)
  })
})

describe('the ground glow', () => {
  it('breathes under a live event, stands still at a beacon, and is absent at a quiet building', () => {
    expect(glowFor(place({ live: true }))?.properties).toMatchObject({ pulse: true, color: MAP_THEME.event.glow })
    expect(glowFor(place({ live: true, footprint: null }))?.properties.pulse).toBe(true)
    expect(glowFor(place({ live: false, footprint: null }))?.properties.pulse).toBe(false)
    expect(glowFor(place({ live: false }))).toBeNull()
    // A venue never breathes, live or not.
    expect(glowFor(place({ kind: 'venue', live: true }))).toBeNull()
    expect(glowFor(place({ kind: 'venue', live: true, footprint: null }))?.properties).toMatchObject({ pulse: false, color: MAP_THEME.venue.glow })
  })

  it('sits on the public pin', () => {
    expect(glowFor(place({ live: true, at: [77.1, 12.1] }))?.geometry.coordinates).toEqual([77.1, 12.1])
  })

  it('is the theme radius on the ground at every zoom', () => {
    const [, , , z0, px0, z1, px1] = glowRadius()
    const mpp = (z: number) => (40_075_016.686 * Math.cos((MAP_THEME.glow.referenceLatitude * Math.PI) / 180)) / (512 * 2 ** z)
    expect(px0 * mpp(z0)).toBeCloseTo(MAP_THEME.glow.radiusM, 6)
    expect(px1 * mpp(z1)).toBeCloseTo(MAP_THEME.glow.radiusM, 6)
  })

  it('breathes 0.15 ↔ 0.35 only on screen, with motion allowed and something live', () => {
    expect(glowBreathes({ focused: true, reduceMotion: false, anyLive: true })).toBe(true)
    expect(glowBreathes({ focused: true, reduceMotion: true, anyLive: true })).toBe(false)
    expect(glowBreathes({ focused: false, reduceMotion: false, anyLive: true })).toBe(false)
    expect(glowBreathes({ focused: true, reduceMotion: false, anyLive: false })).toBe(false)
    expect([glowOpacity(true, false), glowOpacity(true, true)]).toEqual([0.15, 0.35])
  })

  it('holds a steady 0.3 when motion is reduced (WCAG 2.2.2)', () => {
    expect(glowOpacity(false, false)).toBe(0.3)
    expect(glowOpacity(false, true)).toBe(0.3)
    expect(MAP_THEME.glow.periodMs).toBe(1600)
  })
})

describe('chips above the roofs', () => {
  it('rise with the roof and the tilt, and clear a flat view by the gap', () => {
    const view = { zoom: 16, pitch: 55, latitude: LAT }
    expect(chipLiftPx(50, view)).toBeGreaterThan(chipLiftPx(15, view))
    expect(chipLiftPx(15, { ...view, zoom: 17 })).toBeGreaterThan(chipLiftPx(15, view))
    expect(chipLiftPx(15, { ...view, pitch: 0 })).toBe(MAP_THEME.chip.gapPx)
    expect(topOfM(place({ height: 5 }))).toBe(litTopM(5))
    expect(topOfM(place({ footprint: null }))).toBe(MAP_THEME.beacon.heightM)
  })

  it('go to the nearest few to the centre only', () => {
    const at = (id: string, x: number, y: number) => ({ id, screen: [x, y] as [number, number] })
    const items = [at('far', 0, 0), at('near', 195, 395), at('mid', 100, 300), at('centre', 200, 400)]
    expect(nearest(items, [200, 400], 2).map((i) => i.id)).toEqual(['centre', 'near'])
  })

  it('say LIVE for a live event, its start otherwise, and a venue\'s bucket, never a number', () => {
    expect(chipLine({ kind: 'event', live: true, startsAt: null, bucket: null })).toBe('LIVE ●')
    const friday8pm = new Date(2026, 9, 9, 20, 0).toISOString()
    const later = chipLine({ kind: 'event', live: false, startsAt: friday8pm, bucket: null })
    expect(later).toContain(new Date(friday8pm).toLocaleDateString(undefined, { weekday: 'short' }))
    expect(later).toMatch(/8:00/)
    expect(chipLine({ kind: 'event', live: false, startsAt: 'garbage', bucket: null })).toBe('')
    expect(chipLine({ kind: 'venue', live: true, startsAt: null, bucket: '10-19' })).toBe('10–19 live')
    expect(chipLine({ kind: 'venue', live: false, startsAt: null, bucket: 'quiet' })).toBe('Under 5 live')
  })
})

describe('the map theme is the one place for the map\'s look', () => {
  const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it.each(['components/home/HomeMap.tsx', 'lib/homeMap.ts', 'lib/mapLit.ts', 'lib/mapStyleEmber.ts'])('%s holds no colour of its own', (file) => {
    expect(read(file)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
  })

  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)

  it('keeps every lit colour at 3:1 or more on the ground (WCAG 1.4.11)', () => {
    const lit = [MAP_THEME.event.walls, MAP_THEME.event.crown, MAP_THEME.event.glow, MAP_THEME.venue.walls, MAP_THEME.venue.crown, ...MAP_THEME.beacon.event, ...MAP_THEME.beacon.venue]
    for (const c of lit) expect(contrast(c, MAP_THEME.base.ground)).toBeGreaterThanOrEqual(3)
  })

  it('keeps the city calmer than anything lit: its tallest grey darker than the darkest lit colour', () => {
    const tallest = MAP_THEME.city.ramp[MAP_THEME.city.ramp.length - 1][1]
    const darkestLit = Math.min(...[MAP_THEME.event.walls, MAP_THEME.venue.walls].map(lum))
    expect(lum(tallest)).toBeLessThan(darkestLit)
    // …and every city grey above the ground, so walls do not vanish into it.
    for (const [, c] of MAP_THEME.city.ramp) expect(lum(c)).toBeGreaterThan(lum(MAP_THEME.base.ground))
  })

  it('anchors the light to the map (maplibre-native#4658) and keeps it soft', () => {
    expect(MAP_THEME.light.anchor).toBe('map')
    expect(MAP_THEME.light.intensity).toBeGreaterThanOrEqual(0.3)
    expect(MAP_THEME.light.intensity).toBeLessThanOrEqual(0.45)
  })

  it('draws the city opaque, without the outlines whose parts are drawn, shaded by height', () => {
    const city = EMBER_MAP_STYLE.layers.find((l) => l.id === 'building-3d')
    expect(city).toMatchObject({ filter: ['!=', ['get', 'hide_3d'], true], paint: { 'fill-extrusion-opacity': 1, 'fill-extrusion-color': cityColour() } })
    expect(cityColour()).toEqual(['interpolate', ['linear'], ['get', 'render_height'], ...MAP_THEME.city.ramp.flat()])
  })
})

import { readFileSync } from 'fs'
import { join } from 'path'

import { litPlaceFor, pinsFor, type Pin } from '../lib/homeMap'
import {
  bandsFor,
  boxesCollide,
  chipBox,
  chipSizePx,
  pickChips,
  type Box,
  chipLiftPx,
  chipLine,
  chipSpeech,
  circleRing,
  colourAt,
  dedupeLit,
  footprintKey,
  glowBreathes,
  glowFor,
  glowOpacity,
  glowRadius,
  litTopM,
  nearestTo,
  outsetRing,
  topOfM,
  type LitBuilding,
  type LitPlace,
  type Ring,
} from '../lib/mapLit'
import { buildingHeights, CITY_BUILDINGS, cityColour, EMBER_MAP_STYLE, LABELS_FROM_LAYER_ID } from '../lib/mapStyleEmber'
import { MAP_THEME } from '../lib/mapTheme'
import { EMBER } from '../lib/theme'

/**
 * The lit look of the home map (step 2c; research §4.2, prototype v2): what a
 * lit building, a beacon and a glow are made of, and the theme they are made from.
 */

const M_PER_DEG_LAT = 111_320
const LAT = 12.97
const LNG = 77.64
const kx = M_PER_DEG_LAT * Math.cos((LAT * Math.PI) / 180)
/** A ring from metre offsets around (LNG, LAT), closed. */
const ringM = (pts: [number, number][]): Ring => [...pts, pts[0]].map(([x, y]) => [LNG + x / kx, LAT + y / M_PER_DEG_LAT])
/** A ring back to metre offsets, open. */
const toM = (ring: Ring) => ring.slice(0, -1).map(([x, y]) => [Math.round((x - LNG) * kx * 100) / 100, Math.round((y - LAT) * M_PER_DEG_LAT * 100) / 100])

const square = (d: number, x = 0) =>
  ringM([
    [x, 0],
    [x + d, 0],
    [x + d, d],
    [x, d],
  ])

const building = (over: Partial<LitBuilding> = {}): LitBuilding => ({ key: footprintKey([square(10)]), footprint: [square(10)], featureId: null, height: 5, base: 0, ...over })
const place = (over: Partial<LitPlace>): LitPlace => ({ id: 'p', kind: 'event', live: false, at: [LNG, LAT], building: building(), ...over })

describe("a lit building is drawn around the city's own, never on it", () => {
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
    expect(toM(outsetRing(l, 0.5))[3]).toEqual([4.5, 4.5])
  })

  it('shrinks a courtyard when moved by a negative outset', () => {
    expect(toM(outsetRing(square(10), -0.5))[0]).toEqual([0.5, 0.5])
  })

  it('drops repeated vertices instead of throwing a corner away (a zero-length edge has no normal)', () => {
    const [a, b, c, d] = square(10)
    expect(outsetRing([a, b, b, c, d, a], 0.5)).toEqual(outsetRing(square(10), 0.5))
  })

  it('rounds to 7 decimals, so the same footprint gives the same GeoJSON from one pass to the next', () => {
    for (const [x, y] of outsetRing(square(10), 0.5)) {
      expect(Math.round(x * 1e7) / 1e7).toBe(x)
      expect(Math.round(y * 1e7) / 1e7).toBe(y)
    }
  })

  it('stands at least the stylised minimum, always above the city copy (owner, 2026-10-09)', () => {
    expect(litTopM(5)).toBe(MAP_THEME.lit.minHeightM + MAP_THEME.lit.raiseM)
    expect(litTopM(40)).toBe(40 + MAP_THEME.lit.raiseM)
    expect(MAP_THEME.lit.minHeightM).toBe(15)
    expect(MAP_THEME.lit.raiseM).toBeGreaterThan(0)
    expect(MAP_THEME.lit.outsetM).toBeGreaterThan(0)
  })

  it('is banded walls, dark at the foot to the brand colour, under a bright crown over the top quarter', () => {
    const bands = bandsFor(place({}))
    const top = litTopM(5)
    const crown = bands[bands.length - 1]
    const walls = bands.slice(0, -1)
    expect(walls).toHaveLength(MAP_THEME.lit.wallBands)
    expect(walls[0].properties.base).toBe(0)
    expect(walls[walls.length - 1].properties.height).toBeCloseTo(top * 0.75, 6)
    expect(walls[walls.length - 1].properties.color).toBe(MAP_THEME.event.walls[1])
    expect(crown.properties).toMatchObject({ color: MAP_THEME.event.crown, height: top })
    expect(crown.properties.base).toBeCloseTo(top * 0.75, 6)
    // Stacked, never overlapping.
    for (let i = 1; i < bands.length; i++) expect(bands[i].properties.base).toBeCloseTo(bands[i - 1].properties.height, 9)
    // Drawn on the outline moved out, not the outline itself.
    expect(crown.geometry.coordinates[0]).toEqual(outsetRing(square(10), MAP_THEME.lit.outsetM))
  })

  it('keeps a courtyard open, shrunk so its inner walls also clear the city', () => {
    const court = ringM([
      [3, 3],
      [3, 7],
      [7, 7],
      [7, 3],
    ])
    const [walls] = bandsFor(place({ building: building({ footprint: [square(10), court] }) }))
    expect(walls.geometry.coordinates[1]).toEqual(outsetRing(court, -MAP_THEME.lit.outsetM))
  })

  it('draws a venue in rose walls under an orchid crown', () => {
    const bands = bandsFor(place({ kind: 'venue' }))
    expect(bands[bands.length - 2].properties.color).toBe(MAP_THEME.venue.walls[1])
    expect(bands[bands.length - 1].properties.color).toBe(MAP_THEME.venue.crown)
  })

  it('draws nothing as GeoJSON for a building lit by its id with no outline (stage 2, feature-state)', () => {
    expect(bandsFor(place({ building: building({ footprint: null, featureId: 42 }) }))).toEqual([])
  })
})

describe('which building a pin lights, or a beacon (the beacon choice)', () => {
  const pin: Pin = pinsFor('events', {
    events: [{ id: 'e', title: 'E', latitude: LAT + 5 / M_PER_DEG_LAT, longitude: LNG + 5 / kx, start_time: new Date().toISOString(), end_time: null }],
    venues: [],
  })[0]
  const drawn = (id?: number) => [{ id, geometry: { type: 'Polygon', coordinates: [square(10)] }, properties: { render_height: 22, render_min_height: 3 } }]

  it('lights the building the pin stands in, at its own height, keyed by its outline', () => {
    const lit = litPlaceFor(pin, drawn())
    expect(lit.building).toMatchObject({ footprint: [square(10)], featureId: null, height: 22, base: 3, key: footprintKey([square(10)]) })
  })

  it("never lights by a merged tile's id; lights by id only where the tiles give each building its own (stage 2)", () => {
    expect(litPlaceFor(pin, drawn(7)).building?.featureId).toBeNull()
    expect(litPlaceFor(pin, drawn(7), true).building).toMatchObject({ featureId: 7, key: 'id:7' })
  })

  it('stands a beacon on the pin when no building holds it', () => {
    const away = { geometry: { type: 'Polygon', coordinates: [square(10, 50)] }, properties: {} }
    expect(litPlaceFor(pin, [away]).building).toBeNull()
    expect(litPlaceFor(pin, []).building).toBeNull()
    expect(litPlaceFor(pin, []).at).toEqual([pin.longitude, pin.latitude])
  })

  it('makes a beacon a banded 16-sided pillar of the theme radius on the pin, 60–80 m tall, never a ring', () => {
    const at: [number, number] = [LNG, LAT]
    const bands = bandsFor(place({ building: null, at }))
    const { radiusM, sides, heightM, bands: n } = MAP_THEME.beacon
    expect(bands).toHaveLength(n)
    expect(bands[0].properties.base).toBe(0)
    expect(bands[n - 1].properties.height).toBe(heightM)
    expect(heightM).toBeGreaterThanOrEqual(60)
    expect(heightM).toBeLessThanOrEqual(80)
    expect(radiusM).toBeGreaterThanOrEqual(10)
    expect(radiusM).toBeLessThanOrEqual(12)
    const ring = bands[0].geometry.coordinates
    expect(ring).toHaveLength(1)
    expect(ring[0]).toHaveLength(sides + 1)
    for (const [x, y] of ring[0]) expect(Math.hypot((x - LNG) * kx, (y - LAT) * M_PER_DEG_LAT)).toBeCloseTo(radiusM, 1)
    expect(ring[0]).toEqual(circleRing(at, radiusM, sides))
  })

  it('bands an event beacon ember → rose → orchid and a venue beacon rose → orchid, bottom to top', () => {
    const event = bandsFor(place({ building: null })).map((b) => b.properties.color)
    const venue = bandsFor(place({ building: null, kind: 'venue' })).map((b) => b.properties.color)
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
    expect(dedupeLit([place({ id: 'first' }), place({ id: 'second' })]).map((p) => p.id)).toEqual(['first'])
  })

  it('keeps one beacon per spot, and different buildings apart', () => {
    const beacons = dedupeLit([place({ id: 'a', building: null }), place({ id: 'b', building: null, live: true })])
    expect(beacons.map((p) => p.id)).toEqual(['b'])
    const next = [square(10, 30)]
    const twoBuildings = dedupeLit([place({ id: 'a' }), place({ id: 'b', building: building({ footprint: next, key: footprintKey(next) }) })])
    expect(twoBuildings).toHaveLength(2)
  })

  it('tells apart two outlines that share their first corner and vertex count (the old key collided)', () => {
    const a = ringM([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ])
    const b = ringM([
      [0, 0],
      [12, 0],
      [12, 8],
      [0, 8],
    ])
    expect(a[0]).toEqual(b[0])
    expect(a).toHaveLength(b.length)
    expect(footprintKey([a])).not.toBe(footprintKey([b]))
    expect(footprintKey([a])).toBe(footprintKey([a.map((v) => [...v])]))
  })
})

describe('the ground glow', () => {
  it('lies under every lit place: breathing for a live event, stronger at a beacon, still at a building', () => {
    expect(glowFor(place({ live: true })).properties).toMatchObject({ pulse: true, color: MAP_THEME.event.glow })
    expect(glowFor(place({ live: false })).properties).toMatchObject({ pulse: false, opacity: MAP_THEME.glow.still })
    expect(glowFor(place({ live: false, building: null })).properties).toMatchObject({ pulse: false, opacity: MAP_THEME.glow.beacon })
    expect(MAP_THEME.glow.beacon).toBeGreaterThan(MAP_THEME.glow.still)
    // A venue never breathes, live or not, and glows rose.
    expect(glowFor(place({ kind: 'venue', live: true })).properties).toMatchObject({ pulse: false, color: MAP_THEME.venue.glow })
  })

  it('sits on the public pin', () => {
    expect(glowFor(place({ live: true, at: [77.1, 12.1] })).geometry.coordinates).toEqual([77.1, 12.1])
  })

  it('is the theme radius on the ground, and stops growing past its zoom cap', () => {
    const [, , , z0, px0, z1, px1] = glowRadius()
    const mpp = (z: number) => (40_075_016.686 * Math.cos((MAP_THEME.glow.referenceLatitude * Math.PI) / 180)) / (512 * 2 ** z)
    expect(px0 * mpp(z0)).toBeCloseTo(MAP_THEME.glow.radiusM, 6)
    expect(px1 * mpp(z1)).toBeCloseTo(MAP_THEME.glow.radiusM, 6)
    expect(z1).toBe(MAP_THEME.glow.maxZoom)
    expect(MAP_THEME.glow.maxZoom).toBeLessThanOrEqual(18)
  })

  it('breathes 0.15 ↔ 0.35 only in view, with motion allowed and something live, and only for a few seconds', () => {
    expect(glowBreathes({ visible: true, reduceMotion: false, anyLive: true })).toBe(true)
    expect(glowBreathes({ visible: true, reduceMotion: true, anyLive: true })).toBe(false)
    expect(glowBreathes({ visible: false, reduceMotion: false, anyLive: true })).toBe(false)
    expect(glowBreathes({ visible: true, reduceMotion: false, anyLive: false })).toBe(false)
    expect([glowOpacity('low'), glowOpacity('high')]).toEqual([0.15, 0.35])
    expect(MAP_THEME.glow.breatheForMs).toBeLessThanOrEqual(5000)
  })

  it('holds a steady 0.3 when not breathing (WCAG 2.2.2)', () => {
    expect(glowOpacity('steady')).toBe(0.3)
    expect(MAP_THEME.glow.periodMs).toBe(1600)
  })
})

describe('chips above the roofs', () => {
  it('rise with the roof and the tilt, and clear a flat view by the gap', () => {
    const view = { zoom: 16, pitch: 55, latitude: LAT }
    expect(chipLiftPx(50, view)).toBeGreaterThan(chipLiftPx(15, view))
    expect(chipLiftPx(15, { ...view, zoom: 17 })).toBeGreaterThan(chipLiftPx(15, view))
    expect(chipLiftPx(15, { ...view, pitch: 0 })).toBe(MAP_THEME.chip.gapPx)
    expect(topOfM(place({}))).toBe(litTopM(5))
    expect(topOfM(place({ building: null }))).toBe(MAP_THEME.beacon.heightM)
  })

  it('go to the nearest few to the centre only', () => {
    const at = (id: string, dx: number, dy: number) => ({ id, at: [LNG + dx / kx, LAT + dy / M_PER_DEG_LAT] as [number, number] })
    const items = [at('far', 900, 900), at('near', 20, 10), at('mid', 200, 0), at('centre', 0, 1)]
    expect(nearestTo(items, [LNG, LAT], 2).map((i) => i.id)).toEqual(['centre', 'near'])
  })

  it("say LIVE for a live event, its start in India's time otherwise, and a venue's bucket, never a number", () => {
    const now = Date.UTC(2026, 9, 9, 6, 0) // Fri 9 Oct, 11:30 IST
    expect(chipLine({ kind: 'event', live: true, startsAt: null, bucket: null }, now)).toBe('LIVE ●')
    // Fri 9 Oct 14:30Z is 8 PM in India, whatever the phone's zone.
    expect(chipLine({ kind: 'event', live: false, startsAt: '2026-10-09T14:30:00Z', bucket: null }, now)).toBe('Fri · 8 PM')
    expect(chipLine({ kind: 'event', live: false, startsAt: 'garbage', bucket: null }, now)).toBe('')
    expect(chipLine({ kind: 'venue', live: true, startsAt: null, bucket: '10-19' }, now)).toBe('10–19 live')
    expect(chipLine({ kind: 'venue', live: false, startsAt: null, bucket: 'quiet' }, now)).toBe('')
  })

  it("put a late-night start on India's day, not UTC's", () => {
    const now = Date.UTC(2026, 9, 9, 6, 0)
    // Fri 9 Oct 20:00Z is Sat 10 Oct, 1:30 AM in India.
    expect(chipLine({ kind: 'event', live: false, startsAt: '2026-10-09T20:00:00Z', bucket: null }, now)).toBe('Sat · 1:30 AM')
  })

  it('name the date for a start more than six days off, so "Fri" is never the wrong Friday', () => {
    const now = Date.UTC(2026, 9, 9, 6, 0)
    expect(chipLine({ kind: 'event', live: false, startsAt: '2026-10-16T14:30:00Z', bucket: null }, now)).toMatch(/16 Oct/)
    expect(chipLine({ kind: 'event', live: false, startsAt: '2026-10-14T14:30:00Z', bucket: null }, now)).not.toMatch(/Oct/)
  })

  it('read as plain words to a screen reader (review M5)', () => {
    const now = Date.UTC(2026, 9, 9, 6, 0)
    expect(chipSpeech({ title: 'Design Week', kind: 'event', live: true, startsAt: null, bucket: null }, now)).toBe('Design Week, live now')
    expect(chipSpeech({ title: 'Lupa', kind: 'venue', live: false, startsAt: null, bucket: 'quiet' }, now)).toBe('Lupa')
    expect(chipSpeech({ title: 'Jazz', kind: 'event', live: false, startsAt: '2026-10-09T14:30:00Z', bucket: null }, now)).toBe('Jazz, starts Fri 8 PM')
    expect(chipSpeech({ title: 'Jazz', kind: 'event', live: true, startsAt: null, bucket: null }, now)).not.toMatch(/●/)
  })
})

describe("the map theme is the one place for the map's look", () => {
  const read = (rel: string) =>
    readFileSync(join(__dirname, '..', rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')

  it.each([
    'components/home/HomeMap.tsx',
    'components/home/MapLitLayers.tsx',
    'components/home/useMapLighting.ts',
    'components/home/LocateButton.tsx',
    'components/home/MapCredit.tsx',
    'lib/homeMap.ts',
    'lib/mapLit.ts',
    'lib/mapStyleEmber.ts',
  ])(
    '%s holds no colour of its own',
    (file) => {
      expect(read(file)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
    }
  )

  it('takes the app tokens from lib/theme.ts instead of copying them (review M7)', () => {
    const theme = read('lib/mapTheme.ts')
    const appColours = (Object.values(EMBER) as unknown[]).filter((v): v is string => typeof v === 'string' && v.startsWith('#'))
    for (const hex of appColours) expect(theme.toUpperCase()).not.toContain(`'${hex.toUpperCase()}'`)
    expect(MAP_THEME.event.crown).toBe(EMBER.accent)
  })

  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)

  it('keeps every colour that carries a lit place at 3:1 or more on the ground (WCAG 1.4.11)', () => {
    // The crowns and roofs (most of what shows at a tilt), live or not, the top of the walls, the glows and the beacons; a wall's foot is shading.
    const carrying = [
      MAP_THEME.event.walls[1],
      MAP_THEME.event.crown,
      MAP_THEME.event.liveCrown,
      MAP_THEME.event.glow,
      MAP_THEME.venue.walls[1],
      MAP_THEME.venue.crown,
      MAP_THEME.venue.liveCrown,
      MAP_THEME.venue.glow,
      ...MAP_THEME.beacon.event,
      ...MAP_THEME.beacon.venue,
    ]
    for (const c of carrying) expect(contrast(c, MAP_THEME.base.ground)).toBeGreaterThanOrEqual(3)
  })

  it('draws every road at 2:1 or more on the ground, so a street is a line you can follow (variant B)', () => {
    const { ground, roadMinor, roadMajor, roadMajorFar, roadMajorCasing, roadMotorway } = MAP_THEME.base
    for (const road of [roadMinor, roadMajor, roadMajorFar, roadMajorCasing, roadMotorway]) expect(contrast(road, ground)).toBeGreaterThanOrEqual(2)
  })

  it('steps the major roads down below the buildings\' zoom, so the pin dots stay brighter there (REPORT.md, trade-off a)', () => {
    const { ground, roadMajor, roadMajorFar } = MAP_THEME.base
    expect(contrast(roadMajorFar, ground)).toBeLessThan(contrast(roadMajor, ground))
    expect(contrast(roadMajorFar, ground)).toBeLessThanOrEqual(2.45)
    const dots = [...Object.values(MAP_THEME.pin.event), ...Object.values(MAP_THEME.pin.venue)]
    for (const dot of dots) expect(contrast(dot, ground)).toBeGreaterThan(contrast(roadMajorFar, ground) + 1.5)
    const majors = EMBER_MAP_STYLE.layers.filter((l) => ['road_secondary_tertiary', 'road_trunk_primary', 'road_motorway'].includes(l.id))
    expect(majors).toHaveLength(3)
    for (const l of majors) expect((l.paint as Record<string, unknown>)['line-color']).toEqual(['step', ['zoom'], roadMajorFar, MAP_THEME.city.minZoom, expect.any(String)])
  })

  it('keeps every name at 4.5:1 or more against its halo and the ground (WCAG 1.4.3)', () => {
    const { ground, label, labelHalo } = MAP_THEME.base
    for (const text of [label, MAP_THEME.labels.place, MAP_THEME.labels.water]) {
      expect(contrast(text, labelHalo)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(text, ground)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('names the streets from walking zoom, the river and the neighbourhoods, over the buildings (variant B)', () => {
    const ids = EMBER_MAP_STYLE.layers.map((l) => l.id)
    const over = ids.indexOf(LABELS_FROM_LAYER_ID)
    for (const id of ['highway-name-minor', 'waterway-name', 'water-name', 'label_neighbourhood']) expect(ids.indexOf(id)).toBeGreaterThan(over)
    const streets = EMBER_MAP_STYLE.layers.find((l) => l.id === 'highway-name-minor')
    expect(streets).toMatchObject({ 'source-layer': 'transportation_name', minzoom: MAP_THEME.labels.streetMinZoom })
    expect(MAP_THEME.labels.streetMinZoom).toBe(15)
    // Pedestrian streets are drawn and named: a pedestrianised centre had no streets at all.
    for (const id of ['road_minor', 'highway-name-minor']) {
      expect(JSON.stringify(EMBER_MAP_STYLE.layers.find((l) => l.id === id))).toContain('"pedestrian"')
    }
    // The casings sit under the roads they case, from the buildings' zoom.
    for (const id of ['road_secondary_tertiary_casing', 'road_trunk_primary_casing']) {
      expect(ids.indexOf(id)).toBeLessThan(ids.indexOf('road_minor'))
      expect(EMBER_MAP_STYLE.layers.find((l) => l.id === id)).toMatchObject({ minzoom: MAP_THEME.city.minZoom })
    }
  })

  it('keeps the city calm and cool: darker than anything lit, never warmer than it is blue, yet above the ground', () => {
    const tallest = MAP_THEME.city.ramp[MAP_THEME.city.ramp.length - 1][1]
    const darkestLit = Math.min(...[MAP_THEME.event.walls[0], MAP_THEME.venue.walls[0]].map(lum))
    expect(lum(tallest)).toBeLessThan(darkestLit)
    for (const [, c] of MAP_THEME.city.ramp) {
      const [r, , b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
      expect(b).toBeGreaterThanOrEqual(r)
      expect(lum(c)).toBeGreaterThan(lum(MAP_THEME.base.ground))
    }
  })

  it('anchors the light to the map (maplibre-native#4658), cool and soft', () => {
    expect(MAP_THEME.light.anchor).toBe('map')
    expect(MAP_THEME.light.intensity).toBeGreaterThanOrEqual(0.3)
    expect(MAP_THEME.light.intensity).toBeLessThanOrEqual(0.5)
    // Variant B left the light alone (variant C's 0.6 cost the lit buildings their lead).
    expect(MAP_THEME.light.intensity).toBe(0.45)
    const [r, , b] = [1, 3, 5].map((i) => parseInt(MAP_THEME.light.color.slice(i, i + 2), 16))
    expect(b).toBeGreaterThanOrEqual(r)
  })

  it('draws the city opaque, without the outlines whose parts are drawn, shaded by height, a missing height as 0', () => {
    expect(CITY_BUILDINGS).toMatchObject({
      filter: ['!=', ['get', 'hide_3d'], true],
      paint: { 'fill-extrusion-opacity': 1, 'fill-extrusion-color': cityColour(), 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 0] },
    })
    expect(cityColour()).toEqual(['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 0], ...MAP_THEME.city.ramp.flat()])
  })
})


describe('chips on the screen (visual QA r5: they sat under the capsule and the bell, on the dot, on each other, and off the edge)', () => {
  // A 402 x 874 phone: the top chrome ends at 126, the drawer starts at 560, the side gutter is 16.
  const ZONE: Box = { left: 16, right: 402 - 16, top: 126, bottom: 560 }
  const chip = (id: string, x: number, y: number, o: { lift?: number; title?: string; line?: string } = {}) => {
    const c = { id, title: o.title ?? 'Toit', line: o.line ?? 'Live', kind: 'event' }
    return { item: id, box: chipBox([x, y], o.lift ?? 20, chipSizePx(c)) }
  }

  it('a chip stands centred on its roof, raised by its lift, as the marker draws it', () => {
    expect(chipBox([200, 300], 20, { width: 100, height: 52 })).toEqual({ left: 150, right: 250, top: 228, bottom: 280 })
  })

  it('sizes a chip from its words, never past the chip’s own maximum, a venue wider by its glyph', () => {
    const short = chipSizePx({ title: 'Toit', line: 'Live', kind: 'event' })
    const venue = chipSizePx({ title: 'Toit', line: 'Live', kind: 'venue' })
    const long = chipSizePx({ title: 'A name that goes on and on and on and on and on and on and on', line: '', kind: 'event' })
    expect(venue.width).toBeGreaterThan(short.width)
    expect(long.width).toBe(MAP_THEME.chip.maxWidthPx)
    expect(short.height).toBeGreaterThanOrEqual(MAP_THEME.chip.minTouchPx)
  })

  it('keeps the nearest first and up to the maximum', () => {
    const picked = pickChips([chip('a', 100, 300), chip('b', 300, 300), chip('c', 200, 450), chip('d', 120, 500), chip('e', 300, 500)], ZONE, [], 4)
    expect(picked).toEqual(['a', 'b', 'c', 'd'])
  })

  it('drops a chip under the top chrome (the capsule and the bell) and takes the next nearest instead', () => {
    // 'a' is nearest but its box starts above 126: under the glass capsule. 'b' fits.
    const picked = pickChips([chip('a', 200, 150), chip('b', 200, 400)], ZONE, [], 4)
    expect(picked).toEqual(['b'])
  })

  it('drops a chip half off the screen (Android: "…s Table at Lupa" cut at the left edge) and one over the drawer', () => {
    expect(pickChips([chip('left', 30, 300, { title: 'Chef’s Table at Lupa', line: 'Today · 3:00' })], ZONE, [], 4)).toEqual([])
    expect(pickChips([chip('right', 390, 300)], ZONE, [], 4)).toEqual([])
    expect(pickChips([chip('low', 200, 600)], ZONE, [], 4)).toEqual([])
  })

  it('drops a chip that lands on another (NYX Lounge Cafe on a ghost capsule), keeping the nearer one', () => {
    const picked = pickChips([chip('near', 200, 300), chip('on-it', 210, 306), chip('apart', 200, 470)], ZONE, [], 4)
    expect(picked).toEqual(['near', 'apart'])
  })

  it('keeps air between two chips: touching is a collision', () => {
    const a = chip('a', 100, 300)
    const b = { item: 'b', box: { ...a.box, left: a.box.right + 2, right: a.box.right + 60 } }
    expect(boxesCollide(a.box, b.box, 6)).toBe(true)
    expect(boxesCollide(a.box, b.box)).toBe(false)
    expect(pickChips([a, b], ZONE, [], 4)).toEqual(['a'])
  })

  it('drops a chip that covers the person’s dot', () => {
    const dot: Box = { left: 178, right: 222, top: 378, bottom: 422 }
    expect(pickChips([chip('over', 200, 440, { lift: 40 }), chip('clear', 100, 300)], ZONE, [dot], 4)).toEqual(['clear'])
  })

  it('no chip box is ever outside the zone or on another, whatever the pins (property over a grid of positions)', () => {
    const grid = Array.from({ length: 12 }, (_, i) => Array.from({ length: 12 }, (_, j) => chip(`${i}-${j}`, i * 36, 90 + j * 44))).flat()
    const picked = pickChips(grid, ZONE, [], 4)
    const boxes = picked.map((id) => grid.find((g) => g.item === id)!.box)
    for (const b of boxes) expect(b.left >= ZONE.left && b.right <= ZONE.right && b.top >= ZONE.top && b.bottom <= ZONE.bottom).toBe(true)
    boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => expect(boxesCollide(a, b)).toBe(false)))
    expect(picked.length).toBeLessThanOrEqual(4)
  })
})

describe('the home map hands the lighting pass what the person can see', () => {
  it('passes the visible window (under the chrome, over the drawer) and their fix, and the pass picks chips through pickChips', () => {
    const map = readFileSync(join(__dirname, '..', 'components', 'home', 'HomeMap.tsx'), 'utf8')
    expect(map).toMatch(/visible: \{ top: padding\.top, bottom: height - padding\.bottom \}/)
    expect(map).toMatch(/userAt: center \? \[center\.longitude, center\.latitude\] : null/)
    const hook = readFileSync(join(__dirname, '..', 'components', 'home', 'useMapLighting.ts'), 'utf8')
    expect(hook).toContain('pickChips(')
    expect(hook).toContain('m.project(c.at)')
  })
})

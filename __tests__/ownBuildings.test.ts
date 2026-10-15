import { readFileSync } from 'fs'
import { join } from 'path'

import { litPlaceFor, pinsFor } from '../lib/homeMap'
import { litStateTapped } from '../lib/mapLit'
import {
  BUILDING_LAYER_ID,
  drawsOwnBuildings,
  featureIdOf,
  OWN_BUILDINGS,
  OWN_BUILDINGS_ATTRIBUTION,
  OWN_BUILDINGS_CITIES,
  OWN_BUILDINGS_CREDITS,
  OWN_BUILDINGS_ENTER_INSET,
  OWN_BUILDINGS_LAYER_ID,
  OWN_BUILDINGS_LIT_BY,
  OWN_BUILDINGS_TILE_ZOOM,
  ownBuildingsUrl,
  parseOwnBuildingsUrl,
} from '../lib/mapStyleEmber'
import { MAP_THEME } from '../lib/mapTheme'

/**
 * The home map's buildings from our own tiles (stage 2, SCRUM-572): when they
 * are drawn, how a lit one looks through feature-state, ids across platforms,
 * and the credits.
 */

const V2 = 'https://blendn-media-staging.fly.storage.tigris.dev/map/buildings/v2/{z}/{x}/{y}.pbf'

describe('the tiles URL (review M7)', () => {
  it('takes an https {z}/{x}/{y} template from the env', () => {
    expect(ownBuildingsUrl(V2)).toBe(V2)
    expect(ownBuildingsUrl(`  ${V2}\n`)).toBe(V2)
  })

  it('is no URL, quietly, when unset or blank', () => {
    expect(parseOwnBuildingsUrl(undefined)).toEqual({ url: null, problem: null })
    expect(parseOwnBuildingsUrl('')).toEqual({ url: null, problem: null })
    expect(parseOwnBuildingsUrl('   ')).toEqual({ url: null, problem: null })
  })

  it('is no URL, with a reason to warn about, when set but unusable', () => {
    expect(parseOwnBuildingsUrl('http://insecure.example/{z}/{x}/{y}.pbf')).toEqual({ url: null, problem: 'not https' })
    expect(parseOwnBuildingsUrl('https://example.com/buildings.pmtiles').problem).toMatch(/exactly one/)
    expect(parseOwnBuildingsUrl('https://example.com/{z}/{z}/{x}/{y}.pbf').problem).toMatch(/exactly one/)
    expect(parseOwnBuildingsUrl('not a url {z}{x}{y}').problem).toBe('not a URL')
  })
})

describe('which buildings the map draws (review M4)', () => {
  const [w, s, e, n] = OWN_BUILDINGS_CITIES[0].bbox
  const view = (lng: number, lat: number, half = 0.006): [number, number, number, number] => [lng - half, lat - half, lng + half, lat + half]

  it('draws ours once the whole view is a kilometre inside a covered city, and OpenFreeMap otherwise', () => {
    expect(drawsOwnBuildings(V2, view(77.6075, 12.9738), false)).toBe(true) // MG Road
    expect(drawsOwnBuildings(V2, view(72.8777, 19.076), false)).toBe(false) // Mumbai: not built yet
    expect(drawsOwnBuildings(null, view(77.6075, 12.9738), false)).toBe(false)
    expect(drawsOwnBuildings(V2, null, false)).toBe(false)
    expect(OWN_BUILDINGS_CITIES.map((c) => c.name)).toEqual(['bengaluru'])
  })

  it('judges the whole view, not its centre: a view whose far edge leaves the city is not ours', () => {
    // Centre inside, top edge past the city's north edge (a tilted view reaches far).
    expect(drawsOwnBuildings(V2, [77.6, n - 0.01, 77.61, n + 0.01], true)).toBe(false)
  })

  it('switches on only well inside, and off as soon as any of the view leaves (no flapping on the edge)', () => {
    const nearEdge = view(w + OWN_BUILDINGS_ENTER_INSET / 2 + 0.006, 12.97)
    expect(drawsOwnBuildings(V2, nearEdge, false)).toBe(false) // not yet: inside, but within the margin
    expect(drawsOwnBuildings(V2, nearEdge, true)).toBe(true) // already on: stays on while all of it is inside
    expect(drawsOwnBuildings(V2, view(w + 0.003, 12.97), true)).toBe(false) // part of it is outside: off
    expect(drawsOwnBuildings(V2, view(77.6, s + 0.05), false)).toBe(true)
    expect(drawsOwnBuildings(V2, view(e - 0.003, 12.97), true)).toBe(false)
  })
})

describe('a building id, whichever platform hands it over (review H1)', () => {
  it('is a number from a number (iOS) or a digit string (Android), and nothing else', () => {
    expect(featureIdOf(101)).toBe(101)
    expect(featureIdOf('101')).toBe(101)
    expect(featureIdOf('0')).toBe(0)
    expect(featureIdOf('101a')).toBeNull()
    expect(featureIdOf('-1')).toBeNull()
    expect(featureIdOf(1.5)).toBeNull()
    expect(featureIdOf('99999999999999999999')).toBeNull()
    expect(featureIdOf(undefined)).toBeNull()
  })

  it('lights a building by its id when Android gives it as a string', () => {
    const [pin] = pinsFor('places', { events: [], venues: [{ id: 'v', name: 'V', latitude: 12.97, longitude: 77.59, liveNow: 'quiet' }] })
    const square = [
      [77.5899, 12.9699],
      [77.5901, 12.9699],
      [77.5901, 12.9701],
      [77.5899, 12.9701],
      [77.5899, 12.9699],
    ]
    const drawn = [{ id: '101', geometry: { type: 'Polygon', coordinates: [square] }, properties: { render_height: 30 } }]
    expect(litPlaceFor(pin, drawn, true).building).toMatchObject({ featureId: 101, key: 'id:101' })
  })
})

describe('a tap on our buildings (review H3)', () => {
  const states = [{ featureId: 101, pinId: 'lupa', kind: 'venue' as const, live: false }]

  it('finds the lit building among every building under the finger, not only the first', () => {
    expect(litStateTapped([{ id: 7 }, { id: 8 }, { id: 101 }], states)?.pinId).toBe('lupa')
  })

  it("matches Android's string ids", () => {
    expect(litStateTapped([{ id: '8' }, { id: '101' }], states)?.pinId).toBe('lupa')
  })

  it('opens nothing for unlit buildings', () => {
    expect(litStateTapped([{ id: 7 }, { id: 'x' }, {}], states)).toBeNull()
    expect(litStateTapped([], states)).toBeNull()
  })
})

describe('a building in our tiles, lit as itself', () => {
  const paint = OWN_BUILDINGS.paint
  const json = JSON.stringify(paint)
  const litKind = ['to-string', ['coalesce', ['feature-state', 'lit'], '']]
  const isLive = ['==', ['coalesce', ['feature-state', 'live'], false], true]

  it('has a layer id of its own, never the OpenFreeMap layer\'s, and is built at z14 (review M1, M2)', () => {
    expect(OWN_BUILDINGS).toMatchObject({ id: OWN_BUILDINGS_LAYER_ID, sourceLayer: 'building', minzoom: OWN_BUILDINGS_TILE_ZOOM })
    expect(OWN_BUILDINGS_LAYER_ID).not.toBe(BUILDING_LAYER_ID)
    expect(OWN_BUILDINGS_TILE_ZOOM).toBe(14)
  })

  it('keeps building parts: no hide_3d filter (it would cut a tower to its podium)', () => {
    expect(OWN_BUILDINGS).not.toHaveProperty('filter')
    expect(json).not.toMatch(/hide_3d/)
  })

  it("takes the kind's crown colour from feature-state, brighter while live, the city's ramp otherwise (L1)", () => {
    expect(paint['fill-extrusion-color']).toEqual([
      'case',
      ['==', litKind, 'event'],
      ['case', isLive, MAP_THEME.event.liveCrown, MAP_THEME.event.crown],
      ['==', litKind, 'venue'],
      ['case', isLive, MAP_THEME.venue.liveCrown, MAP_THEME.venue.crown],
      expect.arrayContaining(['interpolate']),
    ])
    expect(MAP_THEME.event.liveCrown).not.toBe(MAP_THEME.event.crown)
    expect(MAP_THEME.venue.liveCrown).not.toBe(MAP_THEME.venue.crown)
  })

  it('stands at least the stylised minimum only when lit, at its own height otherwise', () => {
    expect(paint['fill-extrusion-height']).toEqual([
      'case',
      ['==', litKind, ''],
      ['coalesce', ['get', 'render_height'], 0],
      ['max', ['coalesce', ['get', 'render_height'], 0], MAP_THEME.lit.minHeightM],
    ])
    expect(paint['fill-extrusion-opacity']).toBe(1)
  })

  it('is lit through feature-state, with the GeoJSON copy kept as the fallback', () => {
    expect(OWN_BUILDINGS_LIT_BY).toBe('feature-state')
  })
})

describe('the credits (review H2)', () => {
  it("name our tiles' sources, as their licences ask", () => {
    expect(OWN_BUILDINGS_CREDITS.map((c) => c.text)).toEqual(['© OpenStreetMap contributors', 'Overture Maps Foundation', 'Google Open Buildings', 'Microsoft'])
  })

  it("are one https link each: Android's attribution dialog lists only links", () => {
    const anchors = [...OWN_BUILDINGS_ATTRIBUTION.matchAll(/<a href="(https:\/\/[^"]+)">([^<]+)<\/a>/g)]
    expect(anchors.map((m) => m[2])).toEqual(OWN_BUILDINGS_CREDITS.map((c) => c.text))
    expect(anchors.map((m) => m[1])).toEqual(OWN_BUILDINGS_CREDITS.map((c) => c.href))
    // Nothing outside the links but the separators.
    expect(OWN_BUILDINGS_ATTRIBUTION.replace(/<a href="[^"]+">[^<]+<\/a>/g, '')).toBe(' ·  ·  · ')
  })

  it("are given to the source, next to OpenFreeMap's", () => {
    const layers = readFileSync(join(__dirname, '..', 'components/home/MapLitLayers.tsx'), 'utf8')
    expect(layers).toMatch(/<VectorSource[\s\S]*?attribution=\{OWN_BUILDINGS_ATTRIBUTION\}/)
  })
})

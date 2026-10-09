import { readFileSync } from 'fs'
import { join } from 'path'

import {
  BUILDING_LAYER_ID,
  drawsOwnBuildings,
  OWN_BUILDINGS,
  OWN_BUILDINGS_ATTRIBUTION,
  OWN_BUILDINGS_CITIES,
  OWN_BUILDINGS_LIT_BY,
  ownBuildingsUrl,
} from '../lib/mapStyleEmber'
import { MAP_THEME } from '../lib/mapTheme'

/**
 * The home map's buildings from our own tiles (stage 2, SCRUM-572): when they
 * are drawn, how a lit one looks through feature-state, and the credits.
 */

const V2 = 'https://blendn-media-staging.fly.storage.tigris.dev/map/buildings/v2/{z}/{x}/{y}.pbf'

describe('which buildings the map draws', () => {
  it('takes an https {z}/{x}/{y} template from the env, and nothing else', () => {
    expect(ownBuildingsUrl(V2)).toBe(V2)
    expect(ownBuildingsUrl(`  ${V2}\n`)).toBe(V2)
    expect(ownBuildingsUrl(undefined)).toBeNull()
    expect(ownBuildingsUrl('')).toBeNull()
    expect(ownBuildingsUrl('http://insecure.example/{z}/{x}/{y}.pbf')).toBeNull()
    expect(ownBuildingsUrl('https://example.com/buildings.pmtiles')).toBeNull()
  })

  it('draws ours inside a covered city and OpenFreeMap everywhere else, or when there are none', () => {
    expect(drawsOwnBuildings(V2, [77.6075, 12.9738])).toBe(true) // MG Road
    expect(drawsOwnBuildings(V2, [72.8777, 19.076])).toBe(false) // Mumbai: not built yet
    expect(drawsOwnBuildings(null, [77.6075, 12.9738])).toBe(false)
    expect(drawsOwnBuildings(V2, null)).toBe(false)
    expect(OWN_BUILDINGS_CITIES.map((c) => c.name)).toEqual(['bengaluru'])
  })
})

describe('a building in our tiles, lit as itself', () => {
  const paint = OWN_BUILDINGS.paint
  const json = JSON.stringify(paint)

  it('is the same layer id the lighting reads, from the `building` layer, from z14', () => {
    expect(OWN_BUILDINGS).toMatchObject({ id: BUILDING_LAYER_ID, sourceLayer: 'building', minzoom: 14 })
  })

  it("keeps building parts: no hide_3d filter (it would cut a tower to its podium)", () => {
    expect(OWN_BUILDINGS).not.toHaveProperty('filter')
    expect(json).not.toMatch(/hide_3d/)
  })

  it("takes the kind's crown colour from feature-state, the city's ramp otherwise", () => {
    expect(paint['fill-extrusion-color']).toEqual([
      'match',
      ['to-string', ['coalesce', ['feature-state', 'lit'], '']],
      'event',
      MAP_THEME.event.crown,
      'venue',
      MAP_THEME.venue.crown,
      expect.arrayContaining(['interpolate']),
    ])
  })

  it('stands at least the stylised minimum only when lit, at its own height otherwise', () => {
    expect(paint['fill-extrusion-height']).toEqual([
      'case',
      ['==', ['to-string', ['coalesce', ['feature-state', 'lit'], '']], ''],
      ['coalesce', ['get', 'render_height'], 0],
      ['max', ['coalesce', ['get', 'render_height'], 0], MAP_THEME.lit.minHeightM],
    ])
    expect(paint['fill-extrusion-opacity']).toBe(1)
  })

  it('is lit through feature-state, with the GeoJSON copy kept as the fallback', () => {
    expect(OWN_BUILDINGS_LIT_BY).toBe('feature-state')
  })
})

describe('the credits', () => {
  it("name our tiles' sources, as their licences ask", () => {
    expect(OWN_BUILDINGS_ATTRIBUTION).toBe('© OpenStreetMap contributors · Overture Maps Foundation · Google Open Buildings · Microsoft')
  })

  it("are given to the source, next to OpenFreeMap's", () => {
    const layers = readFileSync(join(__dirname, '..', 'components/home/MapLitLayers.tsx'), 'utf8')
    expect(layers).toMatch(/<VectorSource[\s\S]*?attribution=\{OWN_BUILDINGS_ATTRIBUTION\}/)
  })
})

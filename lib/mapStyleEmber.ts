/**
 * The home map's style: OpenFreeMap's "Liberty", restyled dark in the Ember
 * palette (plan v2 §4). Same tiles, glyphs and layer ids as Liberty
 * (https://tiles.openfreemap.org/styles/liberty), cut to what a night map
 * needs: land, water, parks, roads, buildings and place names. No POI icons
 * (no sprite), no road shields, no boundaries.
 *
 * Muted so the lit buildings are the brightest thing on it: roads a step above
 * the ground, labels low-contrast, buildings an opaque cool dark grey that gets
 * lighter with height. Every colour and size is `lib/mapTheme.ts`. The tiles
 * carry no Blendn data.
 *
 * Free, no key: OpenFreeMap. Its attribution stays on (`HomeMap.tsx`), as the
 * OpenStreetMap licence requires. OpenFreeMap has no SLA, so the style can be
 * moved without a release: `EXPO_PUBLIC_MAP_STYLE_URL` (a full style JSON URL,
 * e.g. this style self-hosted over our own tiles) replaces it when set. A
 * replacement must keep the `openmaptiles` source (its `building` layer is
 * extruded from it) and the `highway-name-major` layer (buildings go under it).
 *
 * The city's buildings are not in the style: `CITY_BUILDINGS` is drawn by the
 * component, so the source it reads can be swapped for our own building tiles
 * (stage 2) and held by a ref for feature-state.
 */
import type {
  FillExtrusionLayerSpecification,
  FilterSpecification,
  LineLayerSpecification,
  StyleSpecification,
  SymbolLayerSpecification,
} from '@maplibre/maplibre-react-native'

import { MAP_THEME } from './mapTheme'

// The spec's own property types, read off the layer types the package exports.
type LineWidth = NonNullable<LineLayerSpecification['paint']>['line-width']
type TextSize = NonNullable<SymbolLayerSpecification['layout']>['text-size']
type TextField = NonNullable<SymbolLayerSpecification['layout']>['text-field']
type ExtrusionColor = NonNullable<FillExtrusionLayerSpecification['paint']>['fill-extrusion-color']

const { ground: GROUND, park: PARK, water: WATER, roadMinor: ROAD_MINOR, roadMajor: ROAD_MAJOR, roadMotorway: ROAD_MOTORWAY, label: LABEL, labelHalo: LABEL_HALO } =
  MAP_THEME.base

const NAME: TextField = ['coalesce', ['get', 'name_en'], ['get', 'name']]
const FONT = ['Noto Sans Regular']

const road = (id: string, classes: string[], color: string, width: LineWidth): LineLayerSpecification => ({
  id,
  type: 'line',
  source: 'openmaptiles',
  'source-layer': 'transportation',
  filter: ['all', ['match', ['get', 'brunnel'], ['tunnel'], false, true], ['match', ['get', 'class'], classes, true, false]],
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: { 'line-color': color, 'line-width': width },
})

const place = (id: string, cls: string, minzoom: number, size: TextSize): SymbolLayerSpecification => ({
  id,
  type: 'symbol',
  source: 'openmaptiles',
  'source-layer': 'place',
  minzoom,
  filter: ['==', ['get', 'class'], cls],
  layout: { 'text-field': NAME, 'text-font': FONT, 'text-size': size, 'text-max-width': 8 },
  paint: { 'text-color': LABEL, 'text-halo-color': LABEL_HALO, 'text-halo-width': 1 },
})

/** The id of the extruded building layer: lit buildings are queried from it. */
export const BUILDING_LAYER_ID = 'blendn-buildings'

/** The first label layer: the city's buildings go under it, so road names stay readable. */
export const LABELS_FROM_LAYER_ID = 'highway-name-major'

/**
 * Where a building's height and base are in the tiles (OpenMapTiles). The one
 * place that knows the building data's shape: a different building source
 * (stage 2, our own tiles) changes this and the layer's `source`.
 */
export const BUILDING_PROPS = { height: 'render_height', base: 'render_min_height' } as const

/** A building's height and base off a rendered feature's properties, in metres; a missing one is 0. */
export function buildingHeights(properties: Record<string, unknown> | null | undefined): { height: number; base: number } {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)
  return { height: n(properties?.[BUILDING_PROPS.height]), base: n(properties?.[BUILDING_PROPS.base]) }
}

/** A height property, 0 where a feature has none (a `get` of a missing key is null, and null breaks the paint). */
const metres = (key: string): ['coalesce', ['get', string], number] => ['coalesce', ['get', key], 0]

/** The city's cool-dark ramp on height (`MAP_THEME.city.ramp`). */
export function cityColour(): ExtrusionColor {
  return ['interpolate', ['linear'], metres(BUILDING_PROPS.height), ...MAP_THEME.city.ramp.flat()] as ExtrusionColor
}

/**
 * The city's buildings, as the component draws them over OpenFreeMap: opaque
 * (translucent extrusions show through each other in no fixed order), without
 * the outlines whose parts are drawn on their own (`hide_3d`: extruding those
 * too stacks a block over its own parts), shaded by height.
 */
export const CITY_BUILDINGS: {
  id: string
  source: string
  sourceLayer: string
  minzoom: number
  filter: FilterSpecification
  paint: NonNullable<FillExtrusionLayerSpecification['paint']>
} = {
  id: BUILDING_LAYER_ID,
  source: 'openmaptiles',
  sourceLayer: 'building',
  minzoom: MAP_THEME.city.minZoom,
  filter: ['!=', ['get', 'hide_3d'], true],
  paint: {
    'fill-extrusion-color': cityColour(),
    'fill-extrusion-height': metres(BUILDING_PROPS.height),
    'fill-extrusion-base': metres(BUILDING_PROPS.base),
    'fill-extrusion-opacity': 1,
  },
}

/* -------------------------------------------------------------------------- */
/* Our own building tiles (stage 2, SCRUM-572)                                */
/* -------------------------------------------------------------------------- */

/**
 * Credits for our building tiles, shown with OpenFreeMap's (Blendn-Admin
 * `scripts/map-buildings/README.md`: ODbL, with Google's heights under CC BY
 * 4.0). Each credit is a link: Android's attribution dialog lists only links
 * (`<a href>`), so plain text left our credits off Android entirely.
 */
export const OWN_BUILDINGS_CREDITS: { text: string; href: string }[] = [
  { text: '© OpenStreetMap contributors', href: 'https://www.openstreetmap.org/copyright' },
  { text: 'Overture Maps Foundation', href: 'https://docs.overturemaps.org/attribution/' },
  { text: 'Google Open Buildings', href: 'https://sites.research.google/gr/open-buildings/' },
  { text: 'Microsoft', href: 'https://github.com/microsoft/GlobalMLBuildingFootprints' },
]

/** The credits as the source's attribution HTML, one link each. */
export const OWN_BUILDINGS_ATTRIBUTION = OWN_BUILDINGS_CREDITS.map(({ text, href }) => `<a href="${href}">${text}</a>`).join(' · ')

/**
 * The cities our tiles cover, by the box they were built for (Blendn-Admin
 * `scripts/map-buildings/cities.json`; only the built and uploaded ones).
 * Outside them our tiles have nothing, and OpenFreeMap's buildings are drawn.
 */
export const OWN_BUILDINGS_CITIES: { name: string; bbox: [number, number, number, number] }[] = [{ name: 'bengaluru', bbox: [77.45, 12.83, 77.78, 13.14] }]

/** The zoom our tiles are built at (`build.py`: z14 only); the source overzooms past it. Not a look: the data's shape. */
export const OWN_BUILDINGS_TILE_ZOOM = 14

/** Our layer's own id: never the OpenFreeMap layer's, so a lookup on one never reads the other's buildings. */
export const OWN_BUILDINGS_LAYER_ID = 'blendn-buildings-own'

/**
 * Our tiles' URL template, from `EXPO_PUBLIC_BUILDINGS_TILES_URL`
 * (`https://…/map/buildings/v2/{z}/{x}/{y}.pbf`). Null when unset; null with a
 * reason when set but unusable (not https, not a URL, or not exactly one each
 * of `{z}`, `{x}`, `{y}`), and the map keeps OpenFreeMap's buildings.
 */
export function parseOwnBuildingsUrl(raw: string | undefined): { url: string | null; problem: string | null } {
  const url = raw?.trim()
  if (!url) return { url: null, problem: null }
  let parsed: URL
  try {
    parsed = new URL(url.replace(/\{[zxy]\}/g, '0'))
  } catch {
    return { url: null, problem: 'not a URL' }
  }
  if (parsed.protocol !== 'https:') return { url: null, problem: 'not https' }
  const once = (t: string) => url.split(t).length === 2
  if (!once('{z}') || !once('{x}') || !once('{y}')) return { url: null, problem: 'needs exactly one {z}, {x} and {y}' }
  return { url, problem: null }
}

/** `parseOwnBuildingsUrl` of this build's env. */
export function ownBuildingsUrl(raw: string | undefined = process.env.EXPO_PUBLIC_BUILDINGS_TILES_URL): string | null {
  return parseOwnBuildingsUrl(raw).url
}

type Box = [number, number, number, number]
const inside = ([w, s, e, n]: Box, [bw, bs, be, bn]: Box, inset: number) => w >= bw + inset && s >= bs + inset && e <= be - inset && n <= bn - inset

/**
 * Past the edge of a covered city by this much (degrees, about 1 km) before
 * the map switches to our tiles, so a view that wobbles on the edge does not
 * flip back and forth.
 */
export const OWN_BUILDINGS_ENTER_INSET = 0.01

/**
 * Whether the view draws our buildings. From the whole view, not its centre: at
 * a tilt the far half of the screen reaches well past the centre, and our tiles
 * have nothing outside their city. On, once the view is a kilometre inside a
 * covered city; off, as soon as any of it leaves the city.
 */
export function drawsOwnBuildings(url: string | null, bounds: Box | null, drawingNow: boolean): boolean {
  if (!url || !bounds) return false
  const inset = drawingNow ? 0 : OWN_BUILDINGS_ENTER_INSET
  return OWN_BUILDINGS_CITIES.some(({ bbox }) => inside(bounds, bbox, inset))
}

/**
 * A feature's id as a number, or null. iOS gives a vector tile's numeric id as
 * a number; Android as a string ("101"), so an id check that wanted a number
 * never lit a building there. Only a whole, safe, non-negative number counts.
 */
export function featureIdOf(id: unknown): number | null {
  const n = typeof id === 'number' ? id : typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : NaN
  return Number.isSafeInteger(n) && n >= 0 ? n : null
}

/**
 * How a building in our tiles is lit: through feature-state on the building
 * itself (its parts share its id, so one call lights a whole landmark), or, if
 * the native SDK ever ignores feature-state on extrusion paint
 * (maplibre-native#4737), by the stage 1 GeoJSON copy over it.
 */
export const OWN_BUILDINGS_LIT_BY: 'feature-state' | 'copy' = 'feature-state'

/** The feature-state a lit building in our tiles carries. */
export type OwnBuildingState = { lit: 'event' | 'venue'; live: boolean }

type ExtrusionHeight = NonNullable<FillExtrusionLayerSpecification['paint']>['fill-extrusion-height']

/** Which kind lit a building in our tiles, '' when none. */
const litKind: ['to-string', ['coalesce', ['feature-state', string], string]] = ['to-string', ['coalesce', ['feature-state', 'lit'], '']]
/** Whether the building's place is live now. */
const isLive: ['==', ['coalesce', ['feature-state', string], boolean], boolean] = ['==', ['coalesce', ['feature-state', 'live'], false], true]

/**
 * Our buildings: every building its own feature with a numeric id, building
 * parts drawn under their outline's id (no `hide_3d`: filtering on it would cut
 * a tower down to its podium). A lit one takes its crown colour (a brighter one
 * while live) and stands at least the stylised minimum, through feature-state.
 */
export const OWN_BUILDINGS: {
  id: string
  sourceLayer: string
  minzoom: number
  paint: NonNullable<FillExtrusionLayerSpecification['paint']>
} = {
  id: OWN_BUILDINGS_LAYER_ID,
  sourceLayer: 'building',
  minzoom: OWN_BUILDINGS_TILE_ZOOM,
  paint: {
    'fill-extrusion-color': [
      'case',
      ['==', litKind, 'event'],
      ['case', isLive, MAP_THEME.event.liveCrown, MAP_THEME.event.crown],
      ['==', litKind, 'venue'],
      ['case', isLive, MAP_THEME.venue.liveCrown, MAP_THEME.venue.crown],
      cityColour(),
    ] as unknown as ExtrusionColor,
    'fill-extrusion-height': ['case', ['==', litKind, ''], metres(BUILDING_PROPS.height), ['max', metres(BUILDING_PROPS.height), MAP_THEME.lit.minHeightM]] as unknown as ExtrusionHeight,
    'fill-extrusion-base': metres(BUILDING_PROPS.base),
    'fill-extrusion-opacity': 1,
  },
}

export const EMBER_MAP_STYLE: StyleSpecification = {
  version: 8,
  name: 'Blendn Ember (OpenFreeMap Liberty, dark)',
  sources: {
    openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
  },
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': GROUND } },
    { id: 'park', type: 'fill', source: 'openmaptiles', 'source-layer': 'park', paint: { 'fill-color': PARK } },
    {
      id: 'landcover_grass',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      filter: ['match', ['get', 'class'], ['grass', 'wood'], true, false],
      paint: { 'fill-color': PARK, 'fill-opacity': 0.6 },
    },
    {
      id: 'water',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'water',
      filter: ['!=', ['get', 'brunnel'], 'tunnel'],
      paint: { 'fill-color': WATER },
    },
    {
      id: 'waterway_river',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'waterway',
      filter: ['==', ['get', 'class'], 'river'],
      paint: { 'line-color': WATER, 'line-width': ['interpolate', ['exponential', 1.2], ['zoom'], 11, 0.5, 20, 6] },
    },
    road('road_minor', ['minor', 'service'], ROAD_MINOR, ['interpolate', ['exponential', 1.2], ['zoom'], 13.5, 0, 14, 2, 20, 14]),
    road('road_secondary_tertiary', ['secondary', 'tertiary'], ROAD_MAJOR, ['interpolate', ['exponential', 1.2], ['zoom'], 6.5, 0, 8, 0.5, 20, 12]),
    road('road_trunk_primary', ['primary', 'trunk'], ROAD_MAJOR, ['interpolate', ['exponential', 1.2], ['zoom'], 5, 0, 7, 1, 20, 16]),
    road('road_motorway', ['motorway'], ROAD_MOTORWAY, ['interpolate', ['exponential', 1.2], ['zoom'], 5, 0, 7, 1, 20, 16]),
    {
      id: 'highway-name-major',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'transportation_name',
      minzoom: 13,
      filter: ['match', ['get', 'class'], ['primary', 'secondary', 'tertiary', 'trunk'], true, false],
      layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': FONT, 'text-size': 11 },
      paint: { 'text-color': LABEL, 'text-halo-color': LABEL_HALO, 'text-halo-width': 1 },
    },
    place('label_other', 'suburb', 11, ['interpolate', ['linear'], ['zoom'], 11, 10, 15, 12]),
    place('label_town', 'town', 6, ['interpolate', ['exponential', 1.2], ['zoom'], 7, 12, 11, 14]),
    place('label_city', 'city', 3, ['interpolate', ['exponential', 1.2], ['zoom'], 4, 11, 7, 13, 11, 18]),
  ],
}

/** The style the home map loads: the env's URL when set, else this one. */
export function homeMapStyle(): string | StyleSpecification {
  const url = process.env.EXPO_PUBLIC_MAP_STYLE_URL?.trim()
  return url ? url : EMBER_MAP_STYLE
}

/** The host a style comes from, for an error report (no PII, and never throws). */
export function styleHost(style: string | StyleSpecification): string {
  if (typeof style !== 'string') return 'tiles.openfreemap.org'
  try {
    return new URL(style).host
  } catch {
    return 'invalid-url'
  }
}

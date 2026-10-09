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
export const BUILDING_LAYER_ID = 'building-3d'

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

/** Credits for our building tiles, shown with OpenFreeMap's (Blendn-Admin `scripts/map-buildings/README.md`). */
export const OWN_BUILDINGS_ATTRIBUTION = '© OpenStreetMap contributors · Overture Maps Foundation · Google Open Buildings · Microsoft'

/**
 * The cities our tiles cover, by the box they were built for (Blendn-Admin
 * `scripts/map-buildings/cities.json`; only the built and uploaded ones). A
 * view centred outside them draws OpenFreeMap's buildings instead: our tiles
 * have nothing there.
 */
export const OWN_BUILDINGS_CITIES: { name: string; bbox: [number, number, number, number] }[] = [{ name: 'bengaluru', bbox: [77.45, 12.83, 77.78, 13.14] }]

/**
 * Our tiles' URL template, from `EXPO_PUBLIC_BUILDINGS_TILES_URL`
 * (`https://…/map/buildings/v2/{z}/{x}/{y}.pbf`); null when unset or not an
 * https `{z}/{x}/{y}` template, and the map keeps OpenFreeMap's buildings.
 */
export function ownBuildingsUrl(raw: string | undefined = process.env.EXPO_PUBLIC_BUILDINGS_TILES_URL): string | null {
  const url = raw?.trim()
  if (!url || !url.startsWith('https://') || !['{z}', '{x}', '{y}'].every((t) => url.includes(t))) return null
  return url
}

/** Whether a view centred here draws our buildings. */
export function drawsOwnBuildings(url: string | null, centre: [number, number] | null): boolean {
  if (!url || !centre) return false
  const [lng, lat] = centre
  return OWN_BUILDINGS_CITIES.some(({ bbox: [w, s, e, n] }) => lng >= w && lng <= e && lat >= s && lat <= n)
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

/**
 * Our buildings: every building its own feature with a numeric id, building
 * parts drawn under their outline's id (no `hide_3d`: filtering on it would cut
 * a tower down to its podium). A lit one takes its crown colour and stands at
 * least the stylised minimum, through feature-state.
 */
export const OWN_BUILDINGS: {
  id: string
  sourceLayer: string
  minzoom: number
  paint: NonNullable<FillExtrusionLayerSpecification['paint']>
} = {
  id: BUILDING_LAYER_ID,
  sourceLayer: 'building',
  minzoom: MAP_THEME.city.minZoom,
  paint: {
    'fill-extrusion-color': ['match', litKind, 'event', MAP_THEME.event.crown, 'venue', MAP_THEME.venue.crown, cityColour()] as unknown as ExtrusionColor,
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

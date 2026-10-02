/**
 * The home map's style: OpenFreeMap's "Liberty", restyled dark in the Ember
 * palette (plan v2 §4). Same tiles, glyphs and layer ids as Liberty
 * (https://tiles.openfreemap.org/styles/liberty), cut to what a night map
 * needs: land, water, parks, roads, buildings and place names. No POI icons
 * (no sprite), no road shields, no boundaries.
 *
 * Muted so the lit buildings are the brightest thing on it: roads a step above
 * the ground, labels low-contrast, buildings a dim neutral that the event and
 * venue shades sit above. The tiles carry no Blendn data.
 *
 * Free, no key: OpenFreeMap. Its attribution stays on (`HomeMap.tsx`), as the
 * OpenStreetMap licence requires. OpenFreeMap has no SLA, so the style can be
 * moved without a release: `EXPO_PUBLIC_MAP_STYLE_URL` (a full style JSON URL,
 * e.g. this style self-hosted over our own tiles) replaces it when set. A
 * replacement must keep a `building-3d` fill-extrusion layer for the lighting.
 */
import type {
  LineLayerSpecification,
  StyleSpecification,
  SymbolLayerSpecification,
} from '@maplibre/maplibre-react-native'

// The spec's own property types, read off the layer types the package exports.
type LineWidth = NonNullable<LineLayerSpecification['paint']>['line-width']
type TextSize = NonNullable<SymbolLayerSpecification['layout']>['text-size']
type TextField = NonNullable<SymbolLayerSpecification['layout']>['text-field']

const GROUND = '#141313'
const PARK = '#18201A'
const WATER = '#0E1620'
const ROAD_MINOR = '#232121'
const ROAD_MAJOR = '#2E2B2A'
const ROAD_MOTORWAY = '#3A3533'
const BUILDING = '#2A2827'
const LABEL = '#8A8584'
const LABEL_HALO = '#0F0E0E'

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
      id: BUILDING_LAYER_ID,
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 14,
      paint: {
        'fill-extrusion-color': BUILDING,
        'fill-extrusion-height': ['get', 'render_height'],
        'fill-extrusion-base': ['get', 'render_min_height'],
        'fill-extrusion-opacity': 0.85,
      },
    },
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

import type { StyleSpecification } from '@maplibre/maplibre-react-native'

import { cityBySlug, type CityCatalogue } from './city'
import type { LngLat } from './mapLit'
import { MAP_THEME } from './mapTheme'

/**
 * The location step's live map (Flow 2, owner 2026-11-01): the landing site's sequence (BlendnLanding
 * `src/components/live-phone/LiveMap.tsx`), played once in the app. The camera goes from the city, flat, to the app's own
 * opening view; then the places near the middle light one by one.
 */
export const FLAT_VIEW = { zoom: 13.4, pitch: 0, bearing: 0 } as const
export const OPENING_VIEW = { zoom: MAP_THEME.camera.zoom, pitch: MAP_THEME.camera.pitch, bearing: -17 } as const

/** The tilt from flat to the opening view. The landing gives it the first half of its step. */
export const CAMERA_MS = 1600
/** One place lights this long after the one before it (the landing's 0.08 of its step against the camera's 0.5). */
export const LIGHT_STEP_MS = 260
/** After Allow, the flight to the person, within a city (across cities it jumps: `cameraMove`). */
export const FLY_MS = 1200
/** Once what is near you has lit, it holds this long before the step moves on. */
export const LIT_HOLD_MS = 700

/**
 * Where the map opens before the phone has said where it is. First the phone's time zone, which the network sets where
 * the phone is: the one city in that zone, or its country's default when several share it. A Toronto phone set to
 * English (US) has region US and zone America/Toronto, and opened on Bengaluru without this (SCRUM-997). Then the city
 * the server made of the phone's region, else that country's default, else the catalogue's (a country we do not serve).
 * Never named on screen (SCRUM-997). Null without a catalogue or a centre for that city: the step shows its still frame
 * then, never a map of nowhere.
 */
export function openingCentre(catalogue: CityCatalogue | null | undefined, region: string | null, timeZone: string | null = null): LngLat | null {
  if (!catalogue) return null
  const countryDefault = (code: string | null | undefined) =>
    code ? (catalogue.countries?.find((c) => c.code === code.toUpperCase())?.defaultCitySlug ?? null) : null
  const device = catalogue.device
  const deviceSlug = device && device.access !== 'none' && device.access !== 'hidden' ? device.citySlug : null
  const slug = zoneCitySlug(catalogue, timeZone, countryDefault) ?? deviceSlug ?? countryDefault(region) ?? catalogue.defaultCitySlug ?? null
  const centre = cityBySlug(catalogue.cities, slug)?.centre
  return centre ? [centre.longitude, centre.latitude] : null
}

function zoneCitySlug(catalogue: CityCatalogue, timeZone: string | null, countryDefault: (code: string | null | undefined) => string | null): string | null {
  const inZone = timeZone ? catalogue.cities.filter((c) => c.timezone === timeZone && c.slug) : []
  if (inZone.length === 0) return null
  if (inZone.length === 1) return inZone[0].slug ?? null
  const fallback = countryDefault(inZone[0].country)
  return inZone.some((c) => c.slug === fallback) ? fallback : (inZone[0].slug ?? null)
}

/** The features of the first `n` places in `order`: every band of each, so a place lights whole. */
export function litUpTo<F extends { properties: { id: string } }>(features: F[], order: string[], n: number): F[] {
  const on = new Set(order.slice(0, n))
  return features.filter((f) => on.has(f.properties.id))
}

/**
 * The map's own style with no place names (city, town, neighbourhood): the step names no city (SCRUM-997), and the tiles
 * would, in 18 pt, right where the camera opens. Road names stay. A style served from a URL cannot be filtered here, so it
 * gets no live map (null): the still shows.
 */
export function unnamedStyle(style: string | StyleSpecification): StyleSpecification | null {
  if (typeof style === 'string') return null
  return { ...style, layers: style.layers.filter((l) => (l as { 'source-layer'?: string })['source-layer'] !== 'place') }
}

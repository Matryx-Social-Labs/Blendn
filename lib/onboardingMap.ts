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
 * Where the map opens before the phone has said where it is: the city the server made of the phone's country, else that
 * country's default, else the catalogue's (a country we do not serve). Never named on screen (SCRUM-997). Null without a
 * catalogue or a centre for that city: the step shows its still frame then, never a map of nowhere.
 */
export function openingCentre(catalogue: CityCatalogue | null | undefined, region: string | null): LngLat | null {
  if (!catalogue) return null
  const device = catalogue.device
  const deviceSlug = device && device.access !== 'none' && device.access !== 'hidden' ? device.citySlug : null
  const code = region?.toUpperCase()
  const countrySlug = code ? (catalogue.countries?.find((c) => c.code === code)?.defaultCitySlug ?? null) : null
  const centre = cityBySlug(catalogue.cities, deviceSlug ?? countrySlug ?? catalogue.defaultCitySlug ?? null)?.centre
  return centre ? [centre.longitude, centre.latitude] : null
}

/** The features of the first `n` places in `order`: every band of each, so a place lights whole. */
export function litUpTo<F extends { properties: { id: string } }>(features: F[], order: string[], n: number): F[] {
  const on = new Set(order.slice(0, n))
  return features.filter((f) => on.has(f.properties.id))
}

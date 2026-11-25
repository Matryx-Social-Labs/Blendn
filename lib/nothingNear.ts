import type { EventsListResponse } from './apiClient'
import { cityBySlug, cityNamed, type CityOption, type StoredCity } from './city'
import { getDistanceKm } from './geo'
import { distanceText } from './placesPane'

/**
 * "Nothing near you yet" (pulse-map sheet 07, frames 3–4; the advisor's rules on SCRUM-1087). The server answers
 * `include=near` with a fix (backend round 3): nothing anybody could go to within `reachKm`, and the nearest open city
 * that has something on. Then the map stays on you, the drawer shows that city ("In {city}", the default) or the honest
 * empty ("Near you"), the lap waits, and the city's distance is said once, never per row.
 */

export type NearSignal = NonNullable<EventsListResponse['near']>

/**
 * The city to show from far away, and how far it is. "Nothing near you" is about where the person stands, not the city:
 * a city they chose stays (a choice is never overridden, `lib/city.ts`), measured from the fix; otherwise the server's
 * nearest open city. None when something is near, or the server names nothing the list has.
 */
export function farCity({
  near,
  available,
  selection,
  from,
}: {
  near: NearSignal | null | undefined
  available: readonly CityOption[]
  selection: Pick<StoredCity, 'city' | 'source'> | null
  from: { latitude: number; longitude: number }
}): { option: CityOption; km: number } | null {
  if (!near?.empty) return null
  const chosen = selection?.source === 'chosen' ? cityNamed(available, selection.city) : null
  if (chosen?.centre) return { option: chosen, km: getDistanceKm(from.latitude, from.longitude, chosen.centre.latitude, chosen.centre.longitude) }
  const option = near.nearestCity ? cityBySlug(available, near.nearestCity.slug) : null
  return option && near.nearestCity ? { option, km: near.nearestCity.distanceKm } : null
}

const NBSP = '\u00a0'

/**
 * The far line, distance folded in (advisor on SCRUM-1087, 2026-11-21): "Nothing near you yet · Bengaluru, about 7,518 km
 * away". Two pieces so the line breaks only at the "·" (each piece is a wrapping row item); the distance is a guess at a
 * city centre, so it is said as one (`distanceText` approximate), with a no-break space before "km". The city is never cut.
 */
export function farLine(city: string, km: number): { status: string; where: string } {
  const distance = (distanceText(km, 'approximate') ?? '').replace(' km', `${NBSP}km`)
  return { status: 'Nothing near you yet ·', where: `${city}, ${distance} away` }
}

/** Open cities with something on, nearest first from `point`: where "Blend’n is on". */
export function openCitiesNearest(available: readonly CityOption[], point: { latitude: number; longitude: number }): string[] {
  return available
    .filter((c) => c.access !== 'comingSoon' && c.eventCount > 0 && c.centre)
    .map((c) => ({ name: c.city, km: getDistanceKm(point.latitude, point.longitude, c.centre!.latitude, c.centre!.longitude) }))
    .sort((a, b) => a.km - b.km)
    .map((c) => c.name)
}

/** Frame 4: "Nothing within 25 km yet", where Blend’n is on (two names and "more"), and the promise. No borrowed events. */
export function nearYouCopy(reachKm: number, cities: readonly string[]): { title: string; message: string } {
  const promise = 'We’ll tell you the day it opens near you.'
  const [a, b] = cities
  const where = !a ? null : !b ? a : cities.length === 2 ? `${a} and ${b}` : `${a}, ${b} and more`
  return {
    title: `Nothing within ${reachKm} km yet`,
    message: where ? `Blend’n is on in ${where}. ${promise}` : 'We’ll tell you the day Blend’n opens near you.',
  }
}

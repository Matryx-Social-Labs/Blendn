/**
 * Distance between two points on the earth, in **metres**.
 *
 * One implementation, because there were two and the unit is the whole point.
 * `app/(tabs)/events.tsx` returned metres and `EventDetailScreen.tsx` had its
 * own copy of the same Haversine — identical maths, separately maintained, and
 * exactly the shape of the bug that produced the original comment on the first
 * one: two call sites disagreed about kilometres versus metres, so the check-in
 * button enabled itself for someone standing a kilometre away, who then tapped
 * it and was correctly refused by the server with no idea why.
 *
 * The fix then was to convert once at the boundary. This finishes it: there is
 * now one function, it says its unit in its name, and there is nowhere for a
 * second opinion to live.
 */

/** Earth's mean radius, in metres. */
const EARTH_RADIUS_M = 6_371_000

const toRadians = (deg: number): number => (deg * Math.PI) / 180

export function getDistanceMetres(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const φ1 = toRadians(lat1)
  const φ2 = toRadians(lat2)
  const Δφ = toRadians(lat2 - lat1)
  const Δλ = toRadians(lon2 - lon1)

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)

  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * A fix's accuracy in metres, or null when the platform does not know it. iOS says -1 for an invalid one (truthy, so
 * `|| 999` kept it, and the server refuses a negative: SCRUM-930), and a NaN or Infinity is no more a measure.
 */
export const validAccuracy = (raw: number | null | undefined): number | null =>
  typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null

/** Kilometres, for display only. Never for a comparison against a radius. */
export function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return getDistanceMetres(lat1, lon1, lat2, lon2) / 1000
}

/**
 * A coordinate to ~100 m (3 decimals), for anything that is both sent to the
 * server and used in a cache key. The last-known fix and the live fix a few
 * metres apart differ in the sixth decimal, which made them two cache keys and
 * so two requests for one place; a jitter of that size is not a new request.
 */
export function roundCoord(n: number): number
export function roundCoord(n: number | undefined): number | undefined
export function roundCoord(n: number | undefined): number | undefined {
  return n === undefined ? undefined : Number(n.toFixed(3))
}

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

/** Kilometres, for display only. Never for a comparison against a radius. */
export function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return getDistanceMetres(lat1, lon1, lat2, lon2) / 1000
}

/**
 * How far away, phrased for a card.
 *
 * Distance is a **label** now, not a filter: nothing is hidden for being far,
 * so this is the only thing standing between "that's across town" and someone
 * tapping into an event they cannot reach. It has to be legible at a glance and
 * honest at every magnitude.
 *
 * Metres under a kilometre, because "0.4km" reads as precision that walking
 * distance does not need. One decimal up to 10km, none beyond — nobody plans
 * around the difference between 41.2km and 41.3km, and the extra digit only
 * makes the number harder to scan.
 *
 * `null` for an unknown distance rather than a placeholder, so callers fall
 * back to the venue name instead of rendering "— away".
 */
export function formatDistance(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km) || km < 0) return null
  if (km < 1) return `${Math.round(km * 1000)}m away`
  if (km < 10) return `${km.toFixed(1)}km away`
  return `${Math.round(km)}km away`
}

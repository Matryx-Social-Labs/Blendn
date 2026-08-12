import { formatDistance, getDistanceKm, getDistanceMetres } from '../lib/geo'

/**
 * The unit, pinned.
 *
 * There were two Haversine implementations in this app — one in
 * `app/(tabs)/events.tsx` and a private copy inside `EventDetailScreen` —
 * because a distance in kilometres was once compared against a check-in radius
 * in metres. The button enabled itself for someone standing a kilometre from
 * the venue, who tapped it and was correctly refused by a server that knew
 * better, with no explanation on screen.
 *
 * The fix was to convert once at the boundary. There is now one function, it
 * names its unit, and these are the assertions that keep it honest.
 */

// MG Road, Bengaluru — the geofence centre used by the seeds.
const MG_ROAD = { lat: 12.9721, lon: 77.5938 }

describe('getDistanceMetres', () => {
  it('is zero for the same point', () => {
    expect(getDistanceMetres(MG_ROAD.lat, MG_ROAD.lon, MG_ROAD.lat, MG_ROAD.lon)).toBe(0)
  })

  it('returns METRES, not kilometres', () => {
    /*
     * The assertion the name is for. One degree of latitude is ~111 km, so a
     * function returning kilometres would answer ~111 here — three orders of
     * magnitude below the check, and it would sail through a test that only
     * asserted "greater than zero".
     */
    const oneDegreeNorth = getDistanceMetres(0, 0, 1, 0)
    expect(oneDegreeNorth).toBeGreaterThan(110_000)
    expect(oneDegreeNorth).toBeLessThan(112_000)
  })

  it('measures a short hop at street scale', () => {
    // ~0.001° of latitude is about 111 m — the order of magnitude a check-in
    // radius is actually set at.
    const d = getDistanceMetres(MG_ROAD.lat, MG_ROAD.lon, MG_ROAD.lat + 0.001, MG_ROAD.lon)
    expect(d).toBeGreaterThan(100)
    expect(d).toBeLessThan(125)
  })

  it('is symmetric', () => {
    const there = getDistanceMetres(12.97, 77.59, 12.98, 77.6)
    const back = getDistanceMetres(12.98, 77.6, 12.97, 77.59)
    expect(there).toBeCloseTo(back, 6)
  })

  it('handles the antimeridian without returning a negative or NaN', () => {
    // Longitude 179.9 to -179.9 is 0.2° apart, not 359.8°. Getting this wrong
    // is invisible in Bengaluru and wrong in Fiji.
    const d = getDistanceMetres(0, 179.9, 0, -179.9)
    expect(Number.isFinite(d)).toBe(true)
    expect(d).toBeGreaterThan(0)
    expect(d).toBeLessThan(25_000)
  })

  it('is roughly right over a known long distance', () => {
    // Bengaluru → Delhi is about 1,740 km great-circle. A sign error or a
    // radians/degrees slip does not survive a check at this scale.
    const d = getDistanceMetres(12.9721, 77.5938, 28.6139, 77.209)
    expect(d).toBeGreaterThan(1_700_000)
    expect(d).toBeLessThan(1_790_000)
  })
})

describe('getDistanceKm', () => {
  it('is exactly the metres, divided by a thousand', () => {
    // Display only. If this ever diverges from the metres version, the two-unit
    // bug is back.
    const m = getDistanceMetres(12.97, 77.59, 12.99, 77.61)
    expect(getDistanceKm(12.97, 77.59, 12.99, 77.61)).toBeCloseTo(m / 1000, 9)
  })
})

/**
 * How far away, phrased for a card.
 *
 * This label carries real weight now: distance stopped being a filter, so
 * nothing is hidden for being far and this sentence is the only thing between
 * "that's across town" and someone tapping into an event they cannot reach.
 */
describe('formatDistance', () => {
  it('uses metres under a kilometre', () => {
    // "0.4km" reads as precision that walking distance does not need.
    expect(formatDistance(0.42)).toBe('420m away')
  })

  it('uses one decimal in the near range', () => {
    expect(formatDistance(2.44)).toBe('2.4km away')
  })

  it('drops the decimal once it stops meaning anything', () => {
    // Nobody plans around 41.2 vs 41.3km; the digit only costs legibility.
    expect(formatDistance(41.2)).toBe('41km away')
  })

  it('is null for an unknown distance, not a placeholder', () => {
    // Callers fall back to the venue name. A placeholder would render
    // "— away", which reads as a bug rather than as missing data.
    expect(formatDistance(null)).toBeNull()
    expect(formatDistance(undefined)).toBeNull()
  })

  it('is null for values that are not real distances', () => {
    // `distanceMap` stores Infinity for an event with no coordinates, and a
    // NaN would render as "NaNkm away" on a card.
    expect(formatDistance(Number.POSITIVE_INFINITY)).toBeNull()
    expect(formatDistance(NaN)).toBeNull()
    expect(formatDistance(-1)).toBeNull()
  })

  it('never rounds a far event down to something reachable', () => {
    // The failure that matters is a big distance reading small.
    expect(formatDistance(0.999)).toBe('999m away')
    expect(formatDistance(1)).toBe('1.0km away')
  })
})

/**
 * A position sent in a URL is rounded to three decimals (about 110 m) before it leaves the phone: Railway logs the
 * query string, and the sort barely changes at that distance. The same rounding the Places key has always used.
 * A position in a request BODY that needs precision (check-in, go live) is not rounded, and is never in a URL.
 */
export const COORD_DECIMALS = 3

const SCALE = 10 ** COORD_DECIMALS

/** `12.971598` → `12.972`. */
export const roundCoordinate = (degrees: number): number => Math.round(degrees * SCALE) / SCALE

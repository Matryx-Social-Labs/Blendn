/*
 * How Android 14+ (API 34) draws `sp` (SCRUM-1109): along its own curves, not by the font scale, so a large size grows less than
 * a small one. A 30 sp line around a 24 sp title grows to 30 dp at 1.3 while the title grows to 26.4, and Satoshi's 1.25 em no
 * longer fits: the last line loses its descenders.
 *
 * A port of AOSP `FontScaleConverterFactory` + `FontScaleConverterImpl` (android-36.1 sources): the same tables, linear between
 * their sizes and from 0 under the first, the last pair's ratio past the last, a lerp between two tables, linear under 1.04
 * and past the last table.
 */

/** The sp sizes every table is keyed on. */
const SP = [8, 10, 12, 14, 18, 20, 24, 30, 100] as const

/** Each scale's dp for the sizes in `SP`. */
const CURVES: readonly (readonly [scale: number, dp: readonly number[]])[] = [
  [1.05, [8.4, 10.5, 12.6, 14.8, 18.6, 20.6, 24.4, 30, 100]],
  [1.1, [8.8, 11, 13.2, 15.6, 19.2, 21.2, 24.8, 30, 100]],
  [1.15, [9.2, 11.5, 13.8, 16.4, 19.8, 21.8, 25.2, 30, 100]],
  [1.2, [9.6, 12, 14.4, 17.2, 20.4, 22.4, 25.6, 30, 100]],
  [1.3, [10.4, 13, 15.6, 18.8, 21.6, 23.6, 26.4, 30, 100]],
  [1.5, [12, 15, 18, 22, 24, 26, 28, 30, 100]],
  [1.8, [14.4, 18, 21.6, 24.4, 27.6, 30.8, 32.8, 34.8, 100]],
  [2, [16, 20, 24, 26, 30, 34, 36, 38, 100]],
]

/** Under this the curves are off: Android scales linearly (its first table's scale less 0.01). */
const CURVES_FROM = 1.04
/** Android keys a scale to the hundredth (`SCALE_KEY_MULTIPLIER`), so a reported 1.2999999 is the 1.3 table. */
const KEY = 100

/** The API level the curves arrived in (Android 14). */
export const NONLINEAR_FONT_API = 34

function along(dp: readonly number[], sp: number): number {
  const hi = SP.findIndex((s) => s >= sp)
  if (hi === -1) return sp * (dp[dp.length - 1] / SP[SP.length - 1])
  if (SP[hi] === sp) return dp[hi]
  const [sp0, dp0] = hi === 0 ? [0, 0] : [SP[hi - 1], dp[hi - 1]]
  return dp0 + ((dp[hi] - dp0) * (sp - sp0)) / (SP[hi] - sp0)
}

/** The dp an Android 14+ phone at `fontScale` draws `sp` at. */
export function androidSpToDp(sp: number, fontScale: number): number {
  const scale = Math.round(fontScale * KEY) / KEY
  if (scale < CURVES_FROM) return sp * fontScale
  const hi = CURVES.findIndex(([s]) => s >= scale)
  if (hi === -1) return sp * fontScale
  const [s1, dp1] = CURVES[hi]
  if (s1 === scale) return along(dp1, sp)
  if (hi === 0) return sp * fontScale
  const [s0, dp0] = CURVES[hi - 1]
  const t = (scale - s0) / (s1 - s0)
  return along(dp0, sp) + (along(dp1, sp) - along(dp0, sp)) * t
}

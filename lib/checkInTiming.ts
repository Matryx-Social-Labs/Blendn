/**
 * The check-in's clock, for a drive to read in a Release build.
 *
 * One line per step, `+ms` since the hold committed:
 *
 *   ⏱ CHECKIN commit +0ms
 *   ⏱ CHECKIN location +38ms source=lastKnown ageMs=4100 accuracyM=5
 *   ⏱ CHECKIN request +40ms
 *   ⏱ CHECKIN sent +52ms            (left the request queue, fetch started)
 *   ⏱ CHECKIN response +640ms ok=1
 *
 * iOS sim: `xcrun simctl spawn booted log stream --level info --predicate
 * 'eventMessage CONTAINS "CHECKIN"'`. Android: `adb logcat -s ReactNativeJS`.
 *
 * On in Release on purpose (`Logger.info` is not), and safe there by type: a
 * step from a fixed list, numbers, and a fix source from a fixed list. No
 * coordinates, ids, names or free text can be passed, so none can leak.
 */
export type FixSource = 'warm' | 'lastKnown' | 'fresh'
export type CheckInStep = 'commit' | 'location' | 'request' | 'sent' | 'response'

let commitAt: number | null = null

export function markCheckIn(step: CheckInStep, fields: { source?: FixSource } & Record<string, number | FixSource | undefined> = {}): void {
  const now = Date.now()
  if (step === 'commit') commitAt = now
  const since = commitAt === null ? '' : ` +${now - commitAt}ms`
  const rest = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}=${typeof v === 'number' ? Math.round(v) : v}`)
    .join('')
  console.log(`⏱ CHECKIN ${step}${since}${rest}`)
}

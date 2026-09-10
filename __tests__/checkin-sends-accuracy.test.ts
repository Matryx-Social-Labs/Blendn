import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The GPS accuracy reaches the server.
 *
 * `getCurrentLocation` reads `location.coords.accuracy`, refuses anything worse
 * than 50m with it, and then returned only `{ latitude, longitude }` — so
 * `deviceInfo.gpsAccuracy` was `undefined` on every check-in the app has ever
 * sent, and four server mechanisms that read it saw nothing:
 *
 * | reads it | consequence |
 * |---|---|
 * | `MAX_GPS_ACCURACY_METERS` (150m) | unreachable — the real ceiling is this file's 50m |
 * | `evaluateCheckIn`'s allowance | every fix judged as the assumed 35m, never as itself |
 * | `check_in_refusals.accuracy_metres` | the column for telling a wrong pin from bad phones |
 * | `presence_sessions.last_accuracy` | 37 sessions on staging, none with a value |
 *
 * Measured, not inferred: no row written by the API carries an accuracy. The
 * only populated ones came from the seed script.
 *
 * Source text, because the defect was a value **dropped at a return statement**
 * after being computed and used two lines above. That is invisible to types —
 * the object was valid, just smaller — and it is the shape a guard has to pin.
 */
const SOURCE = readFileSync(
  join(__dirname, '..', 'components', 'screens', 'EventDetailScreen.tsx'),
  'utf8'
)

/**
 * The contents of the `deviceInfo: { … }` literal, brace-matched.
 *
 * Not a substring search on the whole file. The first version of this guard
 * asserted `SOURCE` contained `gpsAccuracy: location.accuracy`, and **passed
 * against the field moved out of `deviceInfo` to the top level** — which is
 * precisely the mistake that made the value invisible to the route in the first
 * place, and the mistake I made again when hand-testing it with curl.
 *
 * Brace-matched rather than a negated character class, because `[^}]*` stops at
 * the first nested `}` and this project has shipped four guards that did.
 */
function deviceInfoLiteral(): string {
  const at = SOURCE.indexOf('deviceInfo: {')
  if (at === -1) return ''
  let i = at + 'deviceInfo: {'.length
  let depth = 1
  while (i < SOURCE.length && depth > 0) {
    if (SOURCE[i] === '{') depth++
    else if (SOURCE[i] === '}') depth--
    i++
  }
  return SOURCE.slice(at, i)
}

describe('check-in sends the accuracy it already measured', () => {
  it('found the file, so the assertions below are not vacuous', () => {
    expect(SOURCE).toContain('location.coords.accuracy')
    expect(SOURCE).toContain('apiClient.checkIn(')
  })

  it('returns the accuracy from getCurrentLocation rather than dropping it', () => {
    expect(SOURCE).toContain('accuracy: location.coords.accuracy ?? null')
  })

  it('sends it inside deviceInfo, which is the only place the route looks', () => {
    /*
     * The route reads `deviceInfo?.gpsAccuracy`. A top-level `gpsAccuracy` is
     * the same as sending nothing — and it is what a substring assertion
     * happily accepts, so this one reads the literal.
     */
    const literal = deviceInfoLiteral()
    expect(literal).toContain('platform')
    expect(literal).toContain('gpsAccuracy: location.accuracy')
  })

  it('still refuses a weak fix before it gets that far', () => {
    /*
     * The client-side gate stays. It is stricter than the server's 150m
     * ceiling, so it is the one that decides — and that is worth pinning,
     * because sending the value now makes the server's ceiling reachable and
     * the two thresholds are independent constants with nothing tying them.
     */
    expect(SOURCE).toContain('if (accuracy > 50)')
  })
})

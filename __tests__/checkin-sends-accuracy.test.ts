import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The check-in flow hands the whole location, accuracy included, to the request.
 *
 * `getCurrentLocation` once dropped the accuracy it had just measured, so
 * `deviceInfo.gpsAccuracy` was `undefined` on every check-in the app sent and
 * four server mechanisms that read it saw nothing (`check_in_refusals`,
 * `presence_sessions.last_accuracy`, the allowance in `evaluateCheckIn`).
 *
 * The value is owned behaviourally where it can be: `locationFix.test.ts` pins
 * that the fix carries its accuracy and refuses a worse one than 50m, and
 * `checkIn.test.ts` pins that it goes out inside `deviceInfo`. What neither
 * reaches is `useCheckInFlow` passing the fix through whole rather than
 * rebuilding `{ latitude, longitude }`, which is the same drop one call
 * earlier and invisible to types. That hook is not rendered here, so it is
 * the one line still read as source.
 */
const FLOW = readFileSync(join(__dirname, '..', 'lib', 'useCheckInFlow.ts'), 'utf8')

describe('check-in sends the accuracy it already measured', () => {
  it('passes the whole fix to the request, not a rebuilt lat/lng pair', () => {
    expect(FLOW).toContain('submitCheckIn(eventId, location)')
  })
})

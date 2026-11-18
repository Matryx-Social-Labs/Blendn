/*
 * The 7.3 km bug (pulse-map board, "Today"; ROADMAP § Backend later (4)): with location turned off in Settings, the
 * Featured card still said "7.3 km". The Pulse re-reads the permission on every return to the app, but kept the fix it
 * had from before, so `hasFix` stayed true and every distance kept printing from a position the app may no longer know.
 * A permission that is not granted drops the fix; a granted one keeps it.
 */
import { fixAfterPermission, type PreciseFix } from '../lib/roomButton'

const FIX: PreciseFix = { latitude: 12.9784, longitude: 77.6408, accuracy: 10 }

it.each(['denied', 'undetermined'] as const)('%s: the fix is dropped, so no distance is printed', (status) => {
  expect(fixAfterPermission(status, FIX)).toBeNull()
})

it('granted: the fix is kept, the same object (a new one would refetch the feed)', () => {
  expect(fixAfterPermission('granted', FIX)).toBe(FIX)
  expect(fixAfterPermission('granted', null)).toBeNull()
})

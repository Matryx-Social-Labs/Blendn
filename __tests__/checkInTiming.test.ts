/**
 * The check-in's clock for drives: one line per step, `+ms` since the hold
 * committed, numbers and a fix source only — nothing that could be personal.
 */
import { markCheckIn } from '../lib/checkInTiming'

it('prints each step against the commit, rounded, with nothing but the allowed fields', () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {})
  const now = jest.spyOn(Date, 'now')
  now.mockReturnValue(1_000)
  markCheckIn('commit')
  now.mockReturnValue(1_412)
  markCheckIn('location', { source: 'lastKnown', ageMs: 4_100.4, accuracyM: 5.2 })
  now.mockReturnValue(2_050)
  markCheckIn('response', { ok: 1 })
  expect(log.mock.calls.map(([line]) => line)).toEqual([
    '⏱ CHECKIN commit +0ms',
    '⏱ CHECKIN location +412ms source=lastKnown ageMs=4100 accuracyM=5',
    '⏱ CHECKIN response +1050ms ok=1',
  ])
  log.mockRestore()
  now.mockRestore()
})

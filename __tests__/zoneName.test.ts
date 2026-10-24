/*
 * The zone named after an event's time (R6-1, drive 6): Hermes on iOS answers "GMT" as the short name of Asia/Kolkata, so an
 * IST night on a Berlin iPhone read "9 AM GMT", which is a different time. The zones we serve are named from a fixed map;
 * any other is named by Intl when Intl gives a real abbreviation, and otherwise by its offset ("GMT+5:45"), never a bare
 * "GMT" unless the offset is 0.
 */

type Time = typeof import('../lib/time')

const previousZone = process.env.TZ
beforeAll(() => {
  // The phone is in Berlin.
  process.env.TZ = 'Europe/Berlin'
})
afterAll(() => {
  process.env.TZ = previousZone
})

// Sat 24 Oct 2026, 9:00 AM in Bengaluru (Berlin is on CEST, +2).
const OCT = '2026-10-24T03:30:00.000Z'
// Wed 14 Jan 2026, noon UTC (Berlin is on CET, +1; London on GMT, 0).
const JAN = '2026-01-14T12:00:00.000Z'

/** A fresh lib/time (its formatter caches are module state), with Intl's short zone name answering as Hermes on iOS does. */
function hermesIos(): Time {
  const Real = Intl.DateTimeFormat
  jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(((locale?: string | string[], options?: Intl.DateTimeFormatOptions) => {
    const real = new Real(locale, options)
    if (!options?.timeZoneName) return real
    return {
      formatToParts: (d?: Date | number) =>
        real.formatToParts(d).map((p) => (p.type === 'timeZoneName' ? { ...p, value: 'GMT' } : p)),
    } as Intl.DateTimeFormat
  }) as never)
  let time!: Time
  jest.isolateModules(() => {
    time = require('../lib/time') as Time
  })
  return time
}

afterEach(() => {
  jest.restoreAllMocks()
})

it('the zones we serve are named from the map, whatever Intl says', () => {
  const { eventClock } = hermesIos()
  expect(eventClock(OCT, 'Asia/Kolkata')).toBe('9 AM IST')
  expect(eventClock(OCT, 'America/Toronto')).toBe('11:30 PM ET')
  expect(eventClock(OCT, 'America/Vancouver')).toBe('8:30 PM PT')
  expect(eventClock(OCT, 'America/Halifax')).toBe('12:30 AM AT')
  expect(eventClock(JAN, 'UTC')).toBe('12 PM UTC')
})

it('any other zone Intl can only call "GMT" is named by its offset', () => {
  const { eventClock } = hermesIos()
  expect(eventClock(OCT, 'Asia/Kathmandu')).toBe('9:15 AM GMT+5:45')
  expect(eventClock(OCT, 'Asia/Dubai')).toBe('7:30 AM GMT+4')
  expect(eventClock(OCT, 'America/Sao_Paulo')).toBe('12:30 AM GMT-3')
})

it('a bare "GMT" only for a zone at offset 0', () => {
  const { eventClock } = hermesIos()
  expect(eventClock(JAN, 'Europe/London')).toBe('12 PM GMT')
})

it('a real abbreviation from Intl is still used (no mock: the engine names it)', () => {
  let time!: Time
  jest.isolateModules(() => {
    time = require('../lib/time') as Time
  })
  expect(time.eventClock(OCT, 'Europe/London')).toBe('4:30 AM BST')
  expect(time.eventClock(OCT, 'Asia/Kolkata')).toBe('9 AM IST')
})

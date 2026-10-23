/*
 * An event's times are said in the event's own zone, not the phone's (RC drive 5 D-4): on a Berlin phone the Scene's
 * DOORS tile read an IST hackathon's 9 AM doors as "4:30 AM" while its day line said 9 AM IST.
 */
import { cardTime, dayGroupLabel, featuredDateLabel, groupByDay, nextUpLabel, timeLabel } from '../lib/pulse'
import { dateParts } from '../lib/shareEvent'
import { changeLines } from '../lib/eventChange'
import { clockTime } from '../lib/time'

const IST = 'Asia/Kolkata'
const previousZone = process.env.TZ
beforeAll(() => {
  // The phone is in Berlin.
  process.env.TZ = 'Europe/Berlin'
})
afterAll(() => {
  process.env.TZ = previousZone
})

// Sat 24 Oct 2026, 9:00 AM in Bengaluru = 05:30 in Berlin (CEST).
const START = '2026-10-24T03:30:00.000Z'
const END = '2026-10-24T12:30:00.000Z'
// Fri 23 Oct, 22:00 in Berlin = Sat 24 Oct, 01:30 in Bengaluru: already "today" there.
const NOW = Date.parse('2026-10-23T20:00:00.000Z')

it('the phone really is in Berlin here (the device clock reads 5:30 AM)', () => {
  expect(clockTime(START)).toBe('5:30 AM')
})

it('cards, Going rows and headings say the event’s own time and day', () => {
  expect(timeLabel(START, IST)).toBe('9 AM')
  expect(cardTime({ start_time: START, end_time: END, timezone: IST }, NOW)).toBe('9 AM')
  expect(nextUpLabel(START, END, new Date(NOW), IST)).toBe('Today · 9 AM')
  expect(featuredDateLabel(START, new Date(NOW), IST)).toBe('Today')
  expect(dayGroupLabel(START, new Date(NOW), IST)).toEqual({ title: 'Today', weekday: 'Saturday' })
  expect(groupByDay([{ start_time: START, timezone: IST }], new Date(NOW))[0].title).toBe('Today')
})

it('the share card and a moved time say it in the event’s zone too', () => {
  expect(dateParts(START, IST)).toMatchObject({ dateText: 'Sat 24 Oct, 9 AM', date: { day: 'SAT', num: '24', month: 'OCT', time: '9:00 AM' } })
  const lines = changeLines({ fields: ['time'], from: { startTime: '2026-10-24T02:30:00.000Z' } } as never, { start_time: START, end_time: END, venue_name: '', address: '', timezone: IST }, NOW)
  expect(lines[0]).toMatchObject({ was: '8 AM', now: '9 AM' })
})

it('with no zone known (an older server), the phone’s time as before', () => {
  expect(timeLabel(START)).toBe('5:30 AM')
  expect(cardTime({ start_time: START, end_time: END }, NOW)).toBe('Sat · 5:30 AM')
})

it('500 Pulse rows in two zones build a handful of formatters, not thousands (review: large data)', () => {
  const Real = Intl.DateTimeFormat
  let built = 0
  const spy = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(((...args: ConstructorParameters<typeof Intl.DateTimeFormat>) => {
    built += 1
    return new Real(...args)
  }) as never)
  try {
    jest.isolateModules(() => {
      const { groupByDay: group } = require('../lib/pulse') as typeof import('../lib/pulse')
      const rows = Array.from({ length: 500 }, (_, i) => ({
        start_time: new Date(Date.parse(START) + i * 3_600_000).toISOString(),
        timezone: i % 2 ? IST : 'Europe/London',
      }))
      group(rows, new Date(NOW))
      group(rows, new Date(NOW))
    })
  } finally {
    spy.mockRestore()
  }
  // A date and a clock formatter per zone at most.
  expect(built).toBeLessThanOrEqual(4)
})

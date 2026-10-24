/*
 * The four surfaces admin #749 sends the event's zone to (RC drive 5 D-4 follow-up): past rows (`/me/attendance`), the
 * venue page's tonight and its upcoming list (`/venues/:id`, `/venues/:id/upcoming`), and Places' next event
 * (`/venues`). A Berlin phone, a New York night: each says New York's day and time, named; an older server without the
 * field keeps the phone's, as before.
 */
import { tonightEvent } from '../lib/placesPane'
import { featuredDateLabel } from '../lib/pulse'
import { nightLabel } from '../lib/meProfile'
import { startsLabel } from '../lib/roomMoments'
import { pastEventRows } from '../lib/savedEvents'
import { refreshPhoneZone } from '../lib/time'
import { timeRange, upcomingRows } from '../lib/venuePage'

jest.mock('../lib/apiClient', () => ({ apiClient: {} }))

const NY = 'America/New_York'
const previousZone = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'Europe/Berlin'
  // lib/time reads the phone's zone from the OS, not per call: tell it the phone moved.
  refreshPhoneZone()
})
afterAll(() => {
  process.env.TZ = previousZone
  refreshPhoneZone()
})

// Sat 24 Oct 2026, 7:30 PM in New York = Sun 25 Oct, 01:30 in Berlin.
const START = '2026-10-24T23:30:00.000Z'
const END = '2026-10-25T02:30:00.000Z'
// Sat 24 Oct, 2 PM in New York = 8 PM in Berlin: the same day in New York, the day before in Berlin.
const AFTERNOON = Date.parse('2026-10-24T18:00:00.000Z')

describe('past rows (GET /me/attendance)', () => {
  const attended = (timezone?: string) => [
    { id: 'e1', title: 'Jazz at the Vanguard', cover_image_url: null, start_time: START, end_time: END, venue_name: 'Village Vanguard', city: 'New York', attendedAt: START, ...(timezone ? { timezone } : {}) },
  ]
  it('carry the event’s zone, and say its own day', () => {
    const [row] = pastEventRows(attended(NY), Date.parse('2026-11-10T12:00:00Z'))
    expect(row.timezone).toBe(NY)
    expect(featuredDateLabel(row.start_time, new Date('2026-11-10T12:00:00Z'), row.timezone)).toBe('24 Oct')
    expect(nightLabel(row.start_time, row.timezone)).toBe('Sat 24 Oct')
  })
  it('an older server: the phone’s day, as before', () => {
    const [row] = pastEventRows(attended(), Date.parse('2026-11-10T12:00:00Z'))
    expect(row.timezone).toBeUndefined()
    expect(nightLabel(row.start_time, row.timezone)).toBe('Sun 25 Oct')
  })
})

describe('the venue page: tonight (GET /venues/:id)', () => {
  it('says the event’s own clock, named', () => {
    expect(startsLabel({ startsAt: START, endsAt: END, timeZone: NY }, AFTERNOON).text).toBe('7:30 PM EDT')
    expect(timeRange(START, END, NY)).toBe('7:30 PM – 10:30 PM EDT')
  })
  it('an older server: the phone’s clock, unnamed', () => {
    expect(startsLabel({ startsAt: START, endsAt: END }, AFTERNOON).text).toBe('1:30 AM')
    // Berlin leaves summer time at 01:00 UTC that night.
    expect(timeRange(START, END)).toBe('1:30 AM – 3:30 AM')
  })
})

describe('the venue page: upcoming (GET /venues/:id, /venues/:id/upcoming)', () => {
  it('each row is the event’s own day', () => {
    expect(upcomingRows([{ id: 'e1', title: 'Jazz', startTime: START, timezone: NY }])[0].day).toBe('Sat 24 Oct')
    expect(upcomingRows([{ id: 'e1', title: 'Jazz', startTime: START }])[0].day).toBe('Sun 25 Oct')
  })

  it('each row’s time is the event’s clock, named when it is not the phone’s (RC 7: "6:30 PM" on a Los Angeles phone)', () => {
    expect(upcomingRows([{ id: 'e1', title: 'Jazz', startTime: START, timezone: NY }])[0].time).toBe('7:30 PM EDT')
    // The phone in the event's zone: nothing to name.
    process.env.TZ = NY
    refreshPhoneZone()
    try {
      expect(upcomingRows([{ id: 'e1', title: 'Jazz', startTime: START, timezone: NY }])[0].time).toBe('7:30 PM')
    } finally {
      process.env.TZ = 'Europe/Berlin'
      refreshPhoneZone()
    }
    // An older server with no zone: the phone's clock, unnamed.
    expect(upcomingRows([{ id: 'e1', title: 'Jazz', startTime: START }])[0].time).toBe('1:30 AM')
  })
})

describe('Places’ next event (GET /venues)', () => {
  const next = (timezone?: string) => ({ id: 'e1', title: 'Jazz', slug: null, coverImageUrl: null, startTime: START, endTime: END, ...(timezone ? { timezone } : {}) })
  it('is tonight in New York, at New York’s clock', () => {
    expect(tonightEvent(next(NY), AFTERNOON)).toMatchObject({ id: 'e1', when: '7:30 PM EDT' })
  })
  it('an older server: the phone’s day, where it is tomorrow, so not tonight', () => {
    expect(tonightEvent(next(), AFTERNOON)).toBeNull()
  })
})

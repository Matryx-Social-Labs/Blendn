/*
 * The zone is named only when it differs from the phone's, and named as people say it (travel plan §4.6): "6 PM" at
 * home, "10:30 AM Toronto time" abroad. The names come from the catalogue (`nameZones`), so a new country is data:
 * a zone one listed city keeps is that city's time, a zone a whole country's cities share is that country's.
 * Compact slots (the set list's meridiem, a map chip) keep the short name: "ET", "IST".
 */
import { eventClock, nameZones, refreshPhoneZone, zoneSuffix } from '../lib/time'

const CITIES = [
  { city: 'Bengaluru', country: 'IN', timezone: 'Asia/Kolkata' },
  { city: 'Mumbai', country: 'IN', timezone: 'Asia/Kolkata' },
  { city: 'Toronto', country: 'CA', timezone: 'America/Toronto' },
  { city: 'Vancouver', country: 'CA', timezone: 'America/Vancouver' },
  { city: 'Hosur', country: null, timezone: null },
]
const COUNTRIES = [
  { code: 'IN', name: 'India', defaultCitySlug: 'bengaluru' },
  { code: 'CA', name: 'Canada', defaultCitySlug: 'toronto' },
]
// Fri 9 Oct 2026, 14:30Z: 8 PM in India, 10:30 AM in Toronto (EDT).
const T = '2026-10-09T14:30:00Z'

const previousZone = process.env.TZ
const phoneIn = (zone: string) => {
  process.env.TZ = zone
  refreshPhoneZone()
}
afterAll(() => {
  process.env.TZ = previousZone
  refreshPhoneZone()
  nameZones([], [])
})
beforeEach(() => nameZones(CITIES, COUNTRIES))

it('at home nothing is added: an Indian phone reading an Indian night', () => {
  phoneIn('Asia/Kolkata')
  expect(eventClock(T, 'Asia/Kolkata')).toBe('8 PM')
})

it('an Indian phone reads Toronto’s time as Toronto’s', () => {
  phoneIn('Asia/Kolkata')
  expect(eventClock(T, 'America/Toronto')).toBe('10:30 AM Toronto time')
})

it('a Toronto phone reads an Indian night as India’s: one zone, many cities, one country', () => {
  phoneIn('America/Toronto')
  expect(eventClock(T, 'Asia/Kolkata')).toBe('8 PM India time')
})

it('a compact slot keeps the short name', () => {
  phoneIn('Asia/Kolkata')
  expect(zoneSuffix(T, 'America/Toronto', { short: true })).toBe(' ET')
  expect(eventClock(T, 'America/Toronto', { short: true })).toBe('10:30 AM ET')
})

it('before the catalogue has named anything, the short name stands (control)', () => {
  nameZones([], [])
  phoneIn('Asia/Kolkata')
  expect(eventClock(T, 'America/Toronto')).toBe('10:30 AM ET')
})

it('a zone shared across countries is named by neither', () => {
  nameZones([...CITIES, { city: 'Detroit', country: 'US', timezone: 'America/Toronto' }], COUNTRIES)
  phoneIn('Asia/Kolkata')
  expect(eventClock(T, 'America/Toronto')).toBe('10:30 AM ET')
})

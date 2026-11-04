/*
 * Owner ruling, 2026-11-03: "adding something like India time or Canada time doesn't make sense because people select the
 * location they want to be in… just mention PM, AM." Times are still the event city's (the conversion stays); only the
 * label goes: no "India time", no "Toronto time", no "IST", no "Times are local".
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

import { cardTime } from '../lib/pulse'
import { eventClock, refreshPhoneZone } from '../lib/time'
import { travelBanner, type CityOption } from '../lib/city'

const previousZone = process.env.TZ
beforeAll(() => {
  // A Berlin phone, reading a Bengaluru night: once the case that printed "India time".
  process.env.TZ = 'Europe/Berlin'
  refreshPhoneZone()
})
afterAll(() => {
  process.env.TZ = previousZone
  refreshPhoneZone()
})

// Sat 24 Oct 2026, 9:00 PM in Bengaluru = 17:30 in Berlin.
const START = '2026-10-24T15:30:00.000Z'

it('an event’s clock is its city’s, with no zone after it', () => {
  expect(eventClock(START, 'Asia/Kolkata')).toBe('9 PM')
  expect(cardTime({ start_time: START, end_time: null, timezone: 'Asia/Kolkata' }, Date.parse('2026-10-22T10:00:00.000Z'))).toBe('Sat · 9 PM')
  // Control: the conversion stays. On the phone's own clock the same instant is 5:30 PM.
  expect(eventClock(START, 'Europe/Berlin')).toBe('5:30 PM')
})

it('the travel banner says where, never what time it is', () => {
  const blr: CityOption = { city: 'Bengaluru', eventCount: 9, slug: 'bengaluru', country: 'IN', timezone: 'Asia/Kolkata' }
  const tor: CityOption = { city: 'Toronto', eventCount: 9, slug: 'toronto', country: 'CA', timezone: 'America/Toronto' }
  const countries = [{ code: 'IN', name: 'India', defaultCitySlug: 'bengaluru' }, { code: 'CA', name: 'Canada', defaultCitySlug: 'toronto' }]
  const visiting = travelBanner({ home: blr, browse: tor, deviceCountry: 'CA', countries, seen: false })
  expect(visiting).toEqual({ kind: 'visiting', text: 'Visiting Toronto', back: 'Bengaluru' })
  const browsing = travelBanner({ home: tor, browse: blr, deviceCountry: 'CA', countries, seen: false })
  expect(browsing).toEqual({ kind: 'browsing', text: 'Browsing Bengaluru', back: 'Toronto' })
})

it('no source in app/, components/ or lib/ names a zone to the person', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n)
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : []
    })
  const root = join(__dirname, '..')
  const hits = ['app', 'components', 'lib']
    .flatMap((d) => walk(join(root, d)))
    .filter((f) => /zoneSuffix|Times are|` time`|\$\{place\} time|India time|Toronto time/.test(readFileSync(f, 'utf8')))
    .map((f) => f.slice(root.length + 1))
  expect(hits).toEqual([])
})

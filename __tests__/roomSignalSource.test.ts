/*
 * The centre button has one source (BAR-04): an unfiltered read of tonight near you, judged again on every tick and every new fix.
 */
import fs from 'fs'
import path from 'path'

jest.mock('../lib/api', () => ({ getEvents: jest.fn() }))
jest.mock('../lib/useTonight', () => ({ PULSE_PAGE: 20, quietLocation: jest.fn() }))
jest.mock('../lib/cityStorage', () => ({ readStoredCity: jest.fn() }))
jest.mock('../lib/checkIn', () => ({ subscribeCheckInChanged: jest.fn(() => () => {}) }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

/* eslint-disable import/first */
import { REFETCH_AGE_MS, createRoomSignalSource, type SourceDeps } from '../lib/useRoomSignalSource'
import type { RoomButtonEvent } from '../lib/roomButton'
import { clearRoomSignal, getRoomSignal, publishRoomSignal } from '../lib/roomSignal'
/* eslint-enable import/first */

const T0 = Date.parse('2026-10-27T18:00:00Z')
const DOORS = T0 + 4 * 60_000
// ~0.0009 deg of latitude is ~100 m.
const VENUE = { latitude: 12.97, longitude: 77.59 }
const event = (over: Partial<RoomButtonEvent> = {}): RoomButtonEvent => ({
  id: 'e1',
  start_time: new Date(DOORS).toISOString(),
  end_time: new Date(DOORS + 3 * 3600_000).toISOString(),
  ...VENUE,
  check_in_radius: 260,
  is_favorited: false,
  venue_name: 'Toit',
  ...over,
})
const fixAt = (dLat: number, now: number) => ({ latitude: VENUE.latitude + dLat, longitude: VENUE.longitude, accuracy: 10, timestamp: now, approximate: false })

function harness(feed: RoomButtonEvent[]) {
  let now = T0
  let fix: ReturnType<typeof fixAt> | null = fixAt(0.0018, now) // ~200 m away
  const fetchEvents = jest.fn(async () => feed)
  const deps: SourceDeps = {
    readFix: async () => (fix ? { ...fix, timestamp: now } : null),
    fetchEvents,
    publish: publishRoomSignal,
    now: () => now,
  }
  return {
    source: createRoomSignalSource(deps),
    fetchEvents,
    advance: (ms: number) => (now += ms),
    moveTo: (dLat: number) => (fix = fixAt(dLat, now)),
  }
}

beforeEach(() => clearRoomSignal())

it('judges the first read and fetches once', async () => {
  const h = harness([event()])
  await h.source.run()
  expect(h.fetchEvents).toHaveBeenCalledTimes(1)
  expect(getRoomSignal().insideEventId).toBeNull() // doors are not open yet
})

it('a tick past the doors flips the signal with no fetch', async () => {
  const h = harness([event()])
  await h.source.run()
  h.advance(4.5 * 60_000)
  await h.source.run()
  expect(getRoomSignal().insideEventId).toBe('e1')
  expect(getRoomSignal().insideVenue).toBe('Toit')
  expect(h.fetchEvents).toHaveBeenCalledTimes(1)
})

it('a new fix inside the fence flips it with no fetch; one past 1 km re-reads', async () => {
  const h = harness([event({ start_time: new Date(T0 - 60_000).toISOString() })])
  h.moveTo(0.01) // ~1.1 km out
  await h.source.run()
  expect(getRoomSignal().insideEventId).toBeNull()
  h.moveTo(0.0018)
  await h.source.run()
  expect(getRoomSignal().insideEventId).toBe('e1')
  expect(h.fetchEvents).toHaveBeenCalledTimes(1) // 0.9 km from where it read: under the bound
})

it('a fix more than 1 km from the last read fetches again', async () => {
  const h = harness([event()])
  await h.source.run()
  h.moveTo(0.02) // ~2.2 km
  await h.source.run()
  expect(h.fetchEvents).toHaveBeenCalledTimes(2)
})

it('re-reads when the read is 5 minutes old, and when forced', async () => {
  const h = harness([event()])
  await h.source.run()
  h.advance(REFETCH_AGE_MS)
  await h.source.run()
  expect(h.fetchEvents).toHaveBeenCalledTimes(2)
  await h.source.run(true)
  expect(h.fetchEvents).toHaveBeenCalledTimes(3)
})

it('a failed read keeps the last page', async () => {
  const h = harness([event({ start_time: new Date(T0 - 60_000).toISOString() })])
  await h.source.run()
  h.fetchEvents.mockResolvedValueOnce(null as never)
  await h.source.run(true)
  expect(getRoomSignal().insideEventId).toBe('e1')
})

it('only the source publishes the signal (a search on the Pulse cannot change it)', () => {
  const roots = ['app', 'components', 'lib']
  const hits: string[] = []
  const walk = (dir: string) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name)
      if (f.isDirectory()) walk(p)
      else if (/\.tsx?$/.test(f.name) && /publishRoomSignal\(/.test(fs.readFileSync(p, 'utf8'))) hits.push(p)
    }
  }
  roots.forEach((r) => walk(path.join(__dirname, '..', r)))
  expect(hits.map((p) => path.basename(p)).sort()).toEqual(['roomSignal.ts'])
})

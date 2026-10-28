/*
 * The centre button has one source (BAR-04): the nearest events to the fix, plus what is yours, judged again on every tick and
 * every new fix.
 */
import fs from 'fs'
import path from 'path'

jest.mock('../lib/api', () => ({ getEvents: jest.fn() }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getUserFavorites: jest.fn(), getMyRsvps: jest.fn() } }))
jest.mock('../lib/useTonight', () => ({ quietLocation: jest.fn() }))
jest.mock('../lib/checkIn', () => ({ subscribeCheckInChanged: jest.fn(() => () => {}) }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

/* eslint-disable import/first */
import { REFETCH_AGE_MS, createRoomSignalSource, mergeSignalEvents, type SourceDeps } from '../lib/useRoomSignalSource'
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
  distance: 0.2, // km, as the server measured it from the position the read was made at
  is_favorited: false,
  venue_name: 'Toit',
  ...over,
})
const fixAt = (dLat: number, now: number) => ({ latitude: VENUE.latitude + dLat, longitude: VENUE.longitude, accuracy: 10, timestamp: now, approximate: false })

function harness(nearest: RoomButtonEvent[], yours: RoomButtonEvent[] = []) {
  let now = T0
  let fix: ReturnType<typeof fixAt> | null = fixAt(0.0018, now) // ~200 m away
  const fetchNearest = jest.fn(async (_where: unknown, _force: boolean) => nearest as RoomButtonEvent[] | null)
  const fetchMine = jest.fn(async () => yours as RoomButtonEvent[] | null)
  const publish = jest.fn(publishRoomSignal)
  const deps: SourceDeps = {
    readFix: async () => (fix ? { ...fix, timestamp: now } : null),
    fetchNearest,
    fetchMine,
    publish,
    now: () => now,
  }
  return {
    source: createRoomSignalSource(deps),
    fetchNearest,
    fetchMine,
    publish,
    advance: (ms: number) => (now += ms),
    moveTo: (dLat: number) => (fix = fixAt(dLat, now)),
    loseFix: () => (fix = null),
  }
}

beforeEach(() => clearRoomSignal())

it('judges the first read and fetches once', async () => {
  const h = harness([event()])
  await h.source.run()
  expect(h.fetchNearest).toHaveBeenCalledTimes(1)
  expect(getRoomSignal().insideEventId).toBeNull() // doors are not open yet
})

it('a tick past the doors flips the signal with no fetch', async () => {
  const h = harness([event()])
  await h.source.run()
  h.advance(4.5 * 60_000)
  await h.source.run()
  expect(getRoomSignal().insideEventId).toBe('e1')
  expect(getRoomSignal().insideVenue).toBe('Toit')
  expect(h.fetchNearest).toHaveBeenCalledTimes(1)
})

it('a new fix inside the fence flips it with no fetch; one past 1 km re-reads', async () => {
  const h = harness([event({ start_time: new Date(T0 - 60_000).toISOString() })])
  h.moveTo(0.01) // ~1.1 km out
  await h.source.run()
  expect(getRoomSignal().insideEventId).toBeNull()
  h.moveTo(0.0018)
  await h.source.run()
  expect(getRoomSignal().insideEventId).toBe('e1')
  expect(h.fetchNearest).toHaveBeenCalledTimes(1) // 0.9 km from where it read: under the bound
})

it('a fix more than 1 km from the last read fetches again', async () => {
  const h = harness([event()])
  await h.source.run()
  h.moveTo(0.02) // ~2.2 km
  await h.source.run()
  expect(h.fetchNearest).toHaveBeenCalledTimes(2)
})

it('re-reads when the read is 5 minutes old, and when forced', async () => {
  const h = harness([event()])
  await h.source.run()
  h.advance(REFETCH_AGE_MS)
  await h.source.run()
  expect(h.fetchNearest).toHaveBeenCalledTimes(2)
  await h.source.run(true)
  expect(h.fetchNearest).toHaveBeenCalledTimes(3)
})

it('a failed read keeps the last page', async () => {
  const h = harness([event({ start_time: new Date(T0 - 60_000).toISOString() })])
  await h.source.run()
  h.fetchNearest.mockResolvedValueOnce(null)
  await h.source.run(true)
  expect(getRoomSignal().insideEventId).toBe('e1')
})

describe('a stale fix does not drop you out of the room (H3)', () => {
  it('after the fix is lost for five minutes you are still inside, and the re-read asks for the last place you were', async () => {
    const h = harness([event({ start_time: new Date(T0 - 60_000).toISOString() })])
    await h.source.run()
    expect(getRoomSignal().insideEventId).toBe('e1')
    h.loseFix()
    h.advance(REFETCH_AGE_MS + 1000)
    await h.source.run()
    expect(h.fetchNearest).toHaveBeenCalledTimes(2)
    expect(h.fetchNearest.mock.calls[1][0]).toMatchObject({ latitude: VENUE.latitude + 0.0018, longitude: VENUE.longitude })
    // The server's `distance` was measured from that place, so the judgement stands.
    expect(getRoomSignal().insideEventId).toBe('e1')
  })

  it('with no fix ever, the nearest read is not made at all (there is nowhere to measure from)', async () => {
    const h = harness([event()])
    h.loseFix()
    await h.source.run()
    expect(h.fetchNearest).not.toHaveBeenCalled()
    expect(h.fetchMine).toHaveBeenCalledTimes(1)
  })
})

describe('a forced run forces (M1)', () => {
  it('passes force to the read', async () => {
    const h = harness([event()])
    await h.source.run(true)
    expect(h.fetchNearest.mock.calls[0][1]).toBe(true)
    await h.source.run()
    h.advance(REFETCH_AGE_MS)
    await h.source.run()
    expect(h.fetchNearest.mock.calls.at(-1)![1]).toBe(false)
  })

  it('a forced run asked for during a read earns exactly one forced follow-up', async () => {
    const h = harness([event()])
    let release!: () => void
    h.fetchNearest.mockImplementationOnce(() => new Promise((r) => (release = () => r([event()]))))
    const first = h.source.run()
    await new Promise((r) => setImmediate(r))
    void h.source.run(true)
    void h.source.run(true)
    release()
    await first
    await new Promise((r) => setImmediate(r))
    expect(h.fetchNearest).toHaveBeenCalledTimes(2)
    expect(h.fetchNearest.mock.calls[1][1]).toBe(true)
  })
})

it('publishes nothing once disposed (sign-out) (M3)', async () => {
  const h = harness([event()])
  await h.source.run()
  h.publish.mockClear()
  h.source.dispose()
  await h.source.run(true)
  expect(h.publish).not.toHaveBeenCalled()
})

describe('what is yours does not depend on the nearest page (M4)', () => {
  const tonight = { start_time: new Date(T0 + 3600_000).toISOString(), end_time: new Date(T0 + 2 * 3600_000).toISOString() }

  it('a going event far from you lights “today” though it is not among the nearest', async () => {
    const h = harness([], [{ id: 'far', ...tonight, rsvp_status: 'going', is_favorited: false }])
    await h.source.run()
    expect(getRoomSignal().todayEventIds).toEqual(['far'])
  })

  it('a yours-only row can never be judged as the fence you are in (no coordinates, no default 100 m)', () => {
    const merged = mergeSignalEvents([], [{ id: 'far', ...tonight, ...VENUE, rsvp_status: 'going' }])
    expect(merged[0]).toMatchObject({ id: 'far', latitude: null, longitude: null })
  })

  it('an event on both sides keeps its fence and gains your flags', () => {
    const merged = mergeSignalEvents([event({ id: 'a' })], [{ id: 'a', start_time: 'x', rsvp_status: 'going', is_favorited: true }])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ id: 'a', check_in_radius: 260, rsvp_status: 'going', is_favorited: true })
  })
})

it('only the source publishes the signal, and nothing re-judges on a socket herd (M2)', () => {
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
  const src = fs.readFileSync(path.join(__dirname, '../lib/useRoomSignalSource.ts'), 'utf8')
  expect(src).not.toMatch(/subscribeDirtyDomains/)
})

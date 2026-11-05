import { NO_FILTERS } from '../lib/eventFilters'
import { groupByWhen, reachLabel, RIDE_KM, seeAllFilters, walkMinutes, WALK_MAX_MIN } from '../lib/nearby'

/**
 * Flow 3b · Nearby, N1 (owner pick 2026-11-03, SCRUM-1022): "Near me" is a Pulse chip; the list groups by when, in plain
 * words (never "Soonest"); reach is a walk in minutes up to 25, then km, never over 100; every "See all" is a chip.
 */

const BLR = 'Asia/Kolkata'
// Tue 4 Nov 2026, 7:40 PM in Bengaluru.
const NOW = Date.parse('2026-11-04T14:10:00Z')
const at = (iso: string, extra: object = {}) => ({ id: iso, start_time: iso, end_time: null, timezone: BLR, ...extra })

describe('reach', () => {
  it('a walk in minutes (straight line × 1.3 at 4.8 km/h, rounded up) up to 25 minutes', () => {
    expect(walkMinutes(0.6)).toBe(10)
    expect(reachLabel(0.6)).toEqual({ kind: 'walk', text: '10 min walk' })
    expect(walkMinutes(1.5)).toBeLessThanOrEqual(WALK_MAX_MIN)
  })
  it('past a 25-minute walk, the distance; never over 100 km; nothing without one', () => {
    expect(reachLabel(2.9)).toEqual({ kind: 'distance', text: '2.9 km' })
    expect(reachLabel(14)).toEqual({ kind: 'distance', text: '14 km' })
    expect(reachLabel(13293)).toBeNull()
    expect(reachLabel(null)).toBeNull()
  })
  it('a short ride is 8 km', () => expect(RIDE_KM).toBe(8))
})

describe('groupByWhen', () => {
  const events = [
    at('2026-11-04T13:30:00Z', { end_time: '2026-11-04T17:30:00Z' }), // 7 PM, on now
    at('2026-11-04T15:00:00Z'), // 8:30 PM: starting soon
    at('2026-11-04T17:30:00Z'), // 11 PM: later tonight
    at('2026-11-04T21:00:00Z'), // 2:30 AM Wed: still tonight (until 4 AM)
    at('2026-11-05T13:30:00Z'), // Thu 7 PM: tomorrow
    at('2026-11-06T13:30:00Z'), // Fri: its name
    at('2026-11-08T05:30:00Z'), // Sun 11 AM: this weekend
    at('2026-11-11T13:30:00Z'), // next Wed: next week
  ]
  const groups = groupByWhen(events, NOW, BLR)

  it('in plain words and in order: Happening now, Starting soon, Later tonight, Tomorrow, the day, This weekend, Next week', () => {
    expect(groups.map((g) => g.title)).toEqual(['Happening now', 'Starting soon', 'Later tonight', 'Tomorrow', 'Friday', 'This weekend', 'Next week'])
    expect(groups.map((g) => g.events.length)).toEqual([1, 1, 2, 1, 1, 1, 1])
    expect(JSON.stringify(groups)).not.toMatch(/Soonest/)
  })

  it('Starting soon says until when, in the city’s clock: 90 minutes from now', () => {
    expect(groups.find((g) => g.key === 'soon')?.note).toBe('by 9:10 PM')
  })

  it('a group that is empty is not drawn', () => {
    expect(groupByWhen([at('2026-11-05T13:30:00Z')], NOW, BLR).map((g) => g.key)).toEqual(['tomorrow'])
  })
})

describe('every "See all" is a chip', () => {
  it('Happening now and Tonight open Tonight; Nearby opens Near me; For you its interest; This weekend itself', () => {
    expect(seeAllFilters('live')).toEqual({ ...NO_FILTERS, when: 'today' })
    expect(seeAllFilters('tonight')).toEqual({ ...NO_FILTERS, when: 'today' })
    expect(seeAllFilters('nearby')).toEqual({ ...NO_FILTERS, radiusKm: RIDE_KM })
    expect(seeAllFilters('forYou', { categorySlug: 'music' })).toEqual({ ...NO_FILTERS, categorySlug: 'music' })
    expect(seeAllFilters('weekend')).toEqual({ ...NO_FILTERS, when: 'weekend' })
  })
})

describe('the Nearby screen is gone; its links land on the Pulse with the chip (N1)', () => {
  const { nativeIntentPath } = jest.requireActual('../lib/shareLinks') as typeof import('../lib/shareLinks')
  it('each See-all link keeps its question', () => {
    expect(nativeIntentPath('/nearby-events?filter=tonight')).toBe('/events?seeAll=tonight')
    expect(nativeIntentPath('/nearby-events?filter=live')).toBe('/events?seeAll=live')
    expect(nativeIntentPath('/nearby-events?filter=forYou&categorySlug=music')).toBe('/events?seeAll=forYou&categorySlug=music')
    expect(nativeIntentPath('blendn://nearby-events')).toBe('/events?seeAll=nearby')
  })
  it('nothing else rides along: an unknown filter is Near me, a bad slug is dropped', () => {
    expect(nativeIntentPath('/nearby-events?filter=drop%20table')).toBe('/events?seeAll=nearby')
    expect(nativeIntentPath('/nearby-events?filter=forYou&categorySlug=<script>')).toBe('/events?seeAll=forYou')
  })
})

describe('the reach on the map (N1: a lit 20-minute walk, a short-ride ring, dark beyond)', () => {
  const { reachShapes, withinReach, WALK_DISC_KM } = jest.requireActual('../lib/homeMap') as typeof import('../lib/homeMap')
  const centre = { latitude: 12.9716, longitude: 77.5946 }
  it('the walk disc is a 20-minute walk; the ring a short ride', () => {
    expect(WALK_DISC_KM).toBeCloseTo((20 / 60) * 4.8 / 1.3, 3)
    const { walk, ride, mask } = reachShapes(centre)
    // A closed ring around the centre, each point at its radius.
    const [lng, lat] = walk.geometry.coordinates[0][0]
    const km = Math.hypot((lng - centre.longitude) * 111.32 * Math.cos((centre.latitude * Math.PI) / 180), (lat - centre.latitude) * 110.57)
    expect(km).toBeCloseTo(WALK_DISC_KM, 1)
    expect(ride.geometry.coordinates[0].length).toBeGreaterThan(32)
    // The dark is the world with the ride circle cut out.
    expect(mask.geometry.coordinates).toHaveLength(2)
  })
  it('only what is inside the ring lights', () => {
    const pin = (id: string, latitude: number) => ({ id, latitude, longitude: centre.longitude }) as never
    const near = pin('near', centre.latitude + 0.02) // ~2.2 km
    const far = pin('far', centre.latitude + 0.2) // ~22 km
    expect(withinReach([near, far], centre).map((p: { id: string }) => p.id)).toEqual(['near'])
  })
})

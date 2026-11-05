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

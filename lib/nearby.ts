/**
 * Flow 3b · Nearby, N1 (owner pick 2026-11-03, SCRUM-1022), as plain data: "Near me" is a Pulse chip, not a screen.
 * The list groups by when in plain words (never "Soonest"), reach is said honestly (a walk in minutes, then km, never
 * over 100 km, no ride minutes), and every "See all" lands on the chip that answers it.
 */

import { NO_FILTERS, type EventFilters } from './eventFilters'
import { liveWindow, type SessionSource } from './eventSession'
import { isLiveNow, nextDayReset } from './pulseSections'
import { calendarDaysBetween, clockTime, weekdayIn, WEEKDAYS_LONG } from './time'

/** A walk this long is still "near" (board `WALK_MAX`). */
export const WALK_MAX_MIN = 25
/** "Near me" reaches this far: a short ride (board `RIDE_KM`; the query's `radius`). */
export const RIDE_KM = 8
/** No reach is said past this: a phone abroad is not "13,293 km" from a Bengaluru night (SCRUM-1000). */
const MAX_REACH_KM = 100
/** Streets are not straight: a straight line × 1.3 at a walking 4.8 km/h. */
const STREET_FACTOR = 1.3
const WALK_KMH = 4.8
/** "Starting soon": the next 90 minutes. */
const SOON_MIN = 90
/** "Later tonight" runs until 4 AM, the city's own. */
const NIGHT_ENDS_HOUR = 4

export const walkMinutes = (km: number): number => Math.ceil(((km * STREET_FACTOR) / WALK_KMH) * 60)

export type Reach = { kind: 'walk' | 'distance'; text: string }

/** "10 min walk" up to 25 minutes, then "2.9 km"; nothing over 100 km or without a distance. */
export function reachLabel(km: number | null | undefined): Reach | null {
  if (km == null || !Number.isFinite(km) || km > MAX_REACH_KM) return null
  const walk = walkMinutes(km)
  if (walk <= WALK_MAX_MIN) return { kind: 'walk', text: `${walk} min walk` }
  return { kind: 'distance', text: `${km < 10 ? km.toFixed(1) : Math.round(km)} km` }
}

export type WhenKey = 'now' | 'soon' | 'tonight' | 'tomorrow' | 'day' | 'weekend' | 'nextWeek' | 'later'
export type WhenGroup<E> = { key: string; title: string; note?: string; events: E[] }

const ORDER: WhenKey[] = ['now', 'soon', 'tonight', 'tomorrow', 'day', 'weekend', 'nextWeek', 'later']
const TITLE: Record<Exclude<WhenKey, 'day'>, string> = {
  now: 'Happening now',
  soon: 'Starting soon',
  tonight: 'Later tonight',
  tomorrow: 'Tomorrow',
  weekend: 'This weekend',
  nextWeek: 'Next week',
  later: 'Later',
}
const MIN = 60_000

type WhenEvent = SessionSource & { timezone?: string | null }

/** Which group an event is in, as `timeZone` (the browsed city's) has it; a day group carries its weekday. */
function whenOf(e: WhenEvent, now: number, timeZone?: string): { key: WhenKey; weekday?: number } {
  if (isLiveNow(e, now)) return { key: 'now' }
  const start = Date.parse(liveWindow(e).start_time)
  if (start <= now + SOON_MIN * MIN) return { key: 'soon' }
  if (start < nextDayReset(now, NIGHT_ENDS_HOUR, timeZone)) return { key: 'tonight' }
  const days = calendarDaysBetween(new Date(now), new Date(start), timeZone)
  if (days <= 1) return { key: 'tomorrow' }
  const weekday = weekdayIn(new Date(start), timeZone)
  if (days <= 6) return weekday === 0 || weekday === 6 ? { key: 'weekend' } : { key: 'day', weekday }
  return days <= 13 ? { key: 'nextWeek' } : { key: 'later' }
}

/**
 * The list under a chip, grouped by when: Happening now, Starting soon ("by 9:10 PM"), Later tonight (until 4 AM),
 * Tomorrow, the day's name, This weekend, Next week, Later. Empty groups are not drawn; each keeps start order.
 */
export function groupByWhen<E extends WhenEvent>(events: readonly E[], now: number, timeZone?: string): WhenGroup<E>[] {
  const groups = new Map<string, WhenGroup<E> & { rank: number }>()
  for (const e of events) {
    const w = whenOf(e, now, timeZone)
    const id = w.key === 'day' ? `day-${w.weekday}` : w.key
    const days = w.key === 'day' ? calendarDaysBetween(new Date(now), new Date(Date.parse(liveWindow(e).start_time)), timeZone) : 0
    if (!groups.has(id)) {
      groups.set(id, {
        key: id,
        title: w.key === 'day' ? WEEKDAYS_LONG[w.weekday!] : TITLE[w.key as Exclude<WhenKey, 'day'>],
        ...(w.key === 'soon' ? { note: `by ${clockTime(now + SOON_MIN * MIN, timeZone)}` } : {}),
        events: [],
        rank: ORDER.indexOf(w.key) * 10 + days,
      })
    }
    groups.get(id)!.events.push(e)
  }
  const startOf = (e: E) => Date.parse(liveWindow(e).start_time)
  return [...groups.values()]
    .sort((a, b) => a.rank - b.rank)
    .map(({ rank: _rank, ...g }) => ({ ...g, events: [...g.events].sort((a, b) => startOf(a) - startOf(b)) }))
}

export type SeeAllKind = 'live' | 'tonight' | 'nearby' | 'forYou' | 'weekend'

/** The chip a "See all" lands on (Pulse, N1): its section's question, asked of the same list. */
export function seeAllFilters(kind: SeeAllKind, extra: { categorySlug?: string } = {}): EventFilters {
  switch (kind) {
    case 'live':
    case 'tonight':
      return { ...NO_FILTERS, when: 'today' }
    case 'nearby':
      return { ...NO_FILTERS, radiusKm: RIDE_KM }
    case 'forYou':
      return { ...NO_FILTERS, categorySlug: extra.categorySlug }
    case 'weekend':
      return { ...NO_FILTERS, when: 'weekend' }
  }
}

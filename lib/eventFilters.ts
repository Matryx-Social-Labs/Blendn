/**
 * What the person asked the feed for, and how it reaches the server.
 *
 * ## Every one of these already exists as a query parameter
 *
 * `GET /events` accepts `categorySlug`, `startDate`, `endDate` and `radius`
 * today. So this is not a new capability, it is a way to *say* what the API has
 * always been able to answer — which is why it is a lib rather than a screen:
 * the translation from "this weekend" to a pair of ISO timestamps is the only
 * part with a wrong answer, and the only part worth testing.
 *
 * ## `radius` is the one that bites
 *
 * It has **no default on the server, deliberately** — a 10km box silently
 * applied to anyone who sent coordinates is what blanked the events feed once
 * already. So it is only ever sent when the person actually picks a distance,
 * and picking "Any distance" removes it rather than setting it large.
 */

export const WHEN_OPTIONS = ['any', 'today', 'weekend', 'week'] as const
export type When = (typeof WHEN_OPTIONS)[number]

export const WHEN_LABELS: Record<When, string> = {
  any: 'Any time',
  today: 'Today',
  weekend: 'This weekend',
  week: 'This week',
}

/** Kilometres. `undefined` means the caller did not ask for a bound. */
export const DISTANCE_OPTIONS = [2, 5, 10, 25] as const

export interface EventFilters {
  /** A slug from the server's taxonomy — a parent sweeps its children. */
  categorySlug?: string
  when: When
  radiusKm?: number
}

export const NO_FILTERS: EventFilters = { when: 'any' }

/**
 * How many choices the person has made, for the badge on the control.
 *
 * A filter you cannot see is a filter you forget you set, and then the app looks
 * broken — half the catalogue missing with nothing on screen explaining why.
 * The count is what makes the control say "something is on" from across the
 * screen.
 */
export function activeFilterCount(f: EventFilters): number {
  let n = 0
  if (f.categorySlug) n += 1
  if (f.when !== 'any') n += 1
  if (typeof f.radiusKm === 'number') n += 1
  return n
}

export function hasActiveFilters(f: EventFilters): boolean {
  return activeFilterCount(f) > 0
}

const DAY_MS = 24 * 60 * 60 * 1000

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
const endOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)

/**
 * "This weekend" and friends, as an actual pair of instants.
 *
 * ## Local days, not UTC ones
 *
 * Built from `getFullYear`/`getMonth`/`getDate`, so a day boundary is the one
 * the person is standing in. Using UTC would put "Today" in Bengaluru at
 * 05:30 local, and every late-night event — which is most of them here — would
 * land in the wrong bucket. Nightlife is exactly the category where this is
 * least forgivable.
 *
 * ## The weekend you mean depends on the day you ask
 *
 * Asked on a Wednesday it is the coming Saturday and Sunday. Asked **on** a
 * Saturday it is today and tomorrow, not next week — somebody looking for
 * something to do tonight is not asking about eight days' time. Asked on a
 * Sunday it is the rest of today.
 *
 * `start` is never earlier than `now`: an event that finished this morning is
 * not something you can go to, and the feed already excludes ended events.
 */
export function whenToRange(
  when: When,
  now: Date = new Date()
): { startDate?: string; endDate?: string } {
  if (when === 'any') return {}

  if (when === 'today') {
    return { startDate: now.toISOString(), endDate: endOfDay(now).toISOString() }
  }

  if (when === 'week') {
    return {
      startDate: now.toISOString(),
      endDate: endOfDay(new Date(now.getTime() + 6 * DAY_MS)).toISOString(),
    }
  }

  // Weekend. 0 = Sunday, 6 = Saturday.
  const day = now.getDay()
  if (day === 0) {
    return { startDate: now.toISOString(), endDate: endOfDay(now).toISOString() }
  }
  if (day === 6) {
    return {
      startDate: now.toISOString(),
      endDate: endOfDay(new Date(now.getTime() + DAY_MS)).toISOString(),
    }
  }
  const daysUntilSaturday = 6 - day
  const saturday = startOfDay(new Date(now.getTime() + daysUntilSaturday * DAY_MS))
  const sunday = endOfDay(new Date(saturday.getTime() + DAY_MS))
  return { startDate: saturday.toISOString(), endDate: sunday.toISOString() }
}

/**
 * The query the feed should send.
 *
 * Absent keys rather than empty ones: the server distinguishes "not sent" from
 * "sent empty" on `radius`, and a `categorySlug=` would be a filter matching
 * nothing rather than no filter at all.
 */
export function filtersToQuery(
  f: EventFilters,
  now: Date = new Date()
): Record<string, string | number> {
  const q: Record<string, string | number> = {}
  if (f.categorySlug) q.categorySlug = f.categorySlug

  const { startDate, endDate } = whenToRange(f.when, now)
  if (startDate) q.startDate = startDate
  if (endDate) q.endDate = endDate

  // Only when asked for. See the note at the top of this file.
  if (typeof f.radiusKm === 'number') q.radius = f.radiusKm

  return q
}

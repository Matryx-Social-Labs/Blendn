/**
 * What each label on a Pulse card says.
 *
 * The card components hold no date or fallback logic — they take strings. This
 * is where the decisions live, because every one of them is a rule somebody can
 * disagree with, and a rule inside a `<Text>` is a rule nobody can test.
 */

import { liveWindow, type SessionSource } from './eventSession'
import { isLiveNow, printable } from './pulseSections'
import { distanceText } from './placesPane'
import { clockTime } from './roomMoments'
import { calendarDate, calendarDaysBetween, dayKeyIn, hourIn, weekdayIn, WEEKDAYS, WEEKDAYS_LONG } from './time'

/**
 * The heading over one day of the Upcoming list: "Today" / "Thursday".
 *
 * The list is grouped by day, the way a calendar is, so a card only needs its
 * time — the date is said once, above the group, instead of down every card.
 * `title` is what somebody scans for; `weekday` is the quieter line beside it.
 * "Today" and "Tomorrow" take the place of a date for the same reason
 * `featuredDateLabel` uses them: "24 Oct" makes the reader do the arithmetic.
 *
 * The year appears only when it is not this one.
 */
export function dayGroupLabel(
  startTime: string,
  now: Date = new Date(),
  timeZone?: string
): { title: string; weekday: string } | null {
  const d = new Date(startTime)
  if (Number.isNaN(d.getTime())) return null

  const weekday = WEEKDAYS_LONG[weekdayIn(d, timeZone)]
  const days = calendarDaysBetween(now, d, timeZone)
  if (days === 0) return { title: 'Today', weekday }
  if (days === 1) return { title: 'Tomorrow', weekday }
  return { title: calendarDate(d, { now, timeZone }), weekday }
}

/**
 * Events grouped by their local calendar day, each in its own zone, the days in calendar order.
 *
 * The caller's order is kept within a day (every caller's list is sorted by start time, soonest first). By key, not
 * by adjacency: in a list of mixed zones a start-time order can put Fri 24 (London) between two Sat 25s (IST), and
 * adjacency drew "Sat 25" twice (review). An event whose start time cannot be read is left out rather than filed
 * under a made-up day.
 */
export function groupByDay<T extends { start_time: string; timezone?: string | null }>(
  items: T[],
  now: Date = new Date()
): { key: string; title: string; weekday: string; items: T[] }[] {
  const groups: { key: string; title: string; weekday: string; items: T[] }[] = []
  const byKey = new Map<string, { key: string; title: string; weekday: string; items: T[] }>()
  for (const item of items) {
    const d = new Date(item.start_time)
    // Each event's day is its own zone's (RC drive 5 D-4).
    const zone = item.timezone ?? undefined
    const label = dayGroupLabel(item.start_time, now, zone)
    if (!label) continue
    const key = dayKeyIn(d, zone)
    const group = byKey.get(key)
    if (group) group.items.push(item)
    else {
      const next = { key, ...label, items: [item] }
      byKey.set(key, next)
      groups.push(next)
    }
  }
  // Days in calendar order (a stable sort: one zone's list is already in it).
  const dayOf = (key: string) => {
    const [y, m, day] = key.split('-').map(Number)
    return Date.UTC(y, m, day)
  }
  return groups.sort((a, b) => dayOf(a.key) - dayOf(b.key))
}

/**
 * The time on an upcoming card: "7 PM", "7:30 PM" — the app's one clock (`clockTime`, r7 M7), never the phone's locale.
 *
 * In the event's own zone when it is given, as the Scene's day line says it: a Berlin phone read an IST hackathon's 9 AM
 * doors as 4:30 AM (RC drive 5 D-4). The phone's zone only for a time with no event zone.
 */
export const timeLabel = (startTime: string, timeZone?: string | null): string => clockTime(startTime, timeZone ?? undefined)

/**
 * The date on a featured card.
 *
 * "Today" and "Tomorrow" rather than a date, because a featured card is a thing
 * you might act on now and "24 Oct" makes the reader do the arithmetic. Beyond
 * that it is the plain short date — "in 3 days" stops being useful somewhere
 * around two and starts being vague.
 */
export function featuredDateLabel(startTime: string, now: Date = new Date(), timeZone?: string | null): string {
  return dayGroupLabel(startTime, now, timeZone ?? undefined)?.title ?? ''
}

/** What `nextUpLabel` says while the event is on — the Going hero draws a live dot beside it. */
export const HAPPENING_NOW = 'Happening now'

/**
 * The eyebrow on the Going tab's "next up" card: when to be there.
 *
 * - "Happening now" — started and not yet over.
 * - "Tonight · 6:30 PM" — later today, from 5pm.
 * - "Today · 10:00 AM" / "Tomorrow · 6:30 PM".
 * - "Sat 4 Oct · 6:30 PM" beyond that, with the year only when it is not this
 *   one.
 *
 * "Tonight" is a separate word from "Today" because it is the one people plan
 * around; a 10am start is not tonight, and calling it so gets somebody there
 * nine hours late. Calendar days, not elapsed hours, as in `featuredDateLabel`.
 */
export function nextUpLabel(
  startTime: string,
  endTime: string | null | undefined,
  now: Date = new Date(),
  timeZone?: string | null
): string {
  const zone = timeZone ?? undefined
  const start = new Date(startTime)
  if (Number.isNaN(start.getTime())) return ''
  const end = endTime ? new Date(endTime).getTime() : NaN
  if (start.getTime() <= now.getTime() && Number.isFinite(end) && now.getTime() < end) {
    return HAPPENING_NOW
  }

  const time = timeLabel(startTime, zone)
  const days = calendarDaysBetween(now, start, zone)
  if (days === 0) return `${hourIn(start, zone) >= 17 ? 'Tonight' : 'Today'} · ${time}`
  if (days === 1) return `Tomorrow · ${time}`

  return `${calendarDate(start, { weekday: true, now, timeZone: zone })} · ${time}`
}

/**
 * Where the card says it is.
 *
 * Venue first, city as the fallback, and **nothing at all** when neither is
 * known. The old featured card printed "Venue to be announced", which is a
 * claim: it says the organiser has not chosen one yet, when what actually
 * happened is that this response did not carry the field. Saying nothing is the
 * only honest option for an absent value.
 *
 * "at The Humming Tree" when the server names the venue the event is linked to
 * (`venue`, null when the venue disputed the link): while the event has the
 * place, Places leaves the venue out, and the card is where it is still named.
 */
export function placeLabel(event: {
  venue?: { name: string } | null
  venue_name?: string | null
  city?: string | null
}): string | null {
  const linked = event.venue?.name?.trim()
  if (linked) return `at ${linked}`
  const venue = event.venue_name?.trim()
  if (venue) return venue
  const city = event.city?.trim()
  return city || null
}

/**
 * The time on a home card, in the one date grammar: "Live", "9 PM" (later
 * today), "Sat · 10:30 PM" (this week), "Sat 24 Oct · 9 PM" (further out).
 * Local time: the question is when to leave the house.
 */
export function cardTime(event: SessionSource & { timezone?: string | null }, now: number): string {
  if (isLiveNow(event, now)) return 'Live'
  const start = new Date(liveWindow(event).start_time)
  if (Number.isNaN(start.getTime())) return ''
  // The event's own zone (RC drive 5 D-4).
  const zone = event.timezone ?? undefined
  const clock = clockTime(start.getTime(), zone)
  const days = calendarDaysBetween(new Date(now), start, zone)
  if (days <= 0) return clock
  if (days < 7) return `${WEEKDAYS[weekdayIn(start, zone)]} · ${clock}`
  // No year, even across New Year: a card's time is one line in a fixed slot, and the weekday already says which (review L6).
  return `${calendarDate(start, { weekday: true, year: false, timeZone: zone })} · ${clock}`
}

/** A count a card may print: five and up (`printable`); a small number of people is not said. */
const count = printable

/**
 * The card's people line (the design's EventCard pill): "{n} here now" while
 * it is on and people are inside (`here_count`, the Room's rule: checked in
 * and not left), otherwise "{n} going" (RSVPs), or `null`. Never the check-in
 * count (`current_capacity`, everybody who came): it read "1 joined" on an
 * event 19 were going to, and "14 here now" with 12 inside.
 *
 * Under five is `null` on purpose (`LIVE_FLOOR`). "0 going" reads as a verdict
 * on the event, "3 going" names whoever they are, and every event is small for a
 * while. No line reads as "this has not started filling up", which is the true
 * statement.
 */
export function peopleLabel(
  event: { here_count?: number | null; going_count?: number | null },
  live: boolean
): string | null {
  const here = live ? count(event.here_count) : null
  if (here) return `${here} here now`
  const going = count(event.going_count)
  return going ? `${going} going` : null
}

/* -------------------------------------------------------------------------- */


/** What a compact home card draws from one event (the venue, the pills, the cover): pure, so each rule is tested. */
export function homeCardProps(
  event: {
    title: string
    venue?: { name: string } | null
    venue_name?: string | null
    city?: string | null
    distance?: number | null
    here_count?: number | null
    going_count?: number | null
    cover_image_url?: string | null
  } & SessionSource,
  now: number,
  withDistance: boolean
) {
  const live = isLiveNow(event, now)
  const here = live ? printable(event.here_count) : null
  const going = live ? null : printable(event.going_count)
  return {
    title: event.title,
    time: cardTime(event, now),
    venue: event.venue?.name?.trim() || event.venue_name?.trim() || event.city?.trim() || '',
    distance: withDistance ? (distanceText(event.distance) ?? undefined) : undefined,
    here: here ?? undefined,
    going: going ?? undefined,
    cover: event.cover_image_url ?? null,
  }
}

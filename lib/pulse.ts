/**
 * What each label on a Pulse card says.
 *
 * The card components hold no date or fallback logic — they take strings. This
 * is where the decisions live, because every one of them is a rule somebody can
 * disagree with, and a rule inside a `<Text>` is a rule nobody can test.
 */

/**
 * The heading over one day of the Upcoming list: "Today" / "Thursday".
 *
 * The list is grouped by day, the way a calendar is, so a card only needs its
 * time — the date is said once, above the group, instead of down every card.
 * `title` is what somebody scans for; `weekday` is the quieter line beside it.
 * "Today" and "Tomorrow" take the place of a date for the same reason
 * `featuredDateLabel` uses them: "Oct 24" makes the reader do the arithmetic.
 *
 * The year appears only when it is not this one.
 */
export function dayGroupLabel(
  startTime: string,
  now: Date = new Date()
): { title: string; weekday: string } | null {
  const d = new Date(startTime)
  if (Number.isNaN(d.getTime())) return null

  const weekday = longWeekday(d)
  const days = calendarDaysBetween(now, d)
  if (days === 0) return { title: 'Today', weekday }
  if (days === 1) return { title: 'Tomorrow', weekday }
  if (d.getFullYear() !== now.getFullYear()) {
    return { title: `${shortMonth(d)} ${d.getDate()}, ${d.getFullYear()}`, weekday }
  }
  return { title: `${shortMonth(d)} ${d.getDate()}`, weekday }
}

/**
 * Events split into runs of the same local calendar day, in the order given.
 *
 * The caller's order is kept (the list is already sorted by start time), so
 * this only draws the lines between days — it never reorders. An event whose
 * start time cannot be read is left out rather than filed under a made-up day.
 */
export function groupByDay<T extends { start_time: string }>(
  items: T[],
  now: Date = new Date()
): { key: string; title: string; weekday: string; items: T[] }[] {
  const groups: { key: string; title: string; weekday: string; items: T[] }[] = []
  for (const item of items) {
    const d = new Date(item.start_time)
    const label = dayGroupLabel(item.start_time, now)
    if (!label) continue
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(item)
    else groups.push({ key, ...label, items: [item] })
  }
  return groups
}

/**
 * The time on an upcoming card: "7:00 PM", in the phone's own format.
 *
 * Local time, like the day headings — the question is when to leave the house.
 */
export function timeLabel(startTime: string): string {
  const d = new Date(startTime)
  if (Number.isNaN(d.getTime())) return ''
  try {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  } catch {
    // No ICU (see `shortMonth`).
    const h = d.getHours() % 12 || 12
    return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`
  }
}

/**
 * The date on a featured card.
 *
 * "Today" and "Tomorrow" rather than a date, because a featured card is a thing
 * you might act on now and "Oct 24" makes the reader do the arithmetic. Beyond
 * that it is the plain short date — "in 3 days" stops being useful somewhere
 * around two and starts being vague.
 */
export function featuredDateLabel(startTime: string, now: Date = new Date()): string {
  const d = new Date(startTime)
  if (Number.isNaN(d.getTime())) return ''

  const days = calendarDaysBetween(now, d)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'

  if (d.getFullYear() !== now.getFullYear()) {
    return `${shortMonth(d)} ${d.getDate()}, ${d.getFullYear()}`
  }
  return `${shortMonth(d)} ${d.getDate()}`
}

/** What `nextUpLabel` says while the event is on — the Going hero draws a live dot beside it. */
export const HAPPENING_NOW = 'Happening now'

/**
 * The eyebrow on the Going tab's "next up" card: when to be there.
 *
 * - "Happening now" — started and not yet over.
 * - "Tonight · 6:30 PM" — later today, from 5pm.
 * - "Today · 10:00 AM" / "Tomorrow · 6:30 PM".
 * - "Sat, Oct 4 · 6:30 PM" beyond that, with the year only when it is not this
 *   one.
 *
 * "Tonight" is a separate word from "Today" because it is the one people plan
 * around; a 10am start is not tonight, and calling it so gets somebody there
 * nine hours late. Calendar days, not elapsed hours, as in `featuredDateLabel`.
 */
export function nextUpLabel(
  startTime: string,
  endTime: string | null | undefined,
  now: Date = new Date()
): string {
  const start = new Date(startTime)
  if (Number.isNaN(start.getTime())) return ''
  const end = endTime ? new Date(endTime).getTime() : NaN
  if (start.getTime() <= now.getTime() && Number.isFinite(end) && now.getTime() < end) {
    return HAPPENING_NOW
  }

  const time = timeLabel(startTime)
  const days = calendarDaysBetween(now, start)
  if (days === 0) return `${start.getHours() >= 17 ? 'Tonight' : 'Today'} · ${time}`
  if (days === 1) return `Tomorrow · ${time}`

  const year = start.getFullYear() !== now.getFullYear() ? `, ${start.getFullYear()}` : ''
  return `${shortWeekday(start)}, ${shortMonth(start)} ${start.getDate()}${year} · ${time}`
}

/**
 * Where the card says it is.
 *
 * Venue first, city as the fallback, and **nothing at all** when neither is
 * known. The old featured card printed "Venue to be announced", which is a
 * claim: it says the organiser has not chosen one yet, when what actually
 * happened is that this response did not carry the field. Saying nothing is the
 * only honest option for an absent value.
 */
export function placeLabel(event: {
  venue_name?: string | null
  city?: string | null
}): string | null {
  const venue = event.venue_name?.trim()
  if (venue) return venue
  const city = event.city?.trim()
  return city || null
}

/**
 * How many people are going, or `null`.
 *
 * Zero is `null` on purpose. "0 joined" reads as a verdict on the event, and
 * every event is 0 for a while — including, always, the first one somebody sees
 * after we launch in their city. No line reads as "this has not started filling
 * up", which is the true statement.
 */
export function joinedCount(event: { current_capacity?: number | null }): number | null {
  const n = event.current_capacity
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 1) return null
  return Math.floor(n)
}

/* -------------------------------------------------------------------------- */

function shortMonth(d: Date): string {
  try {
    return d.toLocaleString(undefined, { month: 'short' })
  } catch {
    // `toLocaleString` with options throws on a JS engine built without ICU,
    // which is a real configuration on older Android RN builds rather than a
    // hypothetical. A three-letter month is recoverable without it.
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
      d.getMonth()
    ]
  }
}

function shortWeekday(d: Date): string {
  try {
    return d.toLocaleString(undefined, { weekday: 'short' })
  } catch {
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
  }
}

function longWeekday(d: Date): string {
  try {
    return d.toLocaleString(undefined, { weekday: 'long' })
  } catch {
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
      d.getDay()
    ]
  }
}

/**
 * Whole calendar days from `a` to `b`, ignoring the clock.
 *
 * Not `(b - a) / 86400000`. An event at 9am tomorrow is 15 hours away at 6pm
 * today, which that arithmetic calls 0 and therefore "Today" — on a screen
 * telling somebody where to be tonight.
 */
function calendarDaysBetween(a: Date, b: Date): number {
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate())
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((end.getTime() - start.getTime()) / 86_400_000)
}

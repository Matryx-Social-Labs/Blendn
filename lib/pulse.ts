/**
 * What each label on a Pulse card says.
 *
 * The card components hold no date or fallback logic — they take strings. This
 * is where the decisions live, because every one of them is a rule somebody can
 * disagree with, and a rule inside a `<Text>` is a rule nobody can test.
 */

/**
 * The short date opposite an upcoming card's title.
 *
 * The frame shows `28`, `30`, `Nov 2` down three consecutive cards, which is a
 * real rule and not three inconsistent labels: **the month is dropped while it
 * is the one you are already in**, and reappears the moment the list crosses
 * into the next. A column of "Oct 28 / Oct 30 / Nov 2" repeats a word the
 * heading already implies; a column of "28 / 30 / Nov 2" puts the emphasis on
 * the thing that changes.
 *
 * The year appears only when it is not this one, for the same reason.
 *
 * Compared in local time on purpose. Whether an event is "this month" is a
 * question about the calendar on the wall next to the person holding the phone,
 * not about the event's own timezone — an event abroad on the 1st should read
 * as next month to somebody whose month has not ended.
 */
export function upcomingDayLabel(startTime: string, now: Date = new Date()): string {
  const d = new Date(startTime)
  if (Number.isNaN(d.getTime())) return ''

  if (d.getFullYear() !== now.getFullYear()) {
    return `${shortMonth(d)} ${d.getDate()}, ${d.getFullYear()}`
  }
  if (d.getMonth() !== now.getMonth()) {
    return `${shortMonth(d)} ${d.getDate()}`
  }
  return String(d.getDate())
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

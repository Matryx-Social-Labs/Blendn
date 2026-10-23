/**
 * Fixed English short names, for labels that must not change shape with the
 * device's locale or ICU build ("Sept" in en-GB on one engine, "Sep" on another).
 */
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * A calendar date in the app's one grammar, as the clock has one (`clockTime`): "24 Oct", "Sat 24 Oct" with `weekday`, "Sat"
 * alone with `weekday: 'only'` (a day this week), and "24 Oct 2027" when it is not this year. Day first, fixed English names, no comma, no dot, whatever the phone's locale says: on
 * an en_DE iPhone `toLocaleDateString` wrote "until 23. Oct 2027" in Settings beside Manage's "23 Oct 2027" (RC drive 3).
 *
 * `year`: when it is not `now`'s year (the default), `false` never (a tile with no room for it), `true` always. Local day, or the
 * day in `timeZone` when one is named (an event's own zone). Empty for a date it can't read.
 */
export function calendarDate(
  time: string | number | Date | null | undefined,
  { weekday = false, year, now = Date.now(), timeZone }: { weekday?: boolean | 'only'; year?: boolean; now?: number | Date; timeZone?: string } = {}
): string {
  if (time === null || time === undefined || time === '') return ''
  const d = new Date(time)
  if (Number.isNaN(d.getTime())) return ''
  const [y, m, day] = timeZone ? zonedDate(d, timeZone) : [d.getFullYear(), d.getMonth(), d.getDate()]
  // The weekday of that calendar date, wherever it is: a UTC date has no zone to shift it.
  const dow = new Date(Date.UTC(y, m, day)).getUTCDay()
  if (weekday === 'only') return WEEKDAYS[dow]
  const showYear = year ?? y !== new Date(now).getFullYear()
  return `${weekday ? `${WEEKDAYS[dow]} ` : ''}${day} ${MONTHS[m]}${showYear ? ` ${y}` : ''}`
}

/**
 * The year, month (0–11) and day in a named zone; the phone's own date if this engine cannot (no ICU, an unknown zone).
 * By part, not by splitting a formatted string: no engine promises en-CA's "YYYY-MM-DD" (review L5).
 */
/**
 * One formatter per zone and use, built once: a Pulse of hundreds of rows asked for thousands per render (each
 * `groupByDay` row reads its date, weekday and day key), and building one is the costly part, on Hermes most of all.
 * The set of zones in a list is small, so the cache stays small.
 */
const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(key: 'date' | 'clock', timeZone: string): Intl.DateTimeFormat {
  const id = `${key}|${timeZone}`
  let f = formatters.get(id)
  if (!f) {
    f =
      key === 'date'
        ? new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' })
        : new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: 'numeric', hourCycle: 'h23', timeZone })
    formatters.set(id, f)
  }
  return f
}

export function zonedDate(d: Date, timeZone: string): [number, number, number] {
  try {
    const parts = formatter('date', timeZone).formatToParts(d)
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value)
    const [y, m, day] = [part('year'), part('month'), part('day')]
    if ([y, m, day].every(Number.isFinite)) return [y, m - 1, day]
  } catch {
    // Falls through to the local date.
  }
  return [d.getFullYear(), d.getMonth(), d.getDate()]
}

/**
 * A clock time in the design's one grammar (r7 M7): "9 PM" on the hour, "9:30 PM" otherwise. Every card, chat, pass and
 * line in the app says the time this way. Built by hand: the device locale said "05:00" on a 24-hour iPhone and "5:00 AM"
 * on Android, and `Intl` time formats vary by engine. Local time, or the clock in `timeZone` when one is named (the map's
 * event times, in the city's zone). Empty for a time it can't read.
 */
export function clockTime(time: string | number | Date, timeZone?: string): string {
  const d = new Date(time)
  if (Number.isNaN(d.getTime())) return ''
  const [h, m] = timeZone ? zonedClock(d, timeZone) : [d.getHours(), d.getMinutes()]
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`
}

/**
 * Whole calendar days from `a` to `b`, ignoring the clock, as the days fall in `timeZone` (an event's own zone, so a
 * Berlin phone and an IST event agree on "Tomorrow" with the event's own day line; RC drive 5 D-4).
 */
export function calendarDaysBetween(a: Date, b: Date, timeZone?: string): number {
  const [ay, am, ad] = dateIn(a, timeZone)
  const [by, bm, bd] = dateIn(b, timeZone)
  return Math.round((Date.UTC(by, bm, bd) - Date.UTC(ay, am, ad)) / 86_400_000)
}

/** The weekday (0 = Sunday) of `d` in `timeZone`, or the phone's. */
export function weekdayIn(d: Date, timeZone?: string): number {
  const [y, m, day] = dateIn(d, timeZone)
  return new Date(Date.UTC(y, m, day)).getUTCDay()
}

/** The hour (0–23) of `d` in `timeZone`, or the phone's. */
export function hourIn(d: Date, timeZone?: string): number {
  return clockIn(d, timeZone)[0]
}

/** The hour (0–23) and minute of `d` in `timeZone`, or the phone's. */
export function clockIn(d: Date, timeZone?: string): [number, number] {
  return timeZone ? zonedClock(d, timeZone) : [d.getHours(), d.getMinutes()]
}

/** The calendar date [year, month 0–11, day] of `d` in `timeZone`, or the phone's. */
export const dateIn = (d: Date, timeZone?: string): [number, number, number] => (timeZone ? zonedDate(d, timeZone) : [d.getFullYear(), d.getMonth(), d.getDate()])

/** A calendar key ("2026-9-24") of `d` in `timeZone`, or the phone's: what a day heading groups by. */
export function dayKeyIn(d: Date, timeZone?: string): string {
  return dateIn(d, timeZone).join('-')
}

/** The hour (0–23) and minute in a named zone; the phone's own clock if this engine cannot (no ICU). */
function zonedClock(d: Date, timeZone: string): [number, number] {
  try {
    const [h, m] = formatter('clock', timeZone)
      .format(d)
      .split(':')
      .map(Number)
    if (Number.isFinite(h) && Number.isFinite(m)) return [h, m]
  } catch {
    // Falls through to the local clock.
  }
  return [d.getHours(), d.getMinutes()]
}

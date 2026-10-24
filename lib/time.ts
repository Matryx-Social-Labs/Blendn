/**
 * Fixed English short names, for labels that must not change shape with the
 * device's locale or ICU build ("Sept" in en-GB on one engine, "Sep" on another).
 */
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/*
 * The phone's zone, as the OS says it, passed by name to every formatter that means "the phone's time". Never the
 * engine's default: Hermes reads the zone once and keeps it, so a running Android app said the old zone after a change
 * in Settings › Date & time until it was relaunched (RC 7: "6:30 PM IST" on a phone in IST, the Pulse's Tonight in Los
 * Angeles' day), and clearing our own formatters could not reach Hermes' cache. expo-localization's `getCalendars` asks
 * the OS each time; it is re-read on AppState active (`app/_layout.tsx`), since a zone is changed in Settings, which the
 * app comes back from.
 *
 * The native module as Expo installs it (`globalThis.expo.modules`, where `requireOptionalNativeModule` looks first), read
 * when asked: not expo-localization's entry, which throws at import on a binary built before it, so a bundle swapped into
 * an older build keeps the engine's zone (the behaviour before) instead of dying at launch; and no import of `expo`,
 * whose entry drags expo-asset and expo-constants into every module that tells the time.
 */
type Localization = { getCalendars(): { timeZone?: string | null }[] }
const localization = (): Localization | undefined =>
  (globalThis as { expo?: { modules?: { ExpoLocalization?: Localization } } }).expo?.modules?.ExpoLocalization

function deviceZone(): string {
  try {
    const zone = localization()?.getCalendars()[0]?.timeZone
    if (zone) return zone
  } catch {
    // The OS did not say: the engine's zone is all there is.
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
  } catch {
    return ''
  }
}
let phoneZone = deviceZone()
const phoneZoneListeners = new Set<() => void>()

/** The phone's IANA zone, or undefined when nothing can say it. */
export const phoneTimeZone = (): string | undefined => phoneZone || undefined

/** Minutes ahead of UTC on the phone at `d`. */
function phoneOffset(d: Date): number {
  return phoneZone ? offsetIn(d, phoneZone) : -d.getTimezoneOffset()
}

/** Re-reads the phone's zone; when it moved, tells the listeners and answers true. Formatters are keyed by zone, so none is stale. */
export function refreshPhoneZone(): boolean {
  const next = deviceZone()
  if (next === phoneZone) return false
  phoneZone = next
  phoneZoneListeners.forEach((listener) => listener())
  return true
}

/** Called after the phone's zone moved (`refreshPhoneZone`); returns the unsubscribe. */
export function subscribePhoneZone(listener: () => void): () => void {
  phoneZoneListeners.add(listener)
  return () => phoneZoneListeners.delete(listener)
}

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
  const [y, m, day] = dateIn(d, timeZone)
  // The weekday of that calendar date, wherever it is: a UTC date has no zone to shift it.
  const dow = new Date(Date.UTC(y, m, day)).getUTCDay()
  if (weekday === 'only') return WEEKDAYS[dow]
  const showYear = year ?? y !== dateIn(new Date(now), timeZone)[0]
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
  const [h, m] = clockIn(d, timeZone)
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

/**
 * The zones we serve, named the same on every engine (R6-1): Hermes on iOS calls Asia/Kolkata "GMT" in every locale, which
 * names a different time. Canada's are the generic names ("ET"), true either side of a clock change.
 */
const ZONE_ABBREVIATIONS: Readonly<Record<string, string>> = {
  'Asia/Kolkata': 'IST',
  'Asia/Calcutta': 'IST',
  'America/Toronto': 'ET',
  'America/Montreal': 'ET',
  'America/Winnipeg': 'CT',
  'America/Regina': 'CT',
  'America/Edmonton': 'MT',
  'America/Vancouver': 'PT',
  'America/Halifax': 'AT',
  'America/St_Johns': 'NT',
  UTC: 'UTC',
  'Etc/UTC': 'UTC',
}

/** Short zone names, one formatter per (locale, zone): "IST" is only en-IN's, "CEST" en-GB's, "PDT" en-US's. */
const ZONE_NAME_LOCALES = ['en-GB', 'en-IN', 'en-US'] as const
const zoneNameFormatters = new Map<string, Intl.DateTimeFormat>()
function zoneName(d: Date, timeZone: string): string {
  const known = ZONE_ABBREVIATIONS[timeZone]
  if (known) return known
  for (const locale of ZONE_NAME_LOCALES) {
    try {
      const id = `${locale}|${timeZone}`
      let f = zoneNameFormatters.get(id)
      if (!f) {
        f = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' })
        zoneNameFormatters.set(id, f)
      }
      const name = f.formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? ''
      // "GMT" and "GMT+5:30" are not names: the engine had none (Hermes iOS says "GMT" for IST). The offset says it instead.
      if (name && !/^(GMT|UTC)/.test(name)) return name
    } catch {
      break
    }
  }
  return offsetName(offsetIn(d, timeZone))
}

/** "GMT+5:30", "GMT-3", and "GMT" only at offset 0. */
function offsetName(minutes: number): string {
  if (minutes === 0) return 'GMT'
  const abs = Math.abs(minutes)
  const m = abs % 60
  return `GMT${minutes < 0 ? '-' : '+'}${Math.floor(abs / 60)}${m ? `:${String(m).padStart(2, '0')}` : ''}`
}

/** Minutes ahead of UTC at `d` in `timeZone`. */
function offsetIn(d: Date, timeZone: string): number {
  const [y, m, day] = zonedDate(d, timeZone)
  const [h, min] = zonedClock(d, timeZone)
  return Math.round((Date.UTC(y, m, day, h, min) - Math.floor(d.getTime() / 60_000) * 60_000) / 60_000)
}

/**
 * " IST": the event's zone after its time, when it is not the phone's (review LOW, after RC drive 5 D-4: a Berlin
 * phone reading an IST night's "9 AM" should know it is Bengaluru's 9 AM). Nothing when the phone keeps the same time
 * at that moment, or with no zone known.
 */
export function zoneSuffix(time: string | number | Date, timeZone?: string | null): string {
  if (!timeZone) return ''
  const d = new Date(time)
  if (Number.isNaN(d.getTime())) return ''
  if (offsetIn(d, timeZone) === phoneOffset(d)) return ''
  const name = zoneName(d, timeZone)
  return name ? ` ${name}` : ''
}

/** An event's clock in its own zone, named when it is not the phone's: "9 AM", or "9 AM IST" on a Berlin phone. */
export function eventClock(time: string | number | Date, timeZone?: string | null): string {
  const clock = clockTime(time, timeZone ?? undefined)
  return clock ? `${clock}${zoneSuffix(time, timeZone)}` : ''
}

/** The hour (0–23) of `d` in `timeZone`, or the phone's. */
export function hourIn(d: Date, timeZone?: string): number {
  return clockIn(d, timeZone)[0]
}

/** The hour (0–23) and minute of `d` in `timeZone`, or the phone's. */
export function clockIn(d: Date, timeZone?: string): [number, number] {
  const zone = timeZone || phoneZone
  return zone ? zonedClock(d, zone) : [d.getHours(), d.getMinutes()]
}

/** The calendar date [year, month 0–11, day] of `d` in `timeZone`, or the phone's. */
export function dateIn(d: Date, timeZone?: string): [number, number, number] {
  const zone = timeZone || phoneZone
  return zone ? zonedDate(d, zone) : [d.getFullYear(), d.getMonth(), d.getDate()]
}

/**
 * The instant a wall clock reads `y-m-day h:min` in `timeZone`, or the phone's: `new Date(y, m, day, h, min)` without
 * the engine's cached zone. Parts may overflow (`day + 1`, `day - 7`) as `Date.UTC` allows. Twice, for an hour a clock
 * change moved; a wall time a spring-forward skipped lands an hour on, as `new Date` does.
 */
export function instantIn(y: number, m: number, day: number, h = 0, min = 0, timeZone?: string): number {
  const zone = timeZone || phoneZone
  if (!zone) return new Date(y, m, day, h, min).getTime()
  const wall = Date.UTC(y, m, day, h, min)
  const first = wall - offsetIn(new Date(wall), zone) * 60_000
  return wall - offsetIn(new Date(first), zone) * 60_000
}

/** Midnight at the start of `d`'s day in `timeZone`, or the phone's. */
export function startOfDayIn(d: Date | number, timeZone?: string): number {
  const [y, m, day] = dateIn(new Date(d), timeZone)
  return instantIn(y, m, day, 0, 0, timeZone)
}

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

/**
 * The days of a run (Flow 3 · 3.2: "Day 2 of 3", the day strip), from `GET /events/:eventId` (blendn-admin `lib/occurrences.ts`
 * `eventDays`, #724): `dayCount` and `dayNumber` are the WHOLE run, while `days` is at most 31 of them, starting at `daysFrom`
 * (1-based; 1 for an ordinary event, later for a long run, which lists the stretch around today). Each day has its local `date`
 * (`YYYY-MM-DD`) and whether it was called off (`cancelled`, and `cancelledAt` beside it). `dayNumber` is null when every day is
 * cancelled. Absent from a server that does not send it: no strip, which is what the Scene drew before.
 */
export interface EventDay {
  date: string
  cancelled: boolean
}

export interface EventDays {
  /** The listed days: a window of the run, in order. */
  days: EventDay[]
  /** Which day of the run `days[0]` is, 1-based. */
  daysFrom: number
  /** How many days the whole run has, which can exceed `days.length`. */
  dayCount: number
  /** The day `session` is on, 1-based in the whole run; null when every day is cancelled. */
  dayNumber: number | null
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const DATE = /^\d{4}-\d{2}-\d{2}$/
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null)

/** The run's days when it has more than one (a one-day event has nothing to strip), else null. */
export function parseEventDays(d: { days?: unknown; dayCount?: unknown; dayNumber?: unknown; daysFrom?: unknown }): EventDays | null {
  if (!Array.isArray(d.days)) return null
  const days = d.days.flatMap((x): EventDay[] =>
    isRecord(x) && typeof x.date === 'string' && DATE.test(x.date)
      ? [{ date: x.date, cancelled: x.cancelled === true || typeof x.cancelledAt === 'string' }]
      : []
  )
  const dayCount = Math.max(int(d.dayCount) ?? days.length, days.length)
  if (dayCount < 2) return null
  // A window that would run past the end of the run is not one the server drew: the days then start at 1.
  const from = int(d.daysFrom)
  const daysFrom = from !== null && from >= 1 && from + days.length - 1 <= dayCount ? from : 1
  const n = int(d.dayNumber)
  return { days, daysFrom, dayCount, dayNumber: n !== null && n >= 1 && n <= dayCount ? n : null }
}

/**
 * The event's own calendar date for `now` (`YYYY-MM-DD`), in the event's time zone: "today" is where the night is, not where the
 * phone is. A zone this engine does not know falls back to the phone's date.
 */
export function eventToday(timeZone: string | undefined, now: number = Date.now()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now)
  } catch {
    const d = new Date(now)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
}

/** The listed day that `dayNumber` names, or null when that day is outside the window (or no day is running). */
export const sessionDay = (e: EventDays): EventDay | null => (e.dayNumber ? (e.days[e.dayNumber - e.daysFrom] ?? null) : null)

/** Whether the day the session is on is today, in the event's zone. */
export function sessionIsToday(e: EventDays, timeZone: string | undefined, now: number = Date.now()): boolean {
  return sessionDay(e)?.date === eventToday(timeZone, now)
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "Sat 27": the day's own calendar date read as UTC, so the phone's zone cannot move it a day. */
export function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`
}

/** "Day 2 of 3", or null when no day is running (every day cancelled). */
export const dayOfWords = (e: EventDays): string | null => (e.dayNumber ? `Day ${e.dayNumber} of ${e.dayCount}` : null)

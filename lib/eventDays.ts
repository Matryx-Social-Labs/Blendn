/**
 * The days of a run (Flow 3 · 3.2: "Day 2 of 3", the day strip), from `GET /events/:eventId` (blendn-admin `lib/occurrences.ts`
 * `eventDays`): `days` in order with the local `date` (`YYYY-MM-DD`) and whether a day was called off, `dayCount`, and
 * `dayNumber`, the 1-based place of `session`'s day (null when every day is cancelled). One entry for a one-day event.
 * Absent from a server that does not send it: no strip, which is what the Scene drew before.
 */
export interface EventDay {
  date: string
  cancelled: boolean
}

export interface EventDays {
  days: EventDay[]
  dayNumber: number | null
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** The run's days when it has more than one (a one-day event has nothing to strip), else null. */
export function parseEventDays(d: { days?: unknown; dayCount?: unknown; dayNumber?: unknown }): EventDays | null {
  if (!Array.isArray(d.days)) return null
  const days = d.days.flatMap((x): EventDay[] =>
    isRecord(x) && typeof x.date === 'string' && DATE.test(x.date) ? [{ date: x.date, cancelled: x.cancelled === true }] : []
  )
  if (days.length < 2) return null
  const n = d.dayNumber
  return { days, dayNumber: typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= days.length ? n : null }
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "Sat 27": the day's own calendar date read as UTC, so the phone's zone cannot move it a day. */
export function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`
}

/** "Day 2 of 3", or null when no day is running (every day cancelled). */
export const dayOfWords = (e: EventDays): string | null => (e.dayNumber ? `Day ${e.dayNumber} of ${e.days.length}` : null)

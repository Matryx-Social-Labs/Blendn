/**
 * The window an event is "live" in, as the server judges it.
 *
 * `start_time`/`end_time` are the whole run. On a three-day festival that is
 * three days straight — through the nights between days and through a
 * cancelled last day — so the app said LIVE, "Happening now" and offered
 * "Blend in" while the door, which goes by the day, refused (staging,
 * `blr-design-festival`, 2026-09-28 23:05 IST: day 2 over, day 3 cancelled).
 *
 * The server now sends `session`: the day running now, else the next day going
 * ahead, else the last day that went ahead — so it reads as ended — and `null`
 * when every day is cancelled (`lib/occurrences.ts` `eventSession` in
 * blendn-admin). The app reads that instead of working days out on the phone.
 * On a single-day event it is the event's own window.
 *
 * `undefined` means an older server that does not send it: the run is then the
 * only window there is, which is what the app did before.
 */

/** The server's `session`, snake-cased like the rest of the app's event. */
export interface EventSession {
  start_time: string
  end_time: string
}

export interface SessionSource {
  start_time: string
  end_time?: string | null
  session?: EventSession | null
}

/** `session` off the API (camelCase), keeping `undefined` and `null` apart. */
export function sessionFromApi(
  s: { startTime: string; endTime: string } | null | undefined
): EventSession | null | undefined {
  if (s === undefined) return undefined
  if (s === null) return null
  return { start_time: s.startTime, end_time: s.endTime }
}

/**
 * The start and end to judge "live", "starts in" and "ended" by.
 *
 * Every day cancelled (`null`) reads as ended at the run's start: there is
 * nothing to attend, and a zero-length window is ended by every clock check in
 * the app without a special case at each one.
 */
export function liveWindow(e: SessionSource): { start_time: string; end_time: string | null } {
  if (e.session === undefined) return { start_time: e.start_time, end_time: e.end_time ?? null }
  if (e.session === null) return { start_time: e.start_time, end_time: e.start_time }
  return e.session
}

/** Whether the window has ended — nothing left to go to today or later. */
export function sessionOver(e: SessionSource, now: number = Date.now()): boolean {
  const end = liveWindow(e).end_time
  const ms = end ? new Date(end).getTime() : NaN
  return Number.isFinite(ms) && ms <= now
}

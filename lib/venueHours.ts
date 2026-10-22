import { clockTime } from './roomMoments'

/**
 * One reading of "is it open", in the venue's own day, for every surface that says it: the venue page's Open tile and
 * the Places card's hours line. They each had their own, and each was wrong somewhere (SCRUM-743 review M1).
 *
 * The venue's day starts at its reset hour, not at midnight (`venues.day_reset_hour`). So the clock is measured from
 * that hour: with a reset of 06:00, 03:00 on Sunday is the end of Saturday's day, and a Saturday 18:00 to 02:00 night
 * that closed an hour ago is Closed, not "Opens 6 PM". A close at or before the open runs past midnight.
 *
 * `resetHour` null is a list row, which does not carry the reset: the small hours are then taken to belong to the night
 * before while that night's close has not passed, which is what a reset at the close hour says.
 *
 * ponytail: "now" is the phone's clock, the venue's whenever the person is in the venue's city; the server sends no
 * timezone. Add one to make this exact anywhere.
 */
export type VenueDayState = { state: 'opens' | 'open'; time: string } | { state: 'closed' }

const DAY_MIN = 1440

/** "18:00" → minutes since midnight and "6 PM" in the one clock grammar; null for anything else. */
function wallClock(hhmm: string): { minutes: number; text: string } | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim())
  if (!m) return null
  const [h, min] = [Number(m[1]), Number(m[2])]
  return { minutes: h * 60 + min, text: clockTime(new Date(2000, 0, 1, h, min).getTime()) }
}

export function venueDayState(
  opening: { opensAt: string; closesAt: string } | null | undefined,
  now: number,
  resetHour: number | null
): VenueDayState | null {
  if (!opening) return null
  const open = wallClock(opening.opensAt)
  const close = wallClock(opening.closesAt)
  if (!open || !close) return null
  const pastMidnight = close.minutes <= open.minutes
  const resetMinutes = resetHour === null ? (pastMidnight ? close.minutes : 0) : resetHour * 60
  const rel = (m: number) => (m - resetMinutes + DAY_MIN) % DAY_MIN
  const d = new Date(now)
  const at = rel(d.getHours() * 60 + d.getMinutes())
  const opens = rel(open.minutes)
  const closes = rel(close.minutes) <= opens ? rel(close.minutes) + DAY_MIN : rel(close.minutes)
  if (at < opens) return { state: 'opens', time: open.text }
  return at < closes ? { state: 'open', time: close.text } : { state: 'closed' }
}

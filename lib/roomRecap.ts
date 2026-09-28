/**
 * The end of the night, as the Room tells it.
 *
 * The Room used to carry `endsAt` and read it nowhere, so a room whose event
 * had finished looked exactly like a live one: a "● LIVE" strip, a Meet next
 * shuffle counting down to people who had gone home, and a Check out button
 * for a night that was already over. The server's sweeper checks everybody out
 * a while after the end (`occurrence_ended`, every fifteen minutes), and until
 * then the room kept pretending.
 *
 * Pure, so the screen's only job is to draw it: whether the night is over,
 * how long you were there, and how many people you matched with.
 */

export interface RecapSource {
  event: { id: string; title: string; endsAt?: string | null }
  checkedInAt: string | null
  people: readonly { matched: boolean }[]
}

export interface RoomRecap {
  eventId: string
  title: string
  /** "2h 15m", or null when the check-in time is unknown. */
  timeSpent: string | null
  matched: number
}

/** Unparseable or missing is "not over": the room is never closed on a guess. */
export function endsAtMs(endsAt: string | null | undefined): number | null {
  if (!endsAt) return null
  const ms = new Date(endsAt).getTime()
  return Number.isFinite(ms) ? ms : null
}

export function roomHasEnded(endsAt: string | null | undefined, now: number): boolean {
  const end = endsAtMs(endsAt)
  return end !== null && end <= now
}

/**
 * How long you were in the room, uncapped.
 *
 * Not `timeHereLabel`: that one stops at "3h+" because it sits on a ring that
 * fills, and a recap that says "3h+" to somebody who stayed six is underselling
 * the night they are being asked to look back on.
 */
export function timeSpentLabel(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000)
  if (minutes < 1) return 'Under a minute'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/**
 * The recap, or null while the night is still going.
 *
 * Time is measured to the end of the event, not to now: opening the app the
 * next morning must not claim you were there for fourteen hours.
 */
export function roomRecap(source: RecapSource, now: number): RoomRecap | null {
  const end = endsAtMs(source.event.endsAt)
  if (end === null || end > now) return null
  const inAt = source.checkedInAt ? new Date(source.checkedInAt).getTime() : NaN
  return {
    eventId: source.event.id,
    title: source.event.title,
    timeSpent: Number.isFinite(inAt) ? timeSpentLabel(Math.min(end, now) - inAt) : null,
    matched: source.people.filter((p) => p.matched).length,
  }
}

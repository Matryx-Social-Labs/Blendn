/**
 * The small sentences and clocks the Room is made of.
 *
 * Pure, because every one of them is driven by a clock or a ranking and is
 * easy to get subtly wrong in a way nobody sees until a room is busy: a
 * "Meet next" that reshuffles on every render, a countdown that reads "-0:01",
 * a reason line that wraps under a 96pt face.
 *
 * Nothing here invents a fact. Every line is built from a field the server
 * sent, and when there is nothing true to say the fallback is presence.
 */

/** A reason line has to fit under a face in a three-column grid. */
export const REASON_MAX = 24

/** "Just walked in" for this long after a check-in. */
export const JUST_ARRIVED_MS = 10 * 60_000

export interface ReasonSource {
  /** The shared subset only; `dating` only when the server checked both ways. */
  sharedIntents?: readonly string[]
  /** Future events you are both going to, excluding this one. */
  sharedPlans?: number
  /** Nights you were both at, before this one. 0 when suppressed. */
  sharedEvents?: number
  /** Shared interest names, strongest first. */
  interests?: readonly string[]
  sharedWorkField?: boolean
  workField?: string | null
  /** When they walked in, if this session saw it happen. */
  arrivedAt?: string | null
  /** False only when presence says they stepped out. */
  insideNow?: boolean
}

/**
 * Cut to `max` with an ellipsis, on the last character rather than a word:
 * the variable part is always a single label ("Jazz", "Design"), and a word
 * boundary would drop it entirely.
 */
function fit(text: string, max = REASON_MAX): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

/** The long phrasing when it fits, else the short one, else cut. */
function shortest(long: string, short: string): string {
  return long.length <= REASON_MAX ? long : fit(short)
}

/**
 * One short reason to walk over.
 *
 * The same priority as the Grid card's box (`lib/gridCardContent.ts`) —
 * rarest and most actionable first — with dating ahead of it, because it only
 * appears when the server has already checked that it is mutual and it is the
 * one thing somebody would most want to know before crossing a room.
 *
 * History reads "Both at N nights before", never "Met at": the product exists
 * because people in the same room do not meet, and claiming they did would be
 * the one sentence here that isn't true.
 */
export function reasonLine(p: ReasonSource, now: number = Date.now()): string {
  if (p.sharedIntents?.includes('dating')) return 'Both open to dating'

  // Counts get a shorter phrasing rather than an ellipsis once they reach two
  // digits: "Going to 12 more togeth…" cuts the only word that explains it.
  const plans = p.sharedPlans ?? 0
  if (plans > 0) return shortest(`Going to ${plans} more together`, `Both going to ${plans} more`)

  const history = p.sharedEvents ?? 0
  if (history > 0) {
    return history === 1
      ? 'Both at 1 night before'
      : shortest(`Both at ${history} nights before`, `Both at ${history} nights`)
  }

  const interests = (p.interests ?? []).filter((s) => s.trim().length > 0)
  if (interests.length > 0) {
    const head = `${interests.length} shared · `
    return head + fit(interests[0], REASON_MAX - head.length)
  }

  if (p.sharedWorkField && p.workField) {
    const head = 'Both in '
    return head + fit(p.workField, REASON_MAX - head.length)
  }

  if (p.arrivedAt) {
    const at = new Date(p.arrivedAt).getTime()
    if (Number.isFinite(at) && now - at >= 0 && now - at < JUST_ARRIVED_MS) return 'Just walked in'
  }

  // Presence is the one thing always true of a checked-in person — unless it
  // says they stepped out, and then "Here now" would be the lie.
  return p.insideNow === false ? 'Checked in' : 'Here now'
}

/* -------------------------------------------------------------------------- */
/* Meet next                                                                   */
/* -------------------------------------------------------------------------- */

export interface MeetNextOptions {
  now: number
  eventId: string
  /** How long one set of picks holds. */
  windowMs?: number
  /** How many picks. */
  size?: number
  /** How deep into the ranking the rotation reaches. */
  pool?: number
}

export interface MeetNextResult<T> {
  picks: T[]
  /** When the picks change next — the "Next shuffle" countdown's target. */
  nextShuffleAt: number
}

/** FNV-1a. Small, stable across engines, and enough to spread event ids. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * The three people to meet next.
 *
 * The server already ranked the room, so this doesn't re-rank — it rotates
 * through the top `pool` one window at a time. Three reasons for a rotation
 * rather than "always the top three":
 *
 * - **The top three never change otherwise.** In a steady room the same faces
 *   sit there all night, and a suggestion you've already ignored is noise.
 * - **It must not move on every render.** The window index is
 *   `floor(now / windowMs)`, so the picks hold for the whole window and change
 *   exactly when the countdown says they will.
 * - **Seeded by the event**, so two phones in the same room shuffle at the same
 *   moment and on the same pattern — "the list just changed" is a shared
 *   experience rather than a per-device accident.
 *
 * Matched people are skipped: there is nothing left to suggest about them.
 * Picks come back in rank order, so the strongest of the three reads first.
 * With `size` or fewer candidates there is nothing to rotate and the list is
 * returned as is.
 */
export function meetNext<T extends { id: string; matched?: boolean }>(
  people: readonly T[],
  { now, eventId, windowMs = 15 * 60_000, size = 3, pool = 9 }: MeetNextOptions
): MeetNextResult<T> {
  const safeWindow = Math.max(1, windowMs)
  const window = Math.floor(now / safeWindow)
  const nextShuffleAt = (window + 1) * safeWindow

  const candidates = people.filter((p) => !p.matched).slice(0, Math.max(size, pool))
  if (candidates.length <= size) return { picks: candidates, nextShuffleAt }

  const n = candidates.length
  const offset = (hash(eventId) + window * size) % n
  const indices: number[] = []
  for (let i = 0; i < size; i++) indices.push((offset + i) % n)
  indices.sort((a, b) => a - b)

  return { picks: indices.map((i) => candidates[i]), nextShuffleAt }
}

/* -------------------------------------------------------------------------- */
/* Clocks                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * How long you've been here, for the ring on your own face.
 *
 * Capped at "3h+": past three hours the exact minute isn't information, and a
 * counter that keeps climbing reads as a meter running.
 */
export function timeHereLabel(checkedInAt: string | null | undefined, now: number): string {
  if (!checkedInAt) return ''
  const at = new Date(checkedInAt).getTime()
  if (!Number.isFinite(at)) return ''
  const minutes = Math.floor(Math.max(0, now - at) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m`
  if (minutes >= 180) return '3h+'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** "4:12" until the next shuffle. Never negative: a late tick reads "0:00". */
export function shuffleCountdownLabel(nextAt: number, now: number): string {
  const seconds = Math.max(0, Math.ceil((nextAt - now) / 1000))
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export type StartsKind = 'live' | 'soon' | 'later' | 'ended'

/** Under this, "IN 25M"; from here to `CLOCK_AFTER_MS`, "IN 2H". */
const SOON_MS = 60 * 60_000
/** Past this, the clock time reads better than a count of hours. */
const CLOCK_AFTER_MS = 6 * 60 * 60_000

/** "8:30 PM" in local time. Built by hand: `Intl` time formats vary by engine. */
function clockTime(ms: number): string {
  const d = new Date(ms)
  const h24 = d.getHours()
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(d.getMinutes()).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`
}

/**
 * The status tag on a Tonight row: LIVE, IN 25M, IN 2H, 8:30 PM, ENDED.
 *
 * Minutes round up — "IN 0M" for something 30 seconds out is a tag that says
 * nothing — and hours round to nearest, so 1h50 reads "IN 2H" rather than
 * understating the wait by an hour.
 */
export function startsLabel(
  { startsAt, endsAt }: { startsAt?: string | null; endsAt?: string | null },
  now: number
): { kind: StartsKind; text: string } {
  const start = startsAt ? new Date(startsAt).getTime() : NaN
  const end = endsAt ? new Date(endsAt).getTime() : NaN

  if (Number.isFinite(end) && end <= now) return { kind: 'ended', text: 'ENDED' }
  if (!Number.isFinite(start)) return { kind: 'later', text: '' }
  if (start <= now) return { kind: 'live', text: 'LIVE' }

  const until = start - now
  if (until < SOON_MS) return { kind: 'soon', text: `IN ${Math.max(1, Math.ceil(until / 60_000))}M` }
  if (until < CLOCK_AFTER_MS) return { kind: 'later', text: `IN ${Math.round(until / SOON_MS)}H` }
  return { kind: 'later', text: clockTime(start) }
}

/* -------------------------------------------------------------------------- */
/* Tonight                                                                     */
/* -------------------------------------------------------------------------- */

/** How far ahead Tonight looks. Past this, it's a plan, not tonight. */
export const TONIGHT_HORIZON_MS = 6 * 60 * 60_000

export interface TonightCandidate {
  id: string
  startsAt: string
  endsAt?: string | null
  /** Kilometres, or null without a location. */
  distanceKm: number | null
  going: boolean
}

/**
 * What Tonight lists, in order: running now or starting within six hours.
 *
 * Yours first — something you said you'd go to is the answer to "what's on"
 * before anything nearer is — then nearest, then soonest. Without a location
 * every distance is null and the order falls through to start time, which is
 * the city feed's own order.
 *
 * An event with no end time counts as running for the horizon after it
 * starts, rather than for ever: a row with no end is usually a data gap, and
 * showing it as LIVE at 4am is the worse failure.
 */
export function pickTonight<T extends TonightCandidate>(
  events: readonly T[],
  now: number,
  horizonMs: number = TONIGHT_HORIZON_MS
): T[] {
  return events
    .filter((e) => {
      const start = new Date(e.startsAt).getTime()
      if (!Number.isFinite(start)) return false
      const parsedEnd = e.endsAt ? new Date(e.endsAt).getTime() : NaN
      const end = Number.isFinite(parsedEnd) ? parsedEnd : start + horizonMs
      return end > now && start <= now + horizonMs
    })
    .sort((a, b) => {
      if (a.going !== b.going) return a.going ? -1 : 1
      const da = a.distanceKm ?? Infinity
      const db = b.distanceKm ?? Infinity
      if (da !== db) return da - db
      return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    })
}

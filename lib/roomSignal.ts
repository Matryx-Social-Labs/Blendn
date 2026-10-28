import { pickInsideEvents, pickTodayEvents, venueNameOf, type PreciseFix, type RoomButtonEvent } from './roomButton'

/**
 * What the centre button knows, published by whoever already knows it.
 *
 * The Pulse fetches events with a location and gets `distance` back on every
 * one of them. The tab bar needs two facts derived from exactly that data —
 * whether you are standing inside a fence, and what you said you were going to
 * tonight — and re-fetching them there would mean a second location permission
 * dance and a second copy of the events list on a timer.
 *
 * A module-level cache with subscribers, rather than a context provider
 * threaded through a tree the tab bar is not inside.
 *
 * **Nothing here is authoritative.** The button it feeds only ever *offers* an
 * action; the real check-in re-validates the GPS server-side and refuses if the
 * offer was wrong.
 */
interface RoomSignal {
  insideEventId: string | null
  /** The inside event's venue: the disc's (c) label reads "Check in · {venue}" (Flow 4 T10). */
  insideVenue: string | null
  /** How many running events' fences you are inside; over one, the disc says "Check in · 2 here" (BAR-06). */
  insideCount: number
  todayEventIds: string[]
}

const EMPTY: RoomSignal = { insideEventId: null, insideVenue: null, insideCount: 0, todayEventIds: [] }
let _signal: RoomSignal = EMPTY
const _listeners = new Set<() => void>()

/**
 * Publish from an events list that already carries distances.
 *
 * A no-op notification is skipped: this is called on every fetch of a screen
 * that refetches on city change, on foreground and on pull-to-refresh, and
 * re-rendering the tab bar each time for an unchanged answer is work nobody
 * asked for.
 *
 * `at` is the phone's precise fix. The server's `distance` was measured from a position rounded to ~110 m, which is
 * too coarse for a 100 m fence (SCRUM-744), so "inside" is judged from `at` and the event's own coordinates; a list
 * with no fix to hand falls back to the server's number.
 */
export function publishRoomSignal(
  events: readonly RoomButtonEvent[],
  now: number = Date.now(),
  at?: PreciseFix | null
): void {
  const inside = pickInsideEvents(events, now, at)
  const insideEventId = inside[0] ?? null
  const next: RoomSignal = {
    insideEventId,
    insideVenue: venueNameOf(events.find((e) => e.id === insideEventId) ?? {}),
    insideCount: inside.length,
    todayEventIds: pickTodayEvents(events, now),
  }
  if (
    next.insideEventId === _signal.insideEventId &&
    next.insideVenue === _signal.insideVenue &&
    next.insideCount === _signal.insideCount &&
    next.todayEventIds.length === _signal.todayEventIds.length &&
    next.todayEventIds.every((id, i) => id === _signal.todayEventIds[i])
  ) {
    return
  }
  _signal = next
  for (const fn of _listeners) fn()
}

export function getRoomSignal(): RoomSignal {
  return _signal
}

/**
 * Forget everything, on sign-out.
 *
 * Without this, the next account to sign in on the same device inherits the
 * previous one's saved events — and a "Tonight" button pointing at somebody
 * else's plans.
 */
export function clearRoomSignal(): void {
  _signal = EMPTY
  for (const fn of _listeners) fn()
}

let _stopSource: (() => void) | null = null

/**
 * The mounted source says how to stop it, so sign-out can (`useAuth` imports this leaf, not the source: the source reaches
 * location and the API client). Cleared by the source itself on unmount.
 */
export function setRoomSignalSourceStop(stop: (() => void) | null): void {
  _stopSource = stop
}

/** Sign-out: nothing more is published for this account, whatever read is still out. Before `clearRoomSignal`. */
export function stopRoomSignalSource(): void {
  const stop = _stopSource
  _stopSource = null
  stop?.()
}

export function subscribeRoomSignal(fn: () => void): () => void {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}

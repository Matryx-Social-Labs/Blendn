import { pickInsideEvent, pickTodayEvents, type RoomButtonEvent } from './roomButton'

/**
 * What the centre button knows, published by whoever already knows it.
 *
 * The Pulse fetches events with a location and gets `distance` back on every
 * one of them. The tab bar needs two facts derived from exactly that data —
 * whether you are standing inside a fence, and what you said you were going to
 * tonight — and re-fetching them there would mean a second location permission
 * dance and a second copy of the events list on a timer.
 *
 * Same shape as `lib/unread.ts`, which solves the identical problem for message
 * counts: a module-level cache with subscribers, rather than a context provider
 * threaded through a tree the tab bar is not inside.
 *
 * **Nothing here is authoritative.** The button it feeds only ever *offers* an
 * action; the real check-in re-validates the GPS server-side and refuses if the
 * offer was wrong.
 */
interface RoomSignal {
  insideEventId: string | null
  todayEventIds: string[]
}

let _signal: RoomSignal = { insideEventId: null, todayEventIds: [] }
const _listeners = new Set<() => void>()

/**
 * Publish from an events list that already carries distances.
 *
 * A no-op notification is skipped: this is called on every fetch of a screen
 * that refetches on city change, on foreground and on pull-to-refresh, and
 * re-rendering the tab bar each time for an unchanged answer is work nobody
 * asked for.
 */
export function publishRoomSignal(
  events: readonly RoomButtonEvent[],
  now: number = Date.now()
): void {
  const next: RoomSignal = {
    insideEventId: pickInsideEvent(events, now),
    todayEventIds: pickTodayEvents(events, now),
  }
  if (
    next.insideEventId === _signal.insideEventId &&
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
  _signal = { insideEventId: null, todayEventIds: [] }
  for (const fn of _listeners) fn()
}

export function subscribeRoomSignal(fn: () => void): () => void {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}

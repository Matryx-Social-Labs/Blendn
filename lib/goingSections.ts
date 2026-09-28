import { liveWindow, sessionOver, type SessionSource } from './eventSession'
import { HAPPENING_NOW, groupByDay } from './pulse'
import {
  goingItems,
  type AttendancePayload,
  type GoingItem,
  type RsvpEventRow,
  type SavedEventRow,
} from './savedEvents'

/**
 * Whether an event is on right now, by the window the door goes by.
 *
 * `nextUpLabel`'s rule — started, and an end that has not passed — read from
 * `liveWindow`, so a festival's day 2 is live on day 2 and not through the
 * night between. No end time is not live: "on forever" is a guess.
 */
export function isLiveNow(e: SessionSource, now: number = Date.now()): boolean {
  const w = liveWindow(e)
  const start = Date.parse(w.start_time)
  const end = w.end_time ? Date.parse(w.end_time) : NaN
  return Number.isFinite(start) && Number.isFinite(end) && start <= now && !sessionOver(e, now)
}

/**
 * The Going tab, top to bottom — `goingItems`, with live events where they
 * belong.
 *
 * `goingItems` files every RSVP under the day it *started*. After midnight an
 * event that began at 21:30 yesterday and runs to 01:30 sat under yesterday's
 * date, below today's plans, while it was the one thing happening. So:
 *
 * - **The hero is a live event** when there is one, not simply the soonest.
 * - **Any other live RSVPs** go under one "Happening now" heading, first.
 * - **The rest** are grouped by the day of the window they will be judged by
 *   (`liveWindow`): a multi-day run's next day, not the day the run began.
 *
 * Saved and Past are `goingItems`' own, unchanged.
 */
export function goingSections(
  going: RsvpEventRow[],
  saved: SavedEventRow[],
  attended: AttendancePayload['events'],
  now: number = Date.now()
): GoingItem[] {
  const live = going.filter((r) => isLiveNow(r, now))
  const later = going.filter((r) => !isLiveNow(r, now))
  const [next, ...rest] = [...live, ...later]

  const items: GoingItem[] = []
  if (next) items.push({ kind: 'next', key: `n:${next.id}`, row: next })

  const restLive = rest.filter((r) => isLiveNow(r, now))
  if (restLive.length) {
    items.push({ kind: 'day', key: 'd:now', title: HAPPENING_NOW, weekday: '' })
    for (const row of restLive) items.push({ kind: 'going', key: `g:${row.id}`, row })
  }

  const restLater = rest
    .filter((r) => !isLiveNow(r, now))
    .map((row) => ({ start_time: liveWindow(row).start_time, row }))
  for (const day of groupByDay(restLater, new Date(now))) {
    items.push({ kind: 'day', key: `d:${day.key}`, title: day.title, weekday: day.weekday })
    for (const { row } of day.items) items.push({ kind: 'going', key: `g:${row.id}`, row })
  }

  // Saved (minus anything above) and Past, exactly as `goingItems` draws them.
  const goingIds = new Set(going.map((r) => r.id))
  const tail = goingItems([], saved.filter((r) => !goingIds.has(r.id)), attended, now)
  return [...items, ...tail]
}

export type GoingSection = 'saved' | 'going' | 'past'

/**
 * Which of the Going tab's three requests failed, for the partial-failure toast.
 *
 * Each section keeps its last good rows when its own request fails, so a
 * failure is invisible on screen — the section just stops updating. The screen
 * says so once, when a failure appears (`newFailure`), not on every focus
 * while it lasts; an empty screen with everything failed is the full error
 * state's job instead.
 */
export function failedSections(results: Record<GoingSection, { success: boolean }>): GoingSection[] {
  return (Object.keys(results) as GoingSection[]).filter((k) => !results[k].success)
}

/** Whether this load's failures are news: something failed that did not last time. */
export function newFailure(previous: readonly GoingSection[], current: readonly GoingSection[]): boolean {
  return current.some((s) => !previous.includes(s))
}

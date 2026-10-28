import { attendancePhase, type PhaseSource } from './attendanceState'
import { liveWindow, sessionOver, type SessionSource } from './eventSession'
import { HAPPENING_NOW } from './pulse'
import { calendarDaysBetween, dateIn, hourIn, weekdayIn } from './time'
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
/** The heading over RSVPs whose run has nothing left to go to. */
export const ENDED = 'Ended'

export function isLiveNow(e: PhaseSource, now: number = Date.now()): boolean {
  // The attendance flow's one answer (a cancelled night is never live): `lib/attendanceState.ts`.
  return attendancePhase(e, now) === 'live'
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
 * - **The rest** are grouped by when the window they will be judged by falls (`liveWindow`: a multi-day run's next
 *   day, not the day the run began): Tonight (Today, when any of it is before 5 PM), This week, Next week, then by
 *   month (D30, audit C15: one heading per day gave 35 headings for 35 rows). Each row then carries its own day.
 * - **Runs that are over** — every day that goes ahead has ended, the rest
 *   cancelled — come last, under "Ended", and never lead. The server lists them
 *   until the run's end, and their window is the last day that went ahead, so
 *   they sat under that past date among tonight's plans (staging,
 *   `blr-design-festival`, 2026-09-29: "Sep 28 Monday" in the upcoming list).
 *
 * Saved and Past are `goingItems`' own, unchanged.
 */
export function goingSections(
  going: RsvpEventRow[],
  saved: SavedEventRow[],
  attended: AttendancePayload['events'],
  now: number = Date.now(),
  paging: GoingPaging = {}
): GoingItem[] {
  const live = going.filter((r) => isLiveNow(r, now))
  const later = going.filter((r) => !isLiveNow(r, now) && !sessionOver(r, now))
  const over = going.filter((r) => !isLiveNow(r, now) && sessionOver(r, now))
  const [next, ...rest] = [...live, ...later, ...over]

  const items: GoingItem[] = []
  if (next) items.push({ kind: 'next', key: `n:${next.id}`, row: next })

  const restLive = rest.filter((r) => isLiveNow(r, now))
  if (restLive.length) {
    items.push({ kind: 'day', key: 'd:now', title: HAPPENING_NOW, weekday: '' })
    for (const row of restLive) items.push({ kind: 'going', key: `g:${row.id}`, row })
  }

  const restLater = rest
    .filter((r) => !isLiveNow(r, now) && !sessionOver(r, now))
    // Under the event's own day, as its row's time is (RC drive 5 D-4).
    .map((row) => ({ start_time: liveWindow(row).start_time, timezone: row.timezone, row }))
  for (const bucket of groupByWeek(restLater, new Date(now))) {
    items.push({ kind: 'day', key: `d:${bucket.key}`, title: bucket.title, weekday: '' })
    for (const { row } of bucket.items) items.push({ kind: 'going', key: `g:${row.id}`, row })
  }

  const restOver = rest.filter((r) => !isLiveNow(r, now) && sessionOver(r, now))
  if (restOver.length) {
    items.push({ kind: 'day', key: 'd:ended', title: ENDED, weekday: '' })
    for (const row of restOver) items.push({ kind: 'going', key: `g:${row.id}`, row })
  }

  // Saved (minus anything above) and Past, exactly as `goingItems` draws them.
  const goingIds = new Set(going.map((r) => r.id))
  const savedOnly = saved.filter((r) => !goingIds.has(r.id))
  const tail = goingItems([], savedOnly, attended, now)
  const past = tail.filter((i) => i.kind === 'past').length
  const more = (section: GoingSection, held: number): GoingItem[] => {
    const p = paging[section]
    if (!p?.hasMore) return []
    const remaining = Math.max(1, (p.total ?? 0) - held)
    return [{ kind: 'more', key: `m:${section}`, section, remaining, busy: !!p.busy, failed: !!p.failed }]
  }
  // The count a header carries is the server's, less the rows the screen holds and does not draw (a save already under Going, a
  // night still running): what is drawn once it is all read.
  const counted = (section: GoingSection, held: number, drawn: number): number | undefined => {
    const p = paging[section]
    // Said only where it tells more than the rows do: a short list needs no number.
    return p?.hasMore && p.total != null ? Math.max(drawn, p.total - (held - drawn)) : undefined
  }
  const withEnds = (section: 'saved' | 'past', held: number, drawn: number): GoingItem[] => {
    const lead = tail.filter((i) => (section === 'saved' ? i.key === 'h:saved' || i.key.startsWith('s:') : i.key === 'h:past' || i.key.startsWith('p:')))
    const rows = lead.length ? lead : more(section, held).length ? [{ kind: 'header', key: `h:${section}`, title: section === 'saved' ? 'Saved' : 'Past' } as GoingItem] : []
    const count = counted(section, held, drawn)
    return [
      ...rows.map((i) => (i.kind === 'header' && count !== undefined ? { ...i, count } : i)),
      ...(rows.length ? more(section, held) : []),
    ]
  }
  return [
    ...items,
    ...more('going', going.length),
    ...withEnds('saved', saved.length, savedOnly.length),
    ...withEnds('past', attended.length, past),
  ]
}

/** From 5 PM a day's plans are tonight's, as `nextUpLabel` says. */
const TONIGHT_FROM = 17

/**
 * Plans in four kinds of heading: today, the rest of this week (to Sunday), next week, then each month ("November", with
 * its year when it is not this one). Each in its own zone, as the rows' times are. In calendar order; an unreadable
 * start is left out rather than filed under a made-up heading.
 */
export function groupByWeek<T extends { start_time: string; timezone?: string | null }>(
  items: T[],
  now: Date
): { key: string; title: string; items: T[] }[] {
  const byKey = new Map<string, { key: string; title: string; rank: number; items: T[] }>()
  for (const item of items) {
    const d = new Date(item.start_time)
    if (Number.isNaN(d.getTime())) continue
    const zone = item.timezone ?? undefined
    const days = calendarDaysBetween(now, d, zone)
    const toSunday = (7 - weekdayIn(now, zone)) % 7
    const [y, m] = dateIn(d, zone)
    const bucket =
      days <= 0
        ? { key: 'today', title: 'Today', rank: 0 }
        : days <= toSunday
          ? { key: 'week', title: 'This week', rank: 1 }
          : days <= toSunday + 7
            ? { key: 'next', title: 'Next week', rank: 2 }
            : { key: `${y}-${m}`, title: monthTitle(y, m, dateIn(now, zone)[0]), rank: 3 + y * 12 + m }
    const group = byKey.get(bucket.key) ?? { ...bucket, items: [] }
    group.items.push(item)
    byKey.set(bucket.key, group)
  }
  const today = byKey.get('today')
  if (today && today.items.every((i) => hourIn(new Date(i.start_time), i.timezone ?? undefined) >= TONIGHT_FROM)) today.title = 'Tonight'
  return [...byKey.values()].sort((a, b) => a.rank - b.rank).map(({ key, title, items: rows }) => ({ key, title, items: rows }))
}

/** A month's heading, in words: the app has one date formatter (`calendarDate`), and it writes no month alone. */
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthTitle = (y: number, m: number, thisYear: number): string => (y === thisYear ? MONTH_NAMES[m] : `${MONTH_NAMES[m]} ${y}`)

/** What the screen knows of a section's pages: the server's total, whether more are to be had, and what a request is doing. */
export interface SectionPaging {
  total: number | null
  hasMore: boolean
  busy?: boolean
  failed?: boolean
}
export type GoingPaging = Partial<Record<GoingSection, SectionPaging>>

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

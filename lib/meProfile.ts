/**
 * The Me tab's words, as pure functions so they can be tested without a screen.
 *
 * Everything here reads fields `GET /users/:id` already returns for your own
 * profile — `memberSince` is the account's `createdAt`, and the gaps are read
 * off `photos`, `bio` and `interests`. Nothing is invented to fill a line: a
 * value that is missing drops its part rather than printing a placeholder.
 */

import { calendarDate, MONTHS } from './time'

/** Interest names from a profile payload: plain strings, or `{ id, name, slug, icon }` objects. */
export const interestNames = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.map((i: any) => (typeof i === 'string' ? i : i?.name || '')).filter((n: string) => n) : []

/** The slots Edit profile offers — `PhotoManager`'s grid. */
export const MAX_PHOTOS = 6

/** Below this many photos the tab suggests adding more. */
const FEW_PHOTOS = 3

function memberDate(memberSince: string | null | undefined): Date | null {
  if (!memberSince) return null
  const d = new Date(memberSince)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "Joined Mar 2025", or null when the date is missing or unreadable. */
export function joinedLabel(memberSince: string | null | undefined): string | null {
  const d = memberDate(memberSince)
  return d ? `Joined ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : null
}

/** "Mar 2025": the date alone, for the screen that draws it in Geist Mono. */
export function joinedDate(memberSince: string | null | undefined): string | null {
  const d = memberDate(memberSince)
  return d ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : null
}

/** "Bengaluru · Joined Mar 2025", dropping whichever part is missing. */
export function identityMeta(
  location: string | null | undefined,
  memberSince: string | null | undefined
): string | null {
  const parts = [location?.trim(), joinedLabel(memberSince)].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

export interface ProfileGap {
  key: 'photo' | 'photos' | 'bio' | 'interests'
  label: string
}

/**
 * What is still missing, most useful first, at most three.
 *
 * A photo leads because revealing yourself in a room shows your name and photo
 * and nothing else — without one there is nothing to reveal. Rows, never a
 * percentage: leaving a field empty is a legitimate choice, and a meter turns
 * it into a debt.
 */
export function profileGaps(profile: {
  photos?: string[] | null
  bio?: string | null
  interests?: string[] | null
}): ProfileGap[] {
  const photos = (profile.photos ?? []).filter((p) => !!p && p.trim() !== '').length
  const gaps: ProfileGap[] = []
  if (photos === 0) gaps.push({ key: 'photo', label: 'Add a photo' })
  else if (photos < FEW_PHOTOS) {
    gaps.push({ key: 'photos', label: `Add photos · ${photos} of ${MAX_PHOTOS}` })
  }
  if (!profile.bio?.trim()) gaps.push({ key: 'bio', label: 'Write a bio' })
  if (!profile.interests?.length) gaps.push({ key: 'interests', label: 'Pick interests' })
  return gaps.slice(0, 3)
}

/** How many weeks the Nights out grid looks back, the current week included. */
export const NIGHTS_WEEKS = 12

const DAY_MS = 24 * 60 * 60 * 1000

/** Local midnight of the Monday on or before `d`. */
function mondayOf(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7))
  return m
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export interface NightCell {
  /** Local midnight of the day. */
  date: Date
  /** Events you attended that started that day, as the caller passed them. */
  eventIds: string[]
  /** After today: the rest of the current week, drawn as nothing. */
  future: boolean
}

export interface NightsGrid {
  /** `NIGHTS_WEEKS` columns, oldest first, each Monday → Sunday. */
  weeks: NightCell[][]
  /** Column index → "SEP", on the first column and wherever a month starts. */
  monthLabels: (string | null)[]
  /** Days in the window with at least one event. */
  nights: number
}

/**
 * The last twelve weeks as a Monday-first grid of days, each day carrying the
 * events you attended that started on it (local time).
 *
 * Counts *nights*, not events: two events on one Saturday are one night out,
 * which is what the grid draws. Events outside the window are ignored.
 */
export function nightsGrid(
  events: { id: string; start_time: string }[],
  now: Date = new Date()
): NightsGrid {
  const byDay = new Map<string, string[]>()
  for (const e of events) {
    const d = new Date(e.start_time)
    if (Number.isNaN(d.getTime())) continue
    const k = dayKey(d)
    byDay.set(k, [...(byDay.get(k) ?? []), e.id])
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const first = mondayOf(now)
  first.setDate(first.getDate() - (NIGHTS_WEEKS - 1) * 7)

  const weeks: NightCell[][] = []
  const monthLabels: (string | null)[] = []
  let nights = 0
  for (let w = 0; w < NIGHTS_WEEKS; w++) {
    const week: NightCell[] = []
    let label: string | null = null
    for (let d = 0; d < 7; d++) {
      const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + w * 7 + d)
      const future = date.getTime() > today.getTime()
      const eventIds = future ? [] : byDay.get(dayKey(date)) ?? []
      if (eventIds.length) nights++
      if ((w === 0 && d === 0) || date.getDate() === 1) label = MONTHS[date.getMonth()].toUpperCase()
      week.push({ date, eventIds, future })
    }
    weeks.push(week)
    monthLabels.push(label)
  }
  return { weeks, monthLabels, nights }
}

/**
 * "THIS WEEK", "LAST WEEK", "3 WEEKS AGO", "2 MONTHS AGO", "LAST YEAR" — how
 * long ago an event was, for the eyebrow on a Recent tile. Uppercase in the
 * string, because the `label` role is (docs/DESIGN_SYSTEM.md).
 */
export function agoLabel(startTime: string, now: Date = new Date()): string {
  const start = new Date(startTime)
  if (Number.isNaN(start.getTime())) return ''
  const weeks = Math.floor((mondayOf(now).getTime() - mondayOf(start).getTime()) / (7 * DAY_MS) + 0.5)
  if (weeks <= 0) return 'THIS WEEK'
  if (weeks === 1) return 'LAST WEEK'
  if (weeks < 8) return `${weeks} WEEKS AGO`
  const months = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth()
  if (months < 12) return `${months} MONTHS AGO`
  return months < 24 ? 'LAST YEAR' : `${Math.floor(months / 12)} YEARS AGO`
}

/** "Fri 3 Oct": the eyebrow on a night's tile (Flow 6 `me`), in the event's own day when its zone is known. Empty when the date is unreadable. */
export function nightLabel(startTime: string, timeZone?: string | null): string {
  const d = new Date(startTime)
  // No year: the tile has room for "THU 22 OCT" and no more, and Nights out is the last twelve weeks.
  return calendarDate(d, { weekday: true, year: false, timeZone: timeZone ?? undefined })
}

/** How many nights the Me tab's grid shows (Flow 6 `me`: two rows of three). */
export const NIGHT_TILES = 6

/** Where the attendance request stands, as the screen knows it. */
export type NightsStatus = 'loading' | 'ready' | 'failed'

/**
 * What Nights out draws (Flow 6 `me` 04 · 05 · 06): a skeleton grid while the first load runs, the tiles when it has answered,
 * the tiles with a notice and Try again when a refresh failed (it keeps the last good list), and an invitation, never a grid,
 * for someone with no night yet. A load that failed with nothing to show says so and offers Try again, without tiles. Pure, so the
 * choice between them is testable.
 *
 * "No night yet" is the count's word, never the list's (D-H1): a free account sees its latest 3 nights and `lockedCount` more
 * are with Blend'n+, and those 3 can be nights that haven't ended (the list keeps ended ones only). So an empty list under a
 * count above 0 is `locked` when the server kept nights back, `pending` when the nights it has are still going, and `first`
 * only when the count is 0 (or unknown, from a server that sends none).
 */
export type NightsView =
  | { kind: 'loading' }
  | { kind: 'first' }
  | { kind: 'failed' }
  | { kind: 'locked'; total: number }
  | { kind: 'pending'; total: number }
  /** `locked`: the older nights kept behind Blend'n+, said under the tiles (S-1: a free account sees its latest 3 ended). */
  | { kind: 'tiles'; failed: boolean; nights: number; locked: number }

export function nightsView(
  status: NightsStatus,
  rows: readonly { id: string; start_time: string }[],
  lockedCount: number = 0,
  total: number | null = null,
  now: Date = new Date()
): NightsView {
  if (rows.length > 0) {
    return { kind: 'tiles', failed: status === 'failed', nights: nightsGrid(rows as { id: string; start_time: string }[], now).nights, locked: Math.max(0, lockedCount) }
  }
  if (status === 'loading') return { kind: 'loading' }
  if (status === 'failed') return { kind: 'failed' }
  const count = Math.max(total ?? 0, lockedCount)
  if (lockedCount > 0) return { kind: 'locked', total: count }
  return count > 0 ? { kind: 'pending', total: count } : { kind: 'first' }
}

/** What `/me/attendance` says beyond its rows: the nights kept behind Blend'n+, and every night (the shown ones plus those). */
export interface NightsCounts {
  locked: number
  /** Null from a server that sends no pagination. */
  total: number | null
}

export function nightsCounts(payload: { pagination?: { totalCount: number }; lockedCount?: number } | null | undefined): NightsCounts {
  const locked = Math.max(0, payload?.lockedCount ?? 0)
  // `totalCount` is the nights the list may show (the server's `visible`); the locked ones are on top of it.
  const shown = payload?.pagination?.totalCount
  return { locked, total: typeof shown === 'number' ? shown + locked : null }
}

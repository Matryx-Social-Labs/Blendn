/**
 * The Me tab's words, as pure functions so they can be tested without a screen.
 *
 * Everything here reads fields `GET /users/:id` already returns for your own
 * profile — `memberSince` is the account's `createdAt`, and the gaps are read
 * off `photos`, `bio` and `interests`. Nothing is invented to fill a line: a
 * value that is missing drops its part rather than printing a placeholder.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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

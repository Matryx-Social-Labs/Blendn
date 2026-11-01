/**
 * The Pulse's sections, as plain data (BUILD-SPEC §A; mockups/home-2026-10-20/pulse.html).
 *
 * Which event is under which heading, in what order and how many, with every
 * empty rule, as pure functions so each is tested without a render. The screen
 * draws what this returns and decides nothing.
 *
 * An event appears once, in the first section that claims it, in the order
 * `SECTION_ORDER` names (Happening now → Featured → Tonight → Because you like →
 * This weekend → Everything else). Nearby is exempt: distance is a different
 * question.
 */

import { liveWindow, sessionOver, type SessionSource } from './eventSession'
import { fnv1a } from './pseudonymAvatar'
import { dateIn, hourIn, instantIn, MONTHS, weekdayIn, WEEKDAYS } from './time'

/* -------------------------------------------------------------------------- */
/* Owner defaults, pending the owner's answers: one line each to change.      */
/* -------------------------------------------------------------------------- */

/** No count under this is printed: "here now", "going" and the live buckets (BUILD-SPEC §0). */
export const LIVE_FLOOR = 5
/** Featured shows at most this many per city. */
export const FEATURED_CAP = 5
/** A promoted (paid) placement is always labelled this; an editorial pick carries no label. */
export const PROMOTED_LABEL = 'Promoted'
/** `null`: an editorial pick is unlabelled. Set a word to label it. */
export const EDITORIAL_LABEL: string | null = null
/** Featured rotates daily: its order is seeded by the date. `false` keeps one fixed order (by id). */
export const FEATURED_ROTATES_DAILY = true
/**
 * The order the sections draw in, and (Nearby and the two area sections aside) the order they claim events in.
 * Featured is always first, above Happening now (owner ruling, travel-mode-and-area-discovery §5.1).
 */
export const SECTION_ORDER: readonly PulseSectionKey[] = ['featured', 'now', 'inArea', 'tonight', 'aroundArea', 'nearby', 'forYou', 'weekend']

/**
 * "Events in {area}" and "Around {area}" need the area endpoints of plan phase P3, which are not built: until
 * then both are absent and the sections after Tonight keep their slots. Flip it when `area` and `areas` exist.
 */
export const AREA_SECTIONS_READY = false

/* -------------------------------------------------------------------------- */

export type PulseSectionKey = 'featured' | 'now' | 'inArea' | 'tonight' | 'aroundArea' | 'nearby' | 'forYou' | 'weekend'

export const NOW_LIMIT = 8
export const TONIGHT_LIMIT = 4
export const NEARBY_LIMIT = 4
export const FOR_YOU_LIMIT = 8
export const FOR_YOU_MIN = 3
export const WEEKEND_LIMIT = 8
export const WEEKEND_MIN = 2
/** Nearby looks this far ahead. */
export const NEARBY_DAYS = 7
/** An event with no end is treated as running this long (`onNow` in the screen did the same). */
export const OPEN_ENDED_HOURS = 4
/** The venue day and the "tonight" cut-off both turn over at this local hour. */
export const DAY_RESET_HOUR = 6
/** From this local hour on a Sunday, "This weekend" is skipped. */
export const WEEKEND_SKIP_FROM = { day: 0, hour: 18 } as const

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** What a section needs to read of an event; the app's `BlendnEvent` has all of it. */
export interface SectionEvent extends SessionSource {
  id: string
  /** Kilometres from the fix, or null. */
  distance?: number | null
  here_count?: number | null
  going_count?: number | null
  /** The admin toggle that exists today. */
  is_featured?: boolean
  /** The server's placement (BUILD-SPEC C1), when it sends one. */
  featured?: { kind: 'promoted' | 'editorial'; rank: number; by?: string | null } | null
  /** The event's own IANA zone (admin #749): its night is its city's, not the phone's. */
  timezone?: string | null
}

export type PulseSection<E extends SectionEvent = SectionEvent> = {
  key: PulseSectionKey
  events: E[]
  /** Every event the section claims, for its header; `events` is the capped list. */
  count: number
  /** The count is a floor, not a total: the page it was counted from was full, so there may be more (BAR-10). */
  more?: boolean
  /** The interest "Because you like …" is about. */
  interest?: { name: string; slug: string }
}

export type PulseSectionsInput<E extends SectionEvent> = {
  /** Request A: the city's page. */
  page: readonly E[]
  /** Request B: Friday 17:00 to Sunday 23:59, or null (not loaded, failed, skipped). */
  weekend: readonly E[] | null
  /** Request D: `featured=true&limit=5`, so a featured event outside the first page still shows; or null (not loaded, failed). */
  featured?: readonly E[] | null
  /** The page came back full (`hasMore`): "Happening now" and "Tonight" counts are then "N+", never an exact-looking number (BAR-10). */
  pageFull?: boolean
  /** Request E: the nearest events in the next 7 days (`sortBy=distance`), so a closer event on page 2 still ranks; or null (not loaded). */
  nearby?: readonly E[] | null
  /** Request C: the first interest's events, or null. */
  forYou: { interest: { name: string; slug: string }; events: readonly E[] } | null
  now: number
  /** The phone has a position, so distances mean something. */
  hasFix: boolean
  /** 'YYYY-MM-DD', local: the day's rotation seed. */
  seedDate: string
  /** The browse city's IANA zone: an event with no zone of its own has that city's night. The phone's when absent. */
  timeZone?: string
}

/* -------------------------------------------------------------------------- */
/* Time                                                                       */
/* -------------------------------------------------------------------------- */

const startOf = (e: SessionSource) => Date.parse(liveWindow(e).start_time)

/** The end the section rules use: the session's, or an open-ended event's start + 4 h. */
function endOf(e: SessionSource): number {
  const end = liveWindow(e).end_time
  const ms = end ? Date.parse(end) : NaN
  return Number.isFinite(ms) ? ms : startOf(e) + OPEN_ENDED_HOURS * HOUR
}

/** Started and not over. */
export const isLiveNow = (e: SessionSource, now: number) => startOf(e) <= now && now < endOf(e)

/** Today 06:00 if it is before 06:00, else tomorrow 06:00, in `timeZone` (an event's own), or the phone's. */
export function nextDayReset(now: number, resetHour: number = DAY_RESET_HOUR, timeZone?: string): number {
  const [y, m, day] = dateIn(new Date(now), timeZone)
  const today = instantIn(y, m, day, resetHour, 0, timeZone)
  return now < today ? today : instantIn(y, m, day + 1, resetHour, 0, timeZone)
}

/**
 * Tonight, as the event's own city has it (as `nextUpLabel` says "Tonight" in the event's zone): it starts later than
 * now and before that city's next 06:00. A Los Angeles phone at 4:39 AM reads an IST 6:30 PM start as tonight in
 * Bengaluru; the phone's 6 AM, an hour off, dropped the section (RC 7, Android). An event with no zone has the browse city's (`cityZone`), else the phone's.
 */
export const isTonight = (e: SectionEvent, now: number, cityZone?: string): boolean =>
  startOf(e) > now && startOf(e) < nextDayReset(now, DAY_RESET_HOUR, e.timezone ?? cityZone)

/** The date as 'YYYY-MM-DD' in `timeZone` (the browse city's), or the phone's. */
export function seedDateOf(now: number, timeZone?: string): string {
  const [y, m, day] = dateIn(new Date(now), timeZone)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${y}-${p(m + 1)}-${p(day)}`
}

/**
 * This weekend's window: Friday 17:00 to Sunday 23:59:59 in `timeZone` (the browse city's: a phone in India browsing
 * Toronto asks for Toronto's weekend), or the phone's, for request B.
 * `skip` from Sunday 18:00 on: the weekend is nearly over. From Friday 17:00 the
 * window has begun; the request still asks from that Friday.
 */
export function weekendWindow(now: number, timeZone?: string): { startDate: string; endDate: string; skip: boolean; label: string } {
  const d = new Date(now)
  const dow = weekdayIn(d, timeZone)
  const [y, m, day] = dateIn(d, timeZone)
  const toFriday = (5 - dow + 7) % 7
  // Sat and Sun are inside this weekend, so the Friday is behind them.
  const fridayOffset = dow === 6 ? -1 : dow === 0 ? -2 : toFriday
  const friday = instantIn(y, m, day + fridayOffset, 17, 0, timeZone)
  const sunday = instantIn(y, m, day + fridayOffset + 2, 23, 59, timeZone) + 59_999
  const skip = dow === WEEKEND_SKIP_FROM.day && hourIn(d, timeZone) >= WEEKEND_SKIP_FROM.hour
  const saturday = new Date(instantIn(y, m, day + fridayOffset + 1, 0, 0, timeZone))
  return { startDate: new Date(friday).toISOString(), endDate: new Date(sunday).toISOString(), skip, label: weekendLabel(saturday, new Date(sunday), timeZone) }
}

/** "Sat 24 – Sun 25 Oct" (the month once when it is shared), the days as `timeZone` (or the phone) has them. */
export function weekendLabel(saturday: Date, sunday: Date, timeZone?: string): string {
  const [, satMonth, satDay] = dateIn(saturday, timeZone)
  const [, sunMonth, sunDay] = dateIn(sunday, timeZone)
  const a = `${WEEKDAYS[weekdayIn(saturday, timeZone)]} ${satDay}`
  const b = `${WEEKDAYS[weekdayIn(sunday, timeZone)]} ${sunDay}`
  return satMonth === sunMonth ? `${a} – ${b} ${MONTHS[sunMonth]}` : `${a} ${MONTHS[satMonth]} – ${b} ${MONTHS[sunMonth]}`
}

/* -------------------------------------------------------------------------- */
/* Featured                                                                   */
/* -------------------------------------------------------------------------- */

/** Whether the server or the admin toggle says this event is featured at all. */
export const isFeaturedEvent = (e: SectionEvent) => !!e.featured || e.is_featured === true

/**
 * The label a featured card carries: "Promoted" for a promoted (paid) placement, the
 * editorial label (none by default) otherwise, and nothing for an event that
 * is only flagged by the admin toggle: no card is labelled Promoted until the
 * server says it was paid for (C1/C2).
 */
export function featuredLabel(e: SectionEvent): string | null {
  if (e.featured?.kind === 'promoted') return PROMOTED_LABEL
  return e.featured?.kind === 'editorial' ? EDITORIAL_LABEL : null
}

/**
 * Featured: only events that really are, never back-filled. The server's rank
 * when it sends one (a daily rotation computed there); until then a rotation
 * seeded by the date, which is fair and stable within the day. Capped.
 */
export function featuredPick<E extends SectionEvent>(events: readonly E[], now: number, seedDate: string): E[] {
  const flagged = events.filter((e) => isFeaturedEvent(e) && !sessionOver(e, now))
  const ranked = flagged.some((e) => e.featured)
  const order = (e: E) => (ranked ? (e.featured?.rank ?? Number.MAX_SAFE_INTEGER) : fnv1a(FEATURED_ROTATES_DAILY ? `${seedDate}${e.id}` : e.id) >>> 0)
  return [...flagged].sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id)).slice(0, FEATURED_CAP)
}

/* -------------------------------------------------------------------------- */
/* The sections                                                               */
/* -------------------------------------------------------------------------- */

function unique<E extends SectionEvent>(events: readonly E[]): E[] {
  const seen = new Set<string>()
  return events.filter((e) => !seen.has(e.id) && (seen.add(e.id), true))
}

const byStart = (a: SessionSource, b: SessionSource) => startOf(a) - startOf(b)

export function pulseSections<E extends SectionEvent>(input: PulseSectionsInput<E>): PulseSection<E>[] {
  const { now, hasFix, seedDate, timeZone } = input
  const page = unique(input.page)
  /*
   * Whether the page being full says there may be more of this section (BAR-10, M7). The page is in start order: "Happening
   * now" cannot grow if its last row starts after now, and "Tonight" cannot if its last row starts after the city's 06:00.
   */
  const lastRow = page.reduce<E | null>((last, e) => (last === null || startOf(e) > startOf(last) ? e : last), null)
  const pageMayHideMore = (key: PulseSectionKey): boolean => {
    if (input.pageFull !== true || lastRow === null) return false
    const horizon = key === 'now' ? now : key === 'tonight' ? nextDayReset(now, DAY_RESET_HOUR, lastRow.timezone ?? timeZone) : -Infinity
    return startOf(lastRow) < horizon
  }
  const claimed = new Set<string>()
  const built: Partial<Record<PulseSectionKey, PulseSection<E>>> = {}
  const take = (key: PulseSectionKey, all: E[], limit: number, interest?: PulseSection['interest']) => {
    const floor = pageMayHideMore(key)
    built[key] = { key, events: all.slice(0, limit), count: all.length, ...(floor ? { more: true } : {}), ...(interest ? { interest } : {}) }
    // Only the drawn ones are claimed: an event past a section's cap is still an event nobody has shown.
    for (const e of built[key]!.events) claimed.add(e.id)
  }
  const fresh = (list: readonly E[]) => list.filter((e) => !claimed.has(e.id))

  for (const key of SECTION_ORDER) {
    if (key === 'inArea' || key === 'aroundArea') {
      // Hidden until P3 (`AREA_SECTIONS_READY`); the area sections are exempt from the time dedupe when they arrive.
      if (!AREA_SECTIONS_READY) continue
    } else if (key === 'now') {
      const live = fresh(page)
        .filter((e) => isLiveNow(e, now))
        .sort((a, b) => (b.here_count ?? 0) - (a.here_count ?? 0) || byStart(a, b))
      if (live.length) take('now', live, NOW_LIMIT)
    } else if (key === 'featured') {
      // Featured events from their own request come first in the pool: an event outside the page's first 50 still shows.
      const picked = featuredPick(fresh(unique([...(input.featured ?? []), ...page])), now, seedDate)
      if (picked.length) take('featured', picked, FEATURED_CAP)
    } else if (key === 'tonight') {
      const tonight = fresh(page)
        .filter((e) => isTonight(e, now, timeZone))
        .sort(byStart)
      if (tonight.length) take('tonight', tonight, TONIGHT_LIMIT)
    } else if (key === 'nearby') {
      // Not deduped, not claimed: a place near you is a different question from what is on.
      if (!hasFix) continue
      const horizon = now + NEARBY_DAYS * DAY
      const near = unique(input.nearby ?? page)
        .filter((e) => e.distance != null && Number.isFinite(e.distance) && endOf(e) > now && startOf(e) < horizon)
        .sort((a, b) => (a.distance as number) - (b.distance as number))
      if (near.length) built.nearby = { key: 'nearby', events: near.slice(0, NEARBY_LIMIT), count: near.length }
    } else if (key === 'forYou') {
      if (!input.forYou) continue
      const list = fresh(unique(input.forYou.events)).sort(byStart)
      if (list.length >= FOR_YOU_MIN) take('forYou', list, FOR_YOU_LIMIT, input.forYou.interest)
    } else if (key === 'weekend') {
      if (!input.weekend || weekendWindow(now, timeZone).skip) continue
      const list = fresh(unique(input.weekend)).sort(byStart)
      if (list.length >= WEEKEND_MIN) take('weekend', list, WEEKEND_LIMIT)
    }
  }
  return SECTION_ORDER.flatMap((key) => (built[key] ? [built[key]!] : []))
}

/** Everything else: the page minus every event a section drew (Nearby's included). */
export function everythingElse<E extends SectionEvent>(page: readonly E[], sections: readonly PulseSection<E>[]): E[] {
  const drawn = new Set(sections.flatMap((s) => s.events.map((e) => e.id)))
  return page.filter((e) => !drawn.has(e.id))
}

/**
 * A count the card may print: five and up. Below the floor nothing is said —
 * "3 going" reads as a verdict on the event, and a small number of people
 * names whoever they are.
 */
export const printable = (n: number | null | undefined): number | null =>
  typeof n === 'number' && Number.isFinite(n) && n >= LIVE_FLOOR ? Math.floor(n) : null

/**
 * The chips over "Everything else": All, then each top-level category with at
 * least one event in what is loaded, busiest first, each with its count.
 */
export function categoryChips(
  events: readonly { category_group?: string | null }[],
  options: readonly { slug: string; name: string }[]
): { slug: string; name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const e of events) if (e.category_group) counts.set(e.category_group, (counts.get(e.category_group) ?? 0) + 1)
  return options
    .map((o) => ({ ...o, count: counts.get(o.slug) ?? 0 }))
    .filter((o) => o.count >= 1)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** The drawer's peek line for the Pulse: "● 3 live now · 14 on tonight"; a part that is 0 is dropped, both 0 is none. */
export function pulsePeekLine(sections: readonly PulseSection[]): string | null {
  const now = sections.find((s) => s.key === 'now')
  const tonight = sections.find((s) => s.key === 'tonight')
  const parts = [now && now.count > 0 ? `${sectionCountLabel(now)} live now` : null, tonight && tonight.count > 0 ? `${sectionCountLabel(tonight)} on tonight` : null].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

/**
 * The search results overline's count and noun: the server's total for the query, not the rows loaded so far (a page is 50 and
 * grows as you scroll). Never fewer than what is on screen, and the loaded count while the total is not known (BAR-07).
 */
export function resultsCount(loaded: number, totalCount: number | null | undefined): { count: number; text: string; noun: string } {
  const count = typeof totalCount === 'number' && Number.isFinite(totalCount) ? Math.max(totalCount, loaded) : loaded
  return { count, text: count.toLocaleString('en-US'), noun: count === 1 ? 'event' : 'events' }
}

/** A section header's count as words: "50+" when the count is a floor (BAR-10), else the number. */
export const sectionCountLabel = (s: Pick<PulseSection, 'count' | 'more'>): string => `${s.count}${s.more ? '+' : ''}`

/** The Nearby request's and See all's upper bound: a week from now, rounded up to the hour so the pages of one list share a cache key (BAR-11). */
export const nearbyEndDate = (now: number): string => new Date(Math.ceil((now + NEARBY_DAYS * DAY) / HOUR) * HOUR).toISOString()

/** The place a loaded page was read for: another city or a ~100 m move is another page (the sections' requests wait for it). */
export const feedKey = (city: string | null | undefined, at: { latitude: number; longitude: number } | null | undefined): string =>
  `${city ?? '-'}|${at ? at.latitude.toFixed(3) : '-'},${at ? at.longitude.toFixed(3) : '-'}`

/**
 * Which interest "Because you like …" names: the one with the most events in the loaded page, the first on a tie (and the
 * first of all with an empty page). The server now lists interests oldest first (SV-4), so a tie is always the same answer (BAR-12).
 */
export function pickInterest<I extends { slug: string }>(interests: readonly I[], page: readonly { category_group?: string | null }[]): I | undefined {
  let best: { interest: I; n: number } | undefined
  for (const interest of interests) {
    const n = page.filter((e) => e.category_group === interest.slug).length
    if (!best || n > best.n) best = { interest, n }
  }
  return best?.interest
}

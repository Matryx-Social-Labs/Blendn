/**
 * What the place page says, as plain data (guidelines/places/places.js
 * `venue`, fullpages.js `venue`, flow-11 `venueBoard`). Pure, so every state
 * the page draws is chosen here and tested without a render.
 *
 * The server decides (`GET /venues/:venueId`): whether going live would be
 * accepted, why not, how many are live (a bucket, never a number), and your
 * own window (`expiresAt`, which the clock counts down from, never a timer from
 * the tap). A field the server does not send yet is a tile, a section or a
 * line that is not drawn: nothing here guesses a value.
 */

import type { SessionTime } from '../components/ds/SessionSheet'
import type { IconName } from '../components/ui/Icon'
import type { GoLiveChoice as DialChoice } from '../components/ds/GoLiveSheet'
import type { VenueDetail, VenueListItem } from './apiClient'
import { BOARD_ENABLED } from './board'
import type { GoLiveRefusal as SheetKind } from '../components/ds/GoLiveSheet'
import { countdownLabel, EXTEND_CHOICE, remainingMs, type GoLiveChoice, type GoLiveRefusal, type VenueAction } from './goLive'
import { liveNowWord } from './home'
import { VENUE_PLATES } from './design/tokens'
import { distanceText, plateFor, type PlateKey } from './placesPane'
import { venueDayState } from './venueHours'

/** A restaurant reuses the café's pair (owner's ruling on A87), as `VenuePlate` does. */
const PLATE_PAIRS: Record<PlateKey, readonly [string, string]> = { ...VENUE_PLATES, restaurant: VENUE_PLATES.cafe }
import { clockTime } from './roomMoments'
import { calendarDate, clockIn, eventClock, weekdayIn, zoneSuffix } from './time'

const MINUTE_MS = 60_000
/** The expiry window: the last five minutes read as mm:ss and offer Extend. */
export const ENDING_MS = 5 * MINUTE_MS

const pad = (n: number) => String(n).padStart(2, '0')
/** "21:50", 24-hour, in the phone's local time (Flow 11 draws every live time this way). */
export const clock24 = (ms: number) => {
  const [h, m] = clockIn(new Date(ms))
  return `${pad(h)}:${pad(m)}`
}

/** The hero: tonight's cover when there is one (the only artwork a venue has), else the type's plate. */
export type VenueHero = { kind: 'cover'; uri: string } | { kind: 'plate'; plate: PlateKey }

export function venueHero(detail: Pick<VenueDetail, 'venue' | 'tonight'>): VenueHero {
  const uri = detail.tonight?.coverImageUrl
  return uri ? { kind: 'cover', uri } : { kind: 'plate', plate: plateFor(detail.venue.venueType) }
}

export type TileSpec = { label: string; value: string; mono: boolean }

const HOUR_MS = 60 * MINUTE_MS

const validReset = (hour: number | null | undefined): number | null => (typeof hour === 'number' && Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null)

/**
 * The opening that answers "tonight": the week's `hours` rows for the weekday of the venue's current day (`day` 0 is
 * Sunday, as `getDay`), shaped for `venueDayState`, the reading the Places card shares. The venue's day starts at its
 * reset hour, not at midnight: at 01:00 on Saturday a venue that resets at 06:00 is still in Friday's, and Friday's row
 * answers (`lib/venue-tonight.ts` on the server). Null when no hours are given or none for that weekday. A split day
 * answers with its latest opening, as the server's card does. Rows that are not the server's shape are dropped.
 * `timeZone` is the venue's IANA zone (`GET /venues/:id` sends it): the weekday and the clock are read there, so a
 * Toronto phone looking at a Bengaluru venue reads Bengaluru's night. Absent (an older server), it is the phone's.
 */
export function tonightOpening(
  hours: VenueDetail['venue']['hours'],
  dayResetHour: number | null | undefined,
  now: number,
  timeZone?: string | null
): { opensAt: string; closesAt: string } | null {
  if (!Array.isArray(hours)) return null
  const weekday = weekdayIn(new Date(now - (validReset(dayResetHour) ?? 0) * HOUR_MS), timeZone ?? undefined)
  const rows = hours.filter((h) => h && h.day === weekday && typeof h.open === 'string' && typeof h.close === 'string')
  if (rows.length === 0) return null
  const latest = rows.reduce((a, b) => (b.open > a.open ? b : a))
  return { opensAt: latest.open, closesAt: latest.close }
}

/**
 * The page's tiles: Open · Live · Size. Each is drawn only when its field is here, and Live only for a bucket the server
 * tells that shows (a null or under-5 bucket draws nothing, never "0" or "Under 5"). No Reset tile (D6): the day's reset
 * hour is staff's clock in 24-hour time, and Open ("Till 4 AM") already answers the guest's question. Size is words, so
 * it is set in the sans (B-T5: in mono, "people" fell off at AX sizes).
 */
export function venueTiles(detail: Pick<VenueDetail, 'venue' | 'live'>, now: number): TileSpec[] {
  const tiles: TileSpec[] = []
  const hours = detail.venue.hours
  if (Array.isArray(hours) && hours.length > 0) {
    // Hours are given: a weekday with no row, or a night that is over (up to the reset hour), is Closed.
    const timeZone = detail.venue.timezone
    const day = venueDayState(tonightOpening(hours, detail.venue.dayResetHour, now, timeZone), now, validReset(detail.venue.dayResetHour), timeZone)
    tiles.push({ label: 'OPEN', value: day?.state === 'opens' ? `Opens ${day.time}` : day?.state === 'open' ? `Till ${day.time}` : 'Closed', mono: true })
  }
  const liveWord = liveNowWord(detail.live.liveNow)
  if (liveWord) tiles.push({ label: 'LIVE', value: `${liveWord} so far`, mono: false })
  const capacity = detail.venue.capacity
  if (typeof capacity === 'number' && capacity > 0) tiles.push({ label: 'SIZE', value: `${capacity} ${capacity === 1 ? 'person' : 'people'}`, mono: false })
  return tiles
}

/** Good to know: one tile per amenity the owner ticked (the server sends their names); a nameless one is dropped, not drawn blank. */
export function goodToKnow(amenities: VenueDetail['venue']['amenities']): { label: string; value: string }[] {
  return (Array.isArray(amenities) ? amenities : [])
    .map((name) => ({ label: 'GOOD TO KNOW', value: typeof name === 'string' ? name.trim() : '' }))
    .filter((a) => a.value.length > 0)
}

/** "Thu 9 Oct", in the event's own day (admin #749 sends its zone), else the phone's. */
export function dayLabel(iso: string, timeZone?: string | null): string {
  // No year: the Coming up row gives the day a fixed column.
  return calendarDate(iso, { weekday: true, year: false, timeZone: timeZone ?? undefined })
}

/** "9 PM – 1 AM", in the event's own clock, named once at the end when it is not the phone's ("9 PM – 1 AM EDT"). */
export function timeRange(startIso: string, endIso: string, timeZone?: string | null): string {
  const start = Date.parse(startIso)
  const end = Date.parse(endIso)
  if (!Number.isFinite(start)) return ''
  const zone = timeZone ?? undefined
  const range = Number.isFinite(end) ? `${clockTime(start, zone)} – ${clockTime(end, zone)}` : clockTime(start, zone)
  return `${range}${zoneSuffix(start, timeZone)}`
}

/**
 * "Coming up here": the first three show; "See all" is a sheet that pages the rest in (`GET /venues/:id/upcoming`, 20
 * at a time by cursor). `GET /venues/:id` brings the first few and `upcomingTotal`; a server that sends no total
 * leaves the list at what it sent, capped here at `UPCOMING_MAX` so nothing it sends can draw hundreds of rows.
 */
export const UPCOMING_SHOWN = 3
export const UPCOMING_MAX = 20
/** A page of the sheet's list. */
export const UPCOMING_PAGE = 20

/** A coming event: its day, its start in its own clock, named when it is not the phone's ("9 PM", "9 PM IST"), and its title. */
export type UpcomingRow = { id: string; title: string; day: string; time: string }

export function upcomingRows(upcoming: VenueDetail['venue']['upcoming'], max: number = UPCOMING_MAX): UpcomingRow[] {
  return (upcoming ?? [])
    .filter((e) => e.title && dayLabel(e.startTime))
    .slice(0, max)
    .map((e) => ({
      id: e.id,
      title: e.title,
      day: dayLabel(e.startTime, e.timezone),
      time: eventClock(e.startTime, e.timezone),
    }))
}

/** How many events the page can say there are: the server's total, else what it sent. */
export function upcomingCount(venue: Pick<VenueDetail['venue'], 'upcoming' | 'upcomingTotal'>, shownRows: number): number {
  const total = venue.upcomingTotal
  return typeof total === 'number' && Number.isFinite(total) && total >= shownRows ? total : shownRows
}

/** "See all" where there is more than the page shows. */
export const hasMoreThanShown = (count: number): boolean => count > UPCOMING_SHOWN

/** A page appended to what is there, an event never twice (the list can move under a person between pages). */
export function appendUpcoming(have: readonly UpcomingRow[], page: readonly UpcomingRow[]): UpcomingRow[] {
  const seen = new Set(have.map((r) => r.id))
  return [...have, ...page.filter((r) => !seen.has(r.id))]
}

/**
 * The Board row: an event here tonight that has not opened its doors yet (an
 * event's board closes at doors; a venue has no board of its own). The row opens
 * that event's board.
 */
export function boardEventId(tonight: VenueDetail['tonight'], now: number): string | null {
  if (!BOARD_ENABLED || !tonight) return null
  const start = Date.parse(tonight.startTime)
  return Number.isFinite(start) && start > now ? tonight.id : null
}

/** What the dock holds: one slot, by the night and what the venue answers. */
export type DockMode =
  | { kind: 'goLive'; again: GoLiveChoice | null }
  | { kind: 'live' }
  | { kind: 'handoff'; eventId: string }
  | { kind: 'closed'; message: string; reason: string | null }

export function dockMode(action: VenueAction, lastChoice: GoLiveChoice | null): DockMode {
  if (action.kind === 'goLive') return { kind: 'goLive', again: lastChoice }
  return action
}

/** "Go live again · 45 minutes". A "stay" is never repeated in one tap (`oneTapChoice`), so it has no words here. */
export function againLabel(choice: GoLiveChoice): string {
  if ('stay' in choice) return 'Go live again'
  return `Go live again · ${choice.minutes === 60 ? '1 hour' : `${choice.minutes} minutes`}`
}

/** The dial's choice and the API's. */
export const dialChoice = (choice: GoLiveChoice): DialChoice => ('stay' in choice ? 'stay' : choice.minutes)
export const apiChoice = (choice: DialChoice): GoLiveChoice => (choice === 'stay' ? { stay: true } : { minutes: choice })

/** Where the window stands, for the pill and the session sheet. Null with no window to count (yet). */
export function sessionTime(
  live: Pick<VenueDetail['live'], 'expiresAt' | 'stay' | 'stayUntil'>,
  now: number
): SessionTime | null {
  if (live.stay === true) {
    const until = live.stayUntil ? Date.parse(live.stayUntil) : NaN
    return { kind: 'stay', endsBy: Number.isFinite(until) ? clock24(until) : undefined }
  }
  const left = remainingMs(live.expiresAt, now)
  if (left === null) return null
  if (left <= ENDING_MS) return { kind: 'ending', clock: countdownLabel(left), extendUntil: clock24(now + extendMinutes() * MINUTE_MS) }
  return { kind: 'minutes', left: Math.ceil(left / MINUTE_MS), until: clock24(Date.parse(live.expiresAt as string)) }
}

function extendMinutes(): number {
  return 'minutes' in EXTEND_CHOICE ? EXTEND_CHOICE.minutes : 0
}

/**
 * When the clock next needs to read again: each second in the last five
 * minutes, else when the minute count turns (stepped once a minute, never
 * animated between steps); null for a window that is not counting (stay). At
 * zero the page asks the server again on this beat until the window is gone.
 */
export const ZERO_RETRY_MS = 3_000
export function nextTickMs(live: Pick<VenueDetail['live'], 'expiresAt' | 'stay'>, now: number): number | null {
  if (live.stay === true) return null
  const left = remainingMs(live.expiresAt, now)
  if (left === null) return null
  if (left === 0) return ZERO_RETRY_MS
  if (left <= ENDING_MS) return 1000
  const turn = left - (Math.ceil(left / MINUTE_MS) - 1) * MINUTE_MS
  return Math.max(1, turn)
}

/** The time on a live pill, as it is spoken and drawn: "42 min", "staying", "4:59". */
export function timeWords(time: SessionTime): string {
  if (time.kind === 'stay') return 'staying'
  return time.kind === 'minutes' ? `${time.left} min` : time.clock
}

/** The window as it is read aloud: "32 minutes left", "4:59 left, ending soon", "staying". */
export function spokenLeft(time: SessionTime): string {
  if (time.kind === 'stay') return 'staying'
  return time.kind === 'minutes' ? `${time.left} minutes left` : `${time.clock} left, ending soon`
}

/** The hero pill and the dock pill: "You’re live · 42 min", "· staying", "· 4:59". */
export const liveWords = (time: SessionTime | null) => (time ? `You’re live · ${timeWords(time)}` : 'You’re live')

/** The ring around the live card: "Live · 42 min left". */
export function ringWords(time: SessionTime | null): string {
  if (!time) return 'Live'
  if (time.kind === 'stay') return 'Live · staying'
  return `Live · ${time.kind === 'minutes' ? `${time.left} min` : time.clock} left`
}

/** The distance the list handed over in the route (kilometres), or null when it is not a plain positive number. */
export function kmParam(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{1,4}(\.\d{1,3})?$/.test(value)) return null
  const km = Number(value)
  return Number.isFinite(km) ? km : null
}

/** Why the page is not drawn: what the server answered. */
export type VenueGate =
  /** The server's sentence, verbatim: not onboarded, no known adult age. No retry fixes it. */
  | { kind: 'refused'; icon: IconName; title: string; body: string }
  | { kind: 'notFound' }
  | { kind: 'failed' }

/**
 * A read of the place that did not come back, by the server's code. Refusals
 * of the page itself that no retry fixes (not onboarded, no known adult age,
 * no such place) are states with the server's own words; anything else (a
 * timeout, no network, a 5xx) may be gone on the next try.
 */
export function venueGate(errorCode: string | undefined, message: string | undefined): VenueGate {
  if (errorCode === 'NOT_FOUND') return { kind: 'notFound' }
  if (errorCode === 'FORBIDDEN' || errorCode === 'AGE_RESTRICTED') {
    return { kind: 'refused', icon: 'id-card', title: 'Not yet', body: message?.trim() || 'Going live is for people 18 and over who have finished setting up.' }
  }
  return { kind: 'failed' }
}

/** A refusal of Go Live as the Go Live sheet draws it (Flow 11 · 11.2, R4 11-1). */
export type SheetRefusal = { kind: SheetKind; message?: string; title?: string; eventId?: string }

/** Which of the sheet's refusals a Go Live answer is, with the server's own words where it has them. */
export function sheetRefusal(refusal: GoLiveRefusal): SheetRefusal {
  if (refusal.kind === 'plus') return { kind: 'stay' }
  if (refusal.kind === 'handoff') return { kind: 'eventOn', eventId: refusal.eventId, message: refusal.message }
  const { reason, message, title } = refusal
  return reason === 'other' ? { kind: 'other', title, message } : { kind: reason, message }
}

/** "You’re live until 21:50" (24-hour, as Flow 11 writes every live time); a stay has no end to name: it rolls. */
export function liveToast(result: { expiresAt: string; stay?: boolean }): string {
  if (result.stay) return 'You’re live for as long as you’re here'
  const end = Date.parse(result.expiresAt)
  return Number.isFinite(end) ? `You’re live until ${clock24(end)}` : 'You’re live'
}

/** The wash under the hero: the plate's second colour, or (a cover has none) the brewery's, which is the design's own. */
export function washColor(hero: VenueHero): string {
  return hero.kind === 'plate' ? PLATE_PAIRS[hero.plate][1] : PLATE_PAIRS.brewery[1]
}

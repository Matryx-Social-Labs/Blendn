import AsyncStorage from '@react-native-async-storage/async-storage'

import { CHECK_IN_CODES } from './checkInRefusal'
import { Logger } from './logger'

/**
 * Go Live at a place (plan v2 step 5): the windows, the countdown, the expiry
 * prompt's timing, and how a refusal reads. Pure apart from the one remembered
 * session at the bottom, so it runs in a plain node test.
 *
 * **The server owns the clock.** Every countdown here reads `expiresAt` from
 * the server (`GET /venues/:venueId`, `POST /venues/:venueId/live`,
 * `/checkins/active`), never a timer started at the tap: a window extended on
 * another screen, or ended by the sweeper, is only true on the server (PL-CU02).
 */

/** What `POST /venues/:venueId/live` accepts besides where you are. Anything else is a 400. */
export type GoLiveChoice = { minutes: 20 | 45 | 60 } | { stay: true }

/** What the expiry prompt's free extension asks for (Extend 45 min — free). Going live again while live extends, never shortens. */
export const EXTEND_CHOICE: GoLiveChoice = { minutes: 45 }

/** What the expiry prompt's Stay row asks for: Blendn+'s where the server gates it. */
export const STAY_CHOICE: GoLiveChoice = { stay: true }

/** Milliseconds left in a window, never below 0; null with no window to count. */
export function remainingMs(expiresAt: string | null | undefined, now: number): number | null {
  if (!expiresAt) return null
  const end = Date.parse(expiresAt)
  if (Number.isNaN(end)) return null
  return Math.max(0, end - now)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "18:42", or "1:05:09" past an hour. Rounded up, so the last second reads 0:01, not 0:00. */
export function countdownLabel(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** What the place screen offers, from `live` on `GET /venues/:venueId`. */
export type VenueAction =
  | { kind: 'live' }
  | { kind: 'goLive' }
  /** A real event has the place: check in to it instead (`EVENT_LIVE_HERE`). */
  | { kind: 'handoff'; eventId: string }
  /** Going live here would be refused for a reason that is not yours to fix. */
  | { kind: 'closed'; message: string }

/** The dock's sentence when going live is not possible here (Flow 11 `SRV.noArea`). */
export const NO_AREA_MESSAGE = "You can’t go live here yet."

export function venueAction(live: {
  open: boolean
  closedReason: string | null
  eventId: string | null
  youAreLive: boolean
}): VenueAction {
  // Live already: the window stands until it ends, whatever is starting here.
  if (live.youAreLive) return { kind: 'live' }
  if (live.closedReason === 'event_live_here' && live.eventId) return { kind: 'handoff', eventId: live.eventId }
  if (live.open) return { kind: 'goLive' }
  if (live.closedReason === 'no_check_in_area') return { kind: 'closed', message: NO_AREA_MESSAGE }
  return { kind: 'closed', message: "You can’t go live here right now." }
}

/** Codes `POST /venues/:venueId/live` answers with besides the check-in door's (blendn-admin/docs/API.md). */
export const GO_LIVE_CODES = {
  EVENT_LIVE_HERE: 'EVENT_LIVE_HERE',
  PLUS_REQUIRED: 'PLUS_REQUIRED',
  NOT_LIVE: 'NOT_LIVE',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMITED: 'RATE_LIMITED',
  /** Split from OUT_OF_RANGE (Blendn-Admin #641): no position fixes either. */
  NO_CHECK_IN_AREA: 'NO_CHECK_IN_AREA',
  GPS_TOO_VAGUE: 'GPS_TOO_VAGUE',
} as const

/**
 * What a refusal's tray offers besides closing: directions (you are in the
 * wrong place), a retry (a weak fix, a request that never answered), or the
 * way to add your age (`AGE_RESTRICTED` — the one refusal you can fix).
 */
export type RefusalAction = 'directions' | 'retry' | 'add_age'

/** Which of Flow 11's refusal sheets a refusal is drawn on (11-1, 11.2). */
export type RefusalReason = 'notHere' | 'gps' | 'timeout' | 'rate' | 'noArea' | 'age' | 'notFound' | 'other'

export type GoLiveRefusal =
  /** A sheet that sends you to the event's check-in — a state, never an error toast (PL-CU01). */
  | { kind: 'handoff'; eventId: string; message: string }
  /** "Stay" while Blendn+ gates it (`PLUS_REQUIRED`): the paywall, not a failure. */
  | { kind: 'plus' }
  | { kind: 'refused'; reason: RefusalReason; title: string; message: string; offerDirections: boolean; action?: RefusalAction }

const GENERIC = "We couldn’t make you live here. Please try again."

/** "1 minute", "45 seconds" — for a rate limit's wait. */
function waitLabel(seconds: number): string {
  const s = Math.ceil(seconds)
  if (s >= 60) {
    const m = Math.ceil(s / 60)
    return `${m} minute${m > 1 ? 's' : ''}`
  }
  return `${s} second${s > 1 ? 's' : ''}`
}

/**
 * Why Go Live was refused, by the server's code — never by its sentence. The
 * server owns the sentence (it alone knows "You're not at ‹venue› yet."); the
 * app owns what to offer next.
 */
export function goLiveRefusal(
  errorCode: string | undefined,
  serverMessage: string | undefined,
  eventId?: string | null,
  retryAfter?: number
): GoLiveRefusal {
  const message = serverMessage?.trim() || GENERIC
  switch (errorCode) {
    case GO_LIVE_CODES.EVENT_LIVE_HERE:
      return eventId
        ? { kind: 'handoff', eventId, message }
        : { kind: 'refused', reason: 'other', title: 'An event has this place', message, offerDirections: false }
    case GO_LIVE_CODES.PLUS_REQUIRED:
      return { kind: 'plus' }
    case CHECK_IN_CODES.OUT_OF_RANGE:
      return { kind: 'refused', reason: 'notHere', title: 'Not quite there yet', message, offerDirections: true, action: 'directions' }
    case GO_LIVE_CODES.GPS_TOO_VAGUE:
      return { kind: 'refused', reason: 'gps', title: 'GPS signal too weak', message, offerDirections: false, action: 'retry' }
    case GO_LIVE_CODES.NO_CHECK_IN_AREA:
      return { kind: 'refused', reason: 'noArea', title: 'No check-in area here', message, offerDirections: false }
    case CHECK_IN_CODES.AGE_UNKNOWN:
    case CHECK_IN_CODES.AGE_RESTRICTED:
      return { kind: 'refused', reason: 'age', title: 'Not open to you', message, offerDirections: false, action: 'add_age' }
    case CHECK_IN_CODES.PROFILE_INCOMPLETE:
    case GO_LIVE_CODES.FORBIDDEN:
      return { kind: 'refused', reason: 'age', title: 'Finish your profile first', message, offerDirections: false }
    case GO_LIVE_CODES.NOT_FOUND:
      return { kind: 'refused', reason: 'notFound', title: "This place isn’t available", message, offerDirections: false }
    case GO_LIVE_CODES.RATE_LIMITED:
      return {
        kind: 'refused',
        reason: 'rate',
        title: 'Too many tries',
        message: retryAfter && retryAfter > 0 ? `Try again in ${waitLabel(retryAfter)}.` : message,
        offerDirections: false,
      }
    case undefined:
      // No code: a timeout, no network, a 5xx. It may have landed — the caller re-reads.
      return { kind: 'refused', reason: 'timeout', title: "Couldn’t go live", message, offerDirections: false, action: 'retry' }
    default:
      return { kind: 'refused', reason: 'other', title: "Couldn’t go live", message, offerDirections: false }
  }
}

/**
 * What `live:ended` means to the person (blendn-admin/docs/SOCKET_EVENTS.md). Null for an
 * end they made themselves — they know.
 */
export function liveEndedMessage(reason: string, venueName: string | null): string | null {
  const at = venueName ? ` at ${venueName}` : ''
  switch (reason) {
    case 'expired':
      return `You’re no longer live${at}.`
    case 'event_started':
      return `An event just started${at}. Check in to it to join its room.`
    case 'left_area':
      return `You left${venueName ? ` ${venueName}` : ' the place'}, so you’re no longer live.`
    default:
      return null
  }
}

/*
 * The one live session this phone started: which place a venue day belongs to
 * (`/checkins/active` names the day, not the venue, and extending needs the
 * venue) and whether tonight's expiry prompt has been shown. One record: the
 * server allows one open session, and going live elsewhere ends the last.
 * Per account (`userId`), and dropped at sign-out (`clearLiveSession`).
 */
const LIVE_KEY = 'blendn.goLive.session'

export type LiveSession = {
  userId: string
  venueDayId: string
  venueId: string
  venueName: string
  prompted: boolean
  /** The window chosen, so the place offers "Go live again" in one tap (PL-M05). */
  choice?: GoLiveChoice
  /** When that venue day resets (its event's `endTime`, from `/checkins/active`). */
  dayEndsAt?: string
}

/** This account's session, or null — never another account's on a shared phone. */
export async function readLiveSession(userId: string | null | undefined): Promise<LiveSession | null> {
  if (!userId) return null
  try {
    const raw = await AsyncStorage.getItem(LIVE_KEY)
    const session = raw ? (JSON.parse(raw) as LiveSession) : null
    return session?.userId === userId ? session : null
  } catch (error) {
    Logger.warn('events', 'Could not read the live session', { error: String(error) })
    return null
  }
}

/*
 * The venue days this account has gone live on, the last two. The expiry
 * prompt never offers Blendn+ on a person's first Go Live (Flow 11 · 11.4:
 * "never on a first Go Live"), and "first" is the first venue day, not the
 * first window: an extension on the same night is still the first.
 * ponytail: a phone that went live before this was kept counts as new once.
 */
const DAYS_KEY = 'blendn.goLive.days'
type LiveDays = { userId: string; days: string[] }

async function readLiveDays(userId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(DAYS_KEY)
    const parsed = raw ? (JSON.parse(raw) as LiveDays) : null
    return parsed?.userId === userId && Array.isArray(parsed.days) ? parsed.days : []
  } catch (error) {
    Logger.warn('events', 'Could not read the live days', { error: String(error) })
    return []
  }
}

/** A Go Live happened on this venue day. */
export async function noteGoLiveDay(userId: string, venueDayId: string): Promise<void> {
  const days = await readLiveDays(userId)
  if (days[0] === venueDayId) return
  try {
    await AsyncStorage.setItem(DAYS_KEY, JSON.stringify({ userId, days: [venueDayId, ...days.filter((d) => d !== venueDayId)].slice(0, 2) } satisfies LiveDays))
  } catch (error) {
    // Lost, a later night may count as a first one: one fewer offer, never one too many.
    Logger.warn('events', 'Could not remember the live day', { error: String(error) })
  }
}

/** Whether this account went live on some other venue day before `venueDayId`. */
export async function hasGoneLiveBefore(userId: string, venueDayId: string): Promise<boolean> {
  return (await readLiveDays(userId)).some((d) => d !== venueDayId)
}

/** After a Go Live. The same venue day keeps its `prompted`: the prompt shows at most once a night (PL-M02). */
export async function rememberLiveSession(next: Omit<LiveSession, 'prompted'>): Promise<void> {
  const current = await readLiveSession(next.userId)
  const sameDay = current?.venueDayId === next.venueDayId
  await noteGoLiveDay(next.userId, next.venueDayId)
  await writeLiveSession({
    ...next,
    prompted: sameDay ? current.prompted : false,
    dayEndsAt: next.dayEndsAt ?? (sameDay ? current.dayEndsAt : undefined),
  })
}

export async function markLivePrompted(userId: string, venueDayId: string): Promise<void> {
  const current = await readLiveSession(userId)
  if (current?.venueDayId === venueDayId) await writeLiveSession({ ...current, prompted: true })
}

/** The venue day's reset, once the active check-in says it. */
export async function noteLiveDayEnd(userId: string, venueDayId: string, dayEndsAt: string): Promise<void> {
  const current = await readLiveSession(userId)
  if (current?.venueDayId === venueDayId && current.dayEndsAt !== dayEndsAt) await writeLiveSession({ ...current, dayEndsAt })
}

/*
 * When this phone last went live itself, wherever the button was (the place page, the expiry prompt): a "stay" that is
 * not one any more right after is our own doing, not Blend'n+ lapsing (`ownGoLiveWithin`).
 */
let lastOwnGoLiveAt = 0
export function noteOwnGoLive(at: number = Date.now()): void {
  lastOwnGoLiveAt = at
}
export const ownGoLiveWithin = (ms: number): boolean => Date.now() - lastOwnGoLiveAt <= ms

/** The local hour a venue day resets at, from the day's own end (`dayEndsAt`); null until the active check-in has said it. */
export function resetHourOf(session: Pick<LiveSession, 'dayEndsAt'> | null | undefined): number | null {
  const at = session?.dayEndsAt ? new Date(session.dayEndsAt) : null
  return at && !Number.isNaN(at.getTime()) ? at.getHours() : null
}

/** "6", "noon", "1 pm": when tomorrow's room opens, as the room's own sentence says it ("Tomorrow's opens at 6."). */
export function opensAtWords(hour: number): string {
  if (hour === 0) return 'midnight'
  if (hour === 12) return 'noon'
  return hour < 12 ? String(hour) : `${hour - 12} pm`
}

/** At sign-out: the next account on this phone starts with nothing. */
export async function clearLiveSession(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([LIVE_KEY, DAYS_KEY])
  } catch (error) {
    Logger.warn('events', 'Could not clear the live session', { error: String(error) })
  }
}

/**
 * The window "Go live again" repeats in one tap at this place, or null: only
 * the window chosen at this place on its current venue day (tomorrow is a new
 * room), and never "stay" — a window that follows you is a choice to make on
 * purpose, not a reflex (step 5 review, M5).
 */
export function oneTapChoice(session: LiveSession | null, venueId: string, now: number): GoLiveChoice | null {
  if (!session || session.venueId !== venueId || !session.choice || 'stay' in session.choice) return null
  const dayEnd = session.dayEndsAt ? Date.parse(session.dayEndsAt) : NaN
  return Number.isFinite(dayEnd) && dayEnd > now ? session.choice : null
}

async function writeLiveSession(session: LiveSession): Promise<void> {
  try {
    await AsyncStorage.setItem(LIVE_KEY, JSON.stringify(session))
  } catch (error) {
    // Lost, the prompt may show twice or not offer the extension: never worse.
    Logger.warn('events', 'Could not remember the live session', { error: String(error) })
  }
}

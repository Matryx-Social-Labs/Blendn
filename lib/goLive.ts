import AsyncStorage from '@react-native-async-storage/async-storage'

import { CHECK_IN_CODES } from './checkInRefusal'
import { liveNowLabel, type LiveNow } from './home'
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

/** The Go Live sheet, top to bottom. */
export const GO_LIVE_CHOICES: readonly { choice: GoLiveChoice; label: string }[] = [
  { choice: { minutes: 20 }, label: '20 minutes' },
  { choice: { minutes: 45 }, label: '45 minutes' },
  { choice: { minutes: 60 }, label: 'An hour' },
  // The server decides whether "stay" is Blendn+'s (`PLUS_REQUIRED`); today it is everyone's.
  { choice: { stay: true }, label: "Stay while I'm here" },
]

export function choiceLabel(choice: GoLiveChoice): string {
  return GO_LIVE_CHOICES.find((c) => sameChoice(c.choice, choice))?.label ?? ''
}

function sameChoice(a: GoLiveChoice, b: GoLiveChoice): boolean {
  return 'stay' in a ? 'stay' in b : 'minutes' in b && a.minutes === b.minutes
}

/** The expiry prompt shows this long before the window ends. */
export const EXPIRY_PROMPT_LEAD_MS = 5 * 60_000

/** What the expiry prompt's free extension asks for. Going live again while live extends, never shortens. */
export const EXTEND_CHOICE: GoLiveChoice = { minutes: 45 }

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

/** The countdown for a screen reader: whole minutes, never ticking seconds. */
export function countdownSpoken(ms: number): string {
  const minutes = Math.ceil(Math.max(0, ms) / 60_000)
  if (minutes <= 1) return 'Less than a minute left'
  if (minutes < 60) return `${minutes} minutes left`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h} hour${h > 1 ? 's' : ''}${m ? ` ${m} minutes` : ''} left`
}

/**
 * How long until the expiry prompt should show, or null when it never should:
 * no window, a window already over, a "stay" window (it follows the person,
 * so it is not about to end because time passed), or one already asked about
 * tonight. 0 means now.
 */
export function promptDelayMs(
  window: { expiresAt: string | null | undefined; stay: boolean },
  now: number,
  alreadyPrompted: boolean
): number | null {
  if (window.stay || alreadyPrompted) return null
  const left = remainingMs(window.expiresAt, now)
  if (left === null || left === 0) return null
  return Math.max(0, left - EXPIRY_PROMPT_LEAD_MS)
}

/**
 * How many are live here, as the place screen says it. A bucket, never a
 * number (D-19): a count that moved from 4 to 5 as you watched would tell you
 * somebody just walked in. The server's figure never counts the caller, so a
 * person who is live reads it as the others. Null for a viewer the server
 * gives no figure (not onboarded, no known adult age).
 */
export function liveCountLine(bucket: LiveNow | null | undefined, youAreLive: boolean): string | null {
  if (bucket === null) return null
  const label = liveNowLabel(bucket) // "Under 5 live", "5–9 live", …
  if (!youAreLive) return `${label} here`
  return `You and ${label.replace(/ live$/, '').replace(/^Under/, 'under')} others`
}

/** What the place screen offers, from `live` on `GET /venues/:venueId`. */
export type VenueAction =
  | { kind: 'live' }
  | { kind: 'goLive' }
  /** A real event has the place: check in to it instead (`EVENT_LIVE_HERE`). */
  | { kind: 'handoff'; eventId: string }
  /** Going live here would be refused for a reason that is not yours to fix. */
  | { kind: 'closed'; message: string }

export const NO_AREA_MESSAGE = "This place has no check-in area yet, so you can't go live here."

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
  return { kind: 'closed', message: "You can't go live here right now." }
}

/** Codes `POST /venues/:venueId/live` answers with besides the check-in door's (blendn-admin/docs/API.md). */
export const GO_LIVE_CODES = {
  EVENT_LIVE_HERE: 'EVENT_LIVE_HERE',
  PLUS_REQUIRED: 'PLUS_REQUIRED',
  NOT_LIVE: 'NOT_LIVE',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMITED: 'RATE_LIMITED',
} as const

export type GoLiveRefusal =
  /** A sheet that sends you to the event's check-in — a state, never an error toast (PL-CU01). */
  | { kind: 'handoff'; eventId: string; message: string }
  /** "Stay" while Blendn+ gates it: the Plus placeholder, not a failure. */
  | { kind: 'plus' }
  | { kind: 'refused'; title: string; message: string; offerDirections: boolean }

const GENERIC = "We couldn't make you live here. Please try again."

/**
 * Why Go Live was refused, by the server's code — never by its sentence. The
 * server owns the sentence (it alone knows "You're not at ‹venue› yet."); the
 * app owns what to offer next.
 */
export function goLiveRefusal(
  errorCode: string | undefined,
  serverMessage: string | undefined,
  eventId?: string | null
): GoLiveRefusal {
  const message = serverMessage?.trim() || GENERIC
  switch (errorCode) {
    case GO_LIVE_CODES.EVENT_LIVE_HERE:
      return eventId
        ? { kind: 'handoff', eventId, message }
        : { kind: 'refused', title: 'An event has this place', message, offerDirections: false }
    case GO_LIVE_CODES.PLUS_REQUIRED:
      return { kind: 'plus' }
    case CHECK_IN_CODES.OUT_OF_RANGE:
      return { kind: 'refused', title: 'Not quite there yet', message, offerDirections: true }
    case CHECK_IN_CODES.AGE_RESTRICTED:
      return { kind: 'refused', title: 'Not open to you', message, offerDirections: false }
    case GO_LIVE_CODES.FORBIDDEN:
      return { kind: 'refused', title: 'Finish your profile first', message, offerDirections: false }
    case GO_LIVE_CODES.NOT_FOUND:
      return { kind: 'refused', title: "This place isn't available", message, offerDirections: false }
    case GO_LIVE_CODES.RATE_LIMITED:
      return { kind: 'refused', title: 'Too many tries', message, offerDirections: false }
    default:
      return { kind: 'refused', title: "Couldn't go live", message, offerDirections: false }
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
      return `You're no longer live${at}.`
    case 'event_started':
      return `An event just started${at}. Check in to it to join its room.`
    case 'left_area':
      return `You left${venueName ? ` ${venueName}` : ' the place'}, so you're no longer live.`
    default:
      return null
  }
}

/*
 * The one live session this phone started: which place a venue day belongs to
 * (`/checkins/active` names the day, not the venue, and extending needs the
 * venue) and whether tonight's expiry prompt has been shown. One record: the
 * server allows one open session, and going live elsewhere ends the last.
 */
const LIVE_KEY = 'blendn.goLive.session'

export type LiveSession = {
  venueDayId: string
  venueId: string
  venueName: string
  prompted: boolean
  /** The window chosen, so the place offers "Go live again" in one tap (PL-M05). */
  choice?: GoLiveChoice
}

export async function readLiveSession(): Promise<LiveSession | null> {
  try {
    const raw = await AsyncStorage.getItem(LIVE_KEY)
    return raw ? (JSON.parse(raw) as LiveSession) : null
  } catch (error) {
    Logger.warn('events', 'Could not read the live session', { error: String(error) })
    return null
  }
}

/** After a Go Live. The same venue day keeps its `prompted`: the prompt shows at most once a night (PL-M02). */
export async function rememberLiveSession(next: Omit<LiveSession, 'prompted'>): Promise<void> {
  const current = await readLiveSession()
  const prompted = current?.venueDayId === next.venueDayId ? current.prompted : false
  await writeLiveSession({ ...next, prompted })
}

export async function markLivePrompted(venueDayId: string): Promise<void> {
  const current = await readLiveSession()
  if (current?.venueDayId === venueDayId) await writeLiveSession({ ...current, prompted: true })
}

async function writeLiveSession(session: LiveSession): Promise<void> {
  try {
    await AsyncStorage.setItem(LIVE_KEY, JSON.stringify(session))
  } catch (error) {
    // Lost, the prompt may show twice or not offer the extension: never worse.
    Logger.warn('events', 'Could not remember the live session', { error: String(error) })
  }
}

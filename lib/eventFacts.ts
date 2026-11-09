import type { SceneCTAState } from '../components/scene/SceneSections'
import type { IconName } from '../components/ui/Icon'
import { clockIn, dateIn, MONTHS, WEEKDAYS, WEEKDAYS_LONG, eventClock } from './time'

/**
 * The event page's words (Flow 4 E-B, `mockups/redesign-2026-11/flow-4/screens.js`): the date stamp the no-cover poster
 * draws, the guide rows' lines, and the dock's state and one action. Every clock is the event city's, never labelled.
 */

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export type Stamp = { dow: string; dd: string; mon: string; spoken: string }

/** "TUE · 11 · NOV" in the event's own zone, and "Tuesday 11 November" for a screen reader (the board's stamps are text). */
export function dateStamp(time: string | null | undefined, timeZone?: string | null): Stamp | null {
  if (!time) return null
  const d = new Date(time)
  if (Number.isNaN(d.getTime())) return null
  const [y, m, day] = dateIn(d, timeZone ?? undefined)
  const dow = new Date(Date.UTC(y, m, day)).getUTCDay()
  return { dow: WEEKDAYS[dow].toUpperCase(), dd: String(day), mon: MONTHS[m].toUpperCase(), spoken: `${WEEKDAYS_LONG[dow]} ${day} ${MONTHS_LONG[m]}` }
}

/** "Till midnight", "Till 10 PM": the When row's second line. */
export function untilWords(end: string | null | undefined, timeZone?: string | null): string | null {
  if (!end) return null
  const d = new Date(end)
  if (Number.isNaN(d.getTime())) return null
  const [h, min] = clockIn(d, timeZone ?? undefined)
  return h === 0 && min === 0 ? 'Till midnight' : `Till ${eventClock(d, timeZone)}`
}

/** The Where row's distance: "420 m", "4.3 km", "12 km". Null with no fix (the row then says the area alone). */
export function shortDistance(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km) || km < 0) return null
  if (km < 1) return `${Math.round(km * 1000)} m`
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`
}

/** No count under five is printed (the Pulse's rule). */
export const PRINTED_FROM = 5

/**
 * The Who row: "12,480 going · 18+ · Guest list". Exact and grouped, because a page row is not a compact surface
 * (FLOW-WALK Flow 4, decided). The entry facts follow in their own segments: the age floor the organizer set, the door
 * ("Guest list"), and how full it is ("8 spots left"). Under five there is no number; with nothing at all, "Be one of
 * the first".
 */
export function whoLine({ count, word, minAge, door, spots }: { count: number; word: string; minAge: number | null | undefined; door?: string | null; spots?: string | null }) {
  const printed = count >= PRINTED_FROM ? count.toLocaleString('en-US') : null
  const facts = [minAge ? `${minAge}+` : null, door, spots].filter((f): f is string => !!f)
  return { count: printed, word, facts, first: !printed && facts.length === 0 }
}

export type DockDoes = 'rsvp' | 'invite' | 'openRoom' | 'room' | 'tonight' | 'rate'
export type EventDockModel = {
  state: string
  sub?: string
  /** The state is the RSVP's own off-switch (its "Change"). */
  change?: boolean
  /** Checked in: the state's link ("Check out") opens the check-out sheet (option A, SCRUM-1035). */
  checkOut?: boolean
  action?: { label: string; kind: 'primary' | 'lit'; icon?: IconName; does: DockDoes }
}

/**
 * The dock, one line (FLOW-WALK Flow 4, "The dock, in every option"): the state on the left in its own slot, one action
 * on the right. Null at the doors, where the hold (Hold to Blend’n) is the dock. Flow 4b's ticketed rows ("From ₹499",
 * "My ticket") are the same shape and join here when ticketing ships.
 */
export function eventDock(s: {
  cta: SceneCTAState
  /** "Sat 8 Nov · 6 PM". */
  when: string
  /** Before the doors, to somebody going: the room has opened. */
  roomOpen: boolean
  /** The event may be put in a link: Invite is drawn. */
  canInvite: boolean
  /** Between the days of a run, the next door ("Day 3 starts Tue 29 Sep, 9 PM"). */
  between: string | null
  /** Nobody else checked in: rate the night, not people. */
  alone: boolean
}): EventDockModel | null {
  const invite = s.canInvite ? { action: { label: 'Invite', kind: 'lit' as const, icon: 'share' as const, does: 'invite' as const } } : {}
  switch (s.cta) {
    case 'rsvp':
      return { state: 'Free', sub: s.when, action: { label: 'I’m going', kind: 'primary', does: 'rsvp' } }
    case 'rsvpd':
      return s.roomOpen
        ? { state: 'You’re going', sub: s.between ?? 'The room is open', change: true, action: { label: 'Open the room', kind: 'primary', icon: 'door-open', does: 'openRoom' } }
        : { state: 'You’re going', sub: s.between ?? 'Change', change: true, ...invite }
    case 'waitlisted':
      // A full night: nobody is asked to one somebody is still waiting for.
      return { state: 'On the waitlist', sub: 'Change', change: true }
    case 'going':
      return { state: 'You’re in', sub: 'Check out', checkOut: true, action: { label: 'Open the room', kind: 'primary', icon: 'door-open', does: 'room' } }
    case 'rate':
      return { state: 'Ended', sub: s.when, action: { label: s.alone ? 'Rate the night' : 'Rate who you met', kind: 'primary', icon: 'star', does: 'rate' } }
    case 'ended':
      return { state: 'Ended', sub: s.when, action: { label: 'See what’s on tonight', kind: 'lit', icon: 'arrow-up-right', does: 'tonight' } }
    case 'cancelled':
      return { state: 'Cancelled', sub: s.when }
    case 'join':
      return null
  }
}

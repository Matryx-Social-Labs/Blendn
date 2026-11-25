import type { SceneCTAState } from '../components/scene/SceneSections'
import type { IconName } from '../components/ui/Icon'
import { clockIn, dateIn, MONTHS, WEEKDAYS, WEEKDAYS_LONG, eventClock } from './time'
import { compactCount } from './format'
import { distanceText, type DistanceReading } from './placesPane'

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

/** The Where row's distance: "420 m", "4.3 km", "12 km"; "about 4 km" from an approximate fix. Null with no fix (the row then says the area alone). */
export function shortDistance(km: number | null | undefined, reading: DistanceReading): string | null {
  if (km == null || !Number.isFinite(km) || km < 0) return null
  if (reading === 'approximate') return distanceText(km, reading)
  if (km < 1) return `${Math.round(km * 1000)} m`
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`
}

/** No count under five is printed (the Pulse's rule). */
export const PRINTED_FROM = 5

/**
 * The Who row: "12,480 going · 18+ · Guest list". Exact and grouped, because a page row is not a compact surface
 * (FLOW-WALK Flow 4, decided). The entry facts follow in their own segments: the age floor the organizer set, the door
 * ("Guest list"), and how full it is ("8 spots left"). Under five there is no number; with nothing at all, the `lead`
 * says what is true from where you stand (SCRUM-1057 A):
 * - checked in and the count is who is here: "You’re the first here" alone, "You’re one of the first here" with 1–3
 *   others (the server's here count includes you, so 0 or 1 is you alone);
 * - going and the count is who is going: "You’re one of the first going";
 * - after the event: nothing, so the host line stands alone;
 * - otherwise "Be one of the first".
 */
export function whoLine({
  count,
  word,
  minAge,
  door,
  spots,
  viewer = null,
  ended = false,
}: {
  count: number
  word: string
  minAge: number | null | undefined
  door?: string | null
  spots?: string | null
  /** Whether you are in the count: checked in (`here`) or going (`going`). */
  viewer?: 'here' | 'going' | null
  ended?: boolean
}) {
  const printed = count >= PRINTED_FROM ? count.toLocaleString('en-US') : null
  const facts = [minAge ? `${minAge}+` : null, door, spots].filter((f): f is string => !!f)
  const lead = printed || facts.length || ended ? null : firstWords(count, word, viewer)
  return { count: printed, word, facts, lead }
}

function firstWords(count: number, word: string, viewer: 'here' | 'going' | null): string {
  if (viewer === 'here' && word === 'here now') return count <= 1 ? 'You’re the first here' : 'You’re one of the first here'
  if (viewer === 'going' && word === 'going') return 'You’re one of the first going'
  return 'Be one of the first'
}

export type DockDoes = 'rsvp' | 'invite' | 'openRoom' | 'room' | 'tonight' | 'rate'
export type EventDockModel = {
  state: string
  /** The state's own way out, drawn first as a link: "Change" (the RSVP) or "Check out". Always drawn, never a hidden tap (SCRUM-1074). */
  link?: string
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
  /** Live, and this person just said "Can’t make it" here: "Not going", with I’m going to take it back (sheet 05). */
  leftTonight?: boolean
}): EventDockModel | null {
  const invite = s.canInvite ? { action: { label: 'Invite', kind: 'lit' as const, icon: 'share' as const, does: 'invite' as const } } : {}
  switch (s.cta) {
    case 'rsvp':
      return { state: 'Free', sub: s.when, action: { label: 'I’m going', kind: 'primary', does: 'rsvp' } }
    case 'rsvpd':
      return s.roomOpen
        ? { state: 'You’re going', link: 'Change', sub: s.between ?? 'The room is open', change: true, action: { label: 'Open the room', kind: 'primary', icon: 'door-open', does: 'openRoom' } }
        : { state: 'You’re going', link: 'Change', ...(s.between ? { sub: s.between } : {}), change: true, ...invite }
    case 'waitlisted':
      // A full night: nobody is asked to one somebody is still waiting for.
      return { state: 'On the waitlist', link: 'Change', change: true }
    case 'going':
      return { state: 'You’re in', link: 'Check out', checkOut: true, action: { label: 'Open the room', kind: 'primary', icon: 'door-open', does: 'room' } }
    case 'rate':
      return { state: 'Ended', sub: s.when, action: { label: s.alone ? 'Rate the night' : 'Rate who you met', kind: 'primary', icon: 'star', does: 'rate' } }
    case 'ended':
      return { state: 'Ended', sub: s.when, action: { label: 'See what’s on tonight', kind: 'lit', icon: 'arrow-up-right', does: 'tonight' } }
    case 'cancelled':
      return { state: 'Cancelled', sub: s.when }
    case 'join':
      return s.leftTonight ? { state: 'Not going', sub: s.when, action: { label: 'I’m going', kind: 'primary', does: 'rsvp' } } : null
  }
}

/**
 * Under the hold once the doors are open (sheet 05): who is here on the left, and the way off the list on the right, as
 * "Check out" sits under "You’re in". Nothing for somebody who is not on the list: the hold is theirs to take or leave.
 */
export function holdUnder(s: { rsvpStatus: string | null | undefined; hereNow: number }): { left: string | null; link: string } | null {
  if (s.rsvpStatus === 'waitlisted') return { left: 'On the waitlist', link: 'Leave the waitlist' }
  if (s.rsvpStatus !== 'going') return null
  return { left: s.hereNow > 0 ? `${compactCount(s.hereNow)} here now` : null, link: 'Can’t make it' }
}

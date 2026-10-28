import type { SceneCTAState } from '../components/scene/SceneSections'
import { liveWindow, sessionOver, type SessionSource } from './eventSession'

/**
 * The attendance flow's one state model (SCRUM-882; spec: blendn-design-export/plans/ATTENDANCE-FLOW-2026-10-28.md).
 *
 * The Going card, the event page's CTA, the centre disc's fence and the Blend'n pass each used to answer "is it on?"
 * and "what can I do?" on their own: the Going card's "Open Blend'n" read `nextUpLabel(...) === 'Happening now'`, which
 * ignored a cancelled night, and opened the overlay with no event, so Tonight docked no pass unless the fence happened
 * to say you were inside. Every surface reads its state from here, so no two of them can disagree.
 */

export type AttendancePhase = 'upcoming' | 'live' | 'ended' | 'cancelled'

export type PhaseSource = SessionSource & { status?: string | null }

/**
 * Where the event is, by today's session (`liveWindow`: a multi-day run goes by the day the server's door goes by).
 * Cancelled wins over the clock. Live needs a real start and end: the window the door is open in.
 */
export function attendancePhase(e: PhaseSource, now: number = Date.now()): AttendancePhase {
  if (e.status === 'cancelled') return 'cancelled'
  if (sessionOver(e, now)) return 'ended'
  const w = liveWindow(e)
  const start = Date.parse(w.start_time)
  const end = w.end_time ? Date.parse(w.end_time) : NaN
  return Number.isFinite(start) && Number.isFinite(end) && start <= now ? 'live' : 'upcoming'
}

/** The Going "Next up" card's lit button. `pass` docks this event's pass in Blend'n (owner ruling 2026-10-28). */
export type GoingCardAction = { kind: 'directions' | 'pass'; label: string } | { kind: 'none' }

export function goingCardAction(phase: AttendancePhase, checkedInHere: boolean): GoingCardAction {
  if (phase === 'live') return { kind: 'pass', label: checkedInHere ? 'You’re in' : 'Blend in' }
  if (phase === 'upcoming') return { kind: 'directions', label: 'Directions' }
  // Nowhere to go: over, or called off (the row tray already drops Directions for a cancelled night).
  return { kind: 'none' }
}

/**
 * The event page's CTA. Checked in outranks the clock (the server's door opens before the start); before the doors it
 * is the RSVP and its off-switch; after them, the check-in. No RSVP gate on the door: a waitlisted person may blend in.
 */
export function sceneCtaState(s: {
  phase: AttendancePhase
  rsvpStatus: string | null | undefined
  checkedIn: boolean
  attended: boolean
}): SceneCTAState {
  if (s.phase === 'cancelled') return 'cancelled'
  if (s.phase === 'ended') return s.attended ? 'rate' : 'ended'
  if (s.checkedIn) return 'going'
  if (s.phase === 'upcoming') return s.rsvpStatus === 'going' ? 'rsvpd' : s.rsvpStatus === 'waitlisted' ? 'waitlisted' : 'rsvp'
  return 'join'
}

/**
 * Past this the phone is plainly not at the door. Generous on purpose: the server measures the real fence, and a client
 * fix (or the server's ~110 m-rounded distance) must never block a check-in the door would take.
 */
export const TOO_FAR_M = 500

export type PassReach = 'open' | 'far' | 'locationOff'

/** Whether the docked pass's hold is offered: disabled only on evidence (owner ruling 2026-10-28). */
export function passReach(s: { inside: boolean; location: 'on' | 'off' | 'approximate'; distanceM: number | null }): PassReach {
  if (s.inside) return 'open'
  if (s.location === 'off') return 'locationOff'
  if (s.distanceM !== null && s.distanceM > TOO_FAR_M) return 'far'
  return 'open'
}

/** The one short line under a disabled hold; no venue, no distance (owner ruling 2026-10-28). */
export function passReachLine(reach: PassReach): string | null {
  return reach === 'far' ? 'You’re too far away' : reach === 'locationOff' ? 'Location is off' : null
}

import {
  attendancePhase,
  goingCardAction,
  passReach,
  passReachLine,
  sceneCtaState,
  TOO_FAR_M,
} from '../lib/attendanceState'

const NOW = Date.parse('2026-10-28T20:00:00Z')
const iso = (offsetMin: number) => new Date(NOW + offsetMin * 60_000).toISOString()
const tonight = { start_time: iso(-30), end_time: iso(120) }

describe('attendancePhase: one answer to "is it on" for every surface (SCRUM-882)', () => {
  it('is live between today’s start and end', () => {
    expect(attendancePhase(tonight, NOW)).toBe('live')
  })

  it('is upcoming before the start and ended after the end', () => {
    expect(attendancePhase({ start_time: iso(30), end_time: iso(120) }, NOW)).toBe('upcoming')
    expect(attendancePhase({ start_time: iso(-180), end_time: iso(-60) }, NOW)).toBe('ended')
  })

  it('a cancelled night is never live, whatever the clock says', () => {
    expect(attendancePhase({ ...tonight, status: 'cancelled' }, NOW)).toBe('cancelled')
  })

  it('a multi-day run goes by today’s session, not the run', () => {
    const run = { start_time: iso(-3 * 24 * 60), end_time: iso(2 * 24 * 60) }
    // Between days: the session is tomorrow's.
    expect(attendancePhase({ ...run, session: { start_time: iso(20 * 60), end_time: iso(24 * 60) } }, NOW)).toBe('upcoming')
    expect(attendancePhase({ ...run, session: tonight }, NOW)).toBe('live')
    // Every day cancelled: the server sends null, which reads as ended.
    expect(attendancePhase({ ...run, session: null }, NOW)).toBe('ended')
  })
})

describe('goingCardAction: the Next up card’s lit button follows the state', () => {
  it('before the doors it is Directions', () => {
    expect(goingCardAction('upcoming', false)).toEqual({ kind: 'directions', label: 'Directions' })
  })

  it('while live it is Blend in, the event page’s verb, and docks this event’s pass', () => {
    expect(goingCardAction('live', false)).toEqual({ kind: 'pass', label: 'Blend in' })
  })

  it('checked in here it says so, and still docks this event (the overlay shows its room)', () => {
    expect(goingCardAction('live', true)).toEqual({ kind: 'pass', label: 'You’re in' })
  })

  it('no lit action on a night that is over or called off', () => {
    expect(goingCardAction('ended', false).kind).toBe('none')
    expect(goingCardAction('cancelled', false).kind).toBe('none')
    // Never "Open Blend’n" on a cancelled night happening now (the old HAPPENING_NOW test ignored status).
    expect(goingCardAction(attendancePhase({ ...tonight, status: 'cancelled' }, NOW), false).kind).toBe('none')
  })
})

describe('sceneCtaState: the event page CTA from the same phase', () => {
  const at = (phase: Parameters<typeof sceneCtaState>[0]['phase'], over: Partial<Parameters<typeof sceneCtaState>[0]> = {}) =>
    sceneCtaState({ phase, rsvpStatus: null, checkedIn: false, attended: false, ...over })

  it('before the doors it is the RSVP and its off-switch', () => {
    expect(at('upcoming')).toBe('rsvp')
    expect(at('upcoming', { rsvpStatus: 'going' })).toBe('rsvpd')
    expect(at('upcoming', { rsvpStatus: 'waitlisted' })).toBe('waitlisted')
  })

  it('after a cancel (rsvpStatus null) it is the RSVP again, not "You’re going" (SCRUM-881)', () => {
    expect(at('upcoming', { rsvpStatus: null })).toBe('rsvp')
  })

  it('live: Blend in, or You’re in once checked in', () => {
    expect(at('live')).toBe('join')
    expect(at('live', { rsvpStatus: 'waitlisted' })).toBe('join')
    expect(at('live', { checkedIn: true })).toBe('going')
  })

  it('ended: rate if you were there, else tonight; cancelled wins over everything', () => {
    expect(at('ended', { attended: true })).toBe('rate')
    expect(at('ended')).toBe('ended')
    expect(at('cancelled', { checkedIn: true, rsvpStatus: 'going' })).toBe('cancelled')
  })
})

describe('passReach: the docked pass is disabled only on evidence (owner ruling 2026-10-28)', () => {
  it('inside the fence the hold is open', () => {
    expect(passReach({ inside: true, location: 'on', distanceM: 5_000 })).toBe('open')
  })

  it('location off: disabled, "Location is off"', () => {
    expect(passReach({ inside: false, location: 'off', distanceM: null })).toBe('locationOff')
    expect(passReachLine('locationOff')).toBe('Location is off')
  })

  it('a fix well away: disabled, "You’re too far away"', () => {
    expect(passReach({ inside: false, location: 'on', distanceM: TOO_FAR_M + 1 })).toBe('far')
    expect(passReachLine('far')).toBe('You’re too far away')
  })

  it('no fix, or near the door, leaves the server to judge: open', () => {
    expect(passReach({ inside: false, location: 'on', distanceM: null })).toBe('open')
    expect(passReach({ inside: false, location: 'on', distanceM: 180 })).toBe('open')
    expect(passReachLine('open')).toBeNull()
  })
})

describe('the Going tab and the Pulse read the same phase', () => {
  it('a cancelled night happening now is not under "Happening now" (isLiveNow)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isLiveNow } = require('../lib/goingSections') as typeof import('../lib/goingSections')
    expect(isLiveNow(tonight, NOW)).toBe(true)
    expect(isLiveNow({ ...tonight, status: 'cancelled' }, NOW)).toBe(false)
  })
})

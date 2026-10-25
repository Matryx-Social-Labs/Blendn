import { liveEndedState } from '../lib/chatLiveEnded'

const venue = { venueName: 'Toit' }

describe('each live:ended reason has its own calm state', () => {
  it('words all five reasons the server sends, each differently, and names the place', () => {
    const states = ['expired', 'event_started', 'switched_event', 'manual', 'left_area'].map((r) => liveEndedState(r, venue))
    expect(new Set(states.map((s) => s.title)).size).toBe(5)
    expect(liveEndedState('event_started', venue).title).toBe('An event just started at Toit')
    expect(liveEndedState('left_area', venue).title).toBe('You left Toit')
    expect(liveEndedState('manual', venue).body).toBe('You left Toit’s room. Go live again any time you’re here.')
  })

  it('an event starting hands off to the place, not to going live again', () => {
    expect(liveEndedState('event_started', venue).action.kind).toBe('seeWhatsOn')
  })

  it('switching to another place goes back; there is no "go live again" here', () => {
    expect(liveEndedState('switched_event', venue).action.kind).toBe('back')
  })

  it('an expiry past the venue day’s reset is the day closing; before it, the window running out', () => {
    const dayEndsAt = '2026-10-23T00:30:00.000Z'
    const closed = liveEndedState('expired', { ...venue, dayEndsAt, now: Date.parse(dayEndsAt) + 1 })
    expect(closed.title).toBe('Today’s room has closed')
    // No hour of the app's own: the reset is the venue's.
    expect(closed.body).toBe('Today’s room has closed. A new day starts now. Go live to join it.')
    expect(closed.body).not.toMatch(/\d/)
    expect(closed.action.kind).toBe('goLive')
    expect(liveEndedState('expired', { ...venue, dayEndsAt, now: Date.parse(dayEndsAt) - 1 }).title).toBe('Not live here any more')
  })

  it('the plain state and an expiry inside the day are one sentence', () => {
    expect(liveEndedState(undefined, venue)).toEqual(liveEndedState('expired', venue))
  })

  it('an unknown reason, or none, is the plain not-live state with Go live again', () => {
    for (const reason of [undefined, null, 'something_new']) {
      const s = liveEndedState(reason, venue)
      expect(s.title).toBe('Not live here any more')
      expect(s.action.kind).toBe('goLive')
    }
  })

  it('falls back to "this place" with no name', () => {
    expect(liveEndedState('left_area').title).toBe('You left this place')
  })
})

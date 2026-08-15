import {
  roomButtonAccessibilityLabel,
  roomButtonLabel,
  roomButtonPulses,
  pickInsideEvent,
  pickTodayEvents,
  roomButtonTarget,
  type RoomButtonEvent,
  type RoomButtonState,
} from '../lib/roomButton'

/**
 * The middle of the tab bar, which is the most visible control in the app.
 *
 * It exists because a static tab could not carry the room: `MatchScreen` is the
 * room roster and it sat behind a permanent Match tab rendering "Not Checked In
 * Yet" almost always. A quarter of the navigation on a screen that says come
 * back when you are somewhere else.
 */

describe('roomButtonTarget — precedence', () => {
  it('is live when you are checked in', () => {
    expect(roomButtonTarget({ activeEventId: 'e1' })).toEqual({
      state: 'live',
      eventId: 'e1',
      badge: 0,
    })
  })

  it('keeps you in the room you are in, even standing in another fence', () => {
    /*
     * Not hypothetical: two venues on one street, or a fence drawn generously,
     * puts you inside B's circle while checked into A. Offering "check in" here
     * would drop somebody out of the room they are actually in, from a nav
     * button, mid-event.
     */
    expect(roomButtonTarget({ activeEventId: 'a', insideEventId: 'b' }).state).toBe('live')
    expect(roomButtonTarget({ activeEventId: 'a', insideEventId: 'b' }).eventId).toBe('a')
  })

  it('offers check-in over a reminder about the same night', () => {
    // Standing at the door beats being reminded about the thing you are
    // standing at the door of.
    const t = roomButtonTarget({ insideEventId: 'e2', todayEventIds: ['e2', 'e3'] })
    expect(t.state).toBe('checkin')
    expect(t.eventId).toBe('e2')
  })

  it('points at the soonest thing you said you were going to', () => {
    const t = roomButtonTarget({ todayEventIds: ['soon', 'later'] })
    expect(t).toEqual({ state: 'today', eventId: 'soon', badge: 0 })
  })

  it('falls back to idle with somewhere real to go', () => {
    // The state that decides whether this control works. A centre button with
    // nothing behind it is a dead control in the most prominent position.
    expect(roomButtonTarget({})).toEqual({ state: 'idle', eventId: null, badge: 0 })
    expect(roomButtonTarget({ todayEventIds: [] }).state).toBe('idle')
  })
})

describe('roomButtonTarget — badge', () => {
  it('carries the room unread count when live', () => {
    expect(roomButtonTarget({ activeEventId: 'e1', roomUnread: 4 }).badge).toBe(4)
  })

  it('never shows a badge outside the room', () => {
    // There is no room, so there is nothing unread in one. A badge here would
    // point at a screen that does not exist yet.
    expect(roomButtonTarget({ insideEventId: 'e1', roomUnread: 9 }).badge).toBe(0)
    expect(roomButtonTarget({ todayEventIds: ['e1'], roomUnread: 9 }).badge).toBe(0)
    expect(roomButtonTarget({ roomUnread: 9 }).badge).toBe(0)
  })

  it('refuses counts that are not counts', () => {
    expect(roomButtonTarget({ activeEventId: 'e1', roomUnread: -2 }).badge).toBe(0)
    expect(roomButtonTarget({ activeEventId: 'e1', roomUnread: 2.7 }).badge).toBe(2)
    expect(roomButtonTarget({ activeEventId: 'e1' }).badge).toBe(0)
  })
})

describe('the label names where the tap goes', () => {
  it('has a short word for every state', () => {
    const states: RoomButtonState[] = ['live', 'checkin', 'today', 'idle']
    for (const s of states) {
      const label = roomButtonLabel(s)
      expect(label.length).toBeGreaterThan(0)
      // A nav label that wraps in a tab slot is a nav label nobody reads.
      expect(label.length).toBeLessThanOrEqual(10)
    }
  })

  it('says Room rather than Live', () => {
    // "Live" states what is true; "Room" states where the tap goes, and a nav
    // label's job is the second one.
    expect(roomButtonLabel('live')).toBe('Room')
  })
})

describe('pulsing is rationed', () => {
  it('only pulses when something is time-critical', () => {
    expect(roomButtonPulses('live')).toBe(true)
    expect(roomButtonPulses('checkin')).toBe(true)
  })

  it('does not pulse when nothing is happening', () => {
    /*
     * An idle button that pulses is an app tugging at somebody for no reason,
     * and the cost is not the annoyance — it is that the pulse stops meaning
     * anything on the night it does.
     */
    expect(roomButtonPulses('today')).toBe(false)
    expect(roomButtonPulses('idle')).toBe(false)
  })
})

describe('the spoken label states the consequence', () => {
  it('warns that checking in puts you on a roster', () => {
    // Two of the four states take an action rather than navigate. Being added
    // to a list other people can see should never be a surprise from a nav
    // button.
    expect(roomButtonAccessibilityLabel({ state: 'checkin', eventId: 'e', badge: 0 })).toMatch(
      /who else is here/i
    )
  })

  it('counts the unread messages, in the right plural', () => {
    expect(roomButtonAccessibilityLabel({ state: 'live', eventId: 'e', badge: 1 })).toContain(
      '1 unread message'
    )
    expect(roomButtonAccessibilityLabel({ state: 'live', eventId: 'e', badge: 3 })).toContain(
      '3 unread messages'
    )
  })

  it('says nothing about unread when there is none', () => {
    expect(roomButtonAccessibilityLabel({ state: 'live', eventId: 'e', badge: 0 })).toBe(
      'Open the room'
    )
  })
})

/*
 * Which event the button is about.
 *
 * Both of these are the difference between a control that means something and
 * one that points at whatever happened to be in an array.
 */

const HOUR = 3_600_000
const iso = (ms: number) => new Date(ms).toISOString()

describe('pickInsideEvent', () => {
  // 3pm local on a fixed day, so "today" never depends on when tests run.
  const now = new Date(2026, 9, 24, 15, 0, 0).getTime()

  const running = (over: Partial<RoomButtonEvent> = {}): RoomButtonEvent => ({
    id: 'e',
    start_time: iso(now - HOUR),
    end_time: iso(now + HOUR),
    distance: 0.05, // 50 m
    check_in_radius: 100,
    ...over,
  })

  it('finds the event you are standing in', () => {
    expect(pickInsideEvent([running()], now)).toBe('e')
  })

  it('converts kilometres to metres', () => {
    /*
     * `distance` is km and `check_in_radius` is m. Comparing them directly
     * makes a 50 m radius pass at 50 km, and that exact mismatch has already
     * shipped once in this codebase — the proximity gate compared metres to
     * kilometres.
     */
    expect(pickInsideEvent([running({ distance: 0.2 })], now)).toBeNull()
    expect(pickInsideEvent([running({ distance: 0.09 })], now)).toBe('e')
  })

  it('ignores an event that has not started', () => {
    // Standing outside a venue at noon for a thing at nine is not a check-in
    // opportunity, and offering one would put somebody on a roster hours early.
    expect(pickInsideEvent([running({ start_time: iso(now + HOUR) })], now)).toBeNull()
  })

  it('ignores an event that has finished', () => {
    expect(pickInsideEvent([running({ end_time: iso(now - 1) })], now)).toBeNull()
  })

  it('treats a missing end time as still running', () => {
    expect(pickInsideEvent([running({ end_time: null })], now)).toBe('e')
  })

  it('picks the nearer centre when two fences overlap', () => {
    // Two venues on one street. The nearer centre is the better guess at which
    // building somebody is actually standing in.
    const near = running({ id: 'near', distance: 0.02 })
    const far = running({ id: 'far', distance: 0.08 })
    expect(pickInsideEvent([far, near], now)).toBe('near')
  })

  it('says nothing without a fix', () => {
    // No `distance` means no location was sent. Absent is not close.
    expect(pickInsideEvent([running({ distance: null })], now)).toBeNull()
    expect(pickInsideEvent([running({ distance: undefined })], now)).toBeNull()
    expect(pickInsideEvent([], now)).toBeNull()
  })

  it('defaults a missing radius rather than letting everything in', () => {
    expect(pickInsideEvent([running({ check_in_radius: null, distance: 0.05 })], now)).toBe('e')
    expect(pickInsideEvent([running({ check_in_radius: null, distance: 0.5 })], now)).toBeNull()
  })
})

describe('pickTodayEvents', () => {
  const now = new Date(2026, 9, 24, 15, 0, 0).getTime()
  const tonight = new Date(2026, 9, 24, 21, 0, 0).getTime()
  const later = new Date(2026, 9, 24, 23, 0, 0).getTime()
  const tomorrow = new Date(2026, 9, 25, 21, 0, 0).getTime()

  const saved = (id: string, startMs: number, over: Partial<RoomButtonEvent> = {}) => ({
    id,
    start_time: iso(startMs),
    end_time: iso(startMs + 3 * HOUR),
    is_favorited: true,
    ...over,
  })

  it('returns tonight, soonest first', () => {
    const out = pickTodayEvents([saved('late', later), saved('early', tonight)], now)
    expect(out).toEqual(['early', 'late'])
  })

  it('only counts what you saved', () => {
    /*
     * Every event in the city is not "yours". A button pointing at whatever
     * happens to be on tonight is a recommendation wearing the clothes of a
     * reminder.
     */
    expect(pickTodayEvents([saved('x', tonight, { is_favorited: false })], now)).toEqual([])
  })

  it('drops tomorrow', () => {
    expect(pickTodayEvents([saved('t', tomorrow)], now)).toEqual([])
  })

  it('drops what already finished', () => {
    // An event that ended at lunch is not something to be reminded about at
    // three in the afternoon.
    const lunch = new Date(2026, 9, 24, 12, 0, 0).getTime()
    expect(pickTodayEvents([saved('done', lunch, { end_time: iso(lunch + HOUR) })], now)).toEqual([])
  })

  it('keeps one that started and is still going', () => {
    const started = new Date(2026, 9, 24, 14, 0, 0).getTime()
    expect(pickTodayEvents([saved('live', started)], now)).toEqual(['live'])
  })

  it('ignores unreadable dates rather than throwing', () => {
    expect(pickTodayEvents([{ id: 'bad', start_time: 'nope', is_favorited: true }], now)).toEqual([])
  })
})

import { DISC_FRAMES, discLook } from '../components/ds/discMotion'
import { roundCoordinate } from '../lib/coordinates'
import { getDistanceMetres } from '../lib/geo'
import { readFileSync } from 'fs'
import { join } from 'path'

import {
  roomButtonAccessibilityLabel,
  roomButtonGlow,
  pickInsideEvent,
  pickTodayEvents,
  roomButtonTarget,
  fixOf,
  type RoomButtonEvent,
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

describe('the glow carries the checked-in state on its own', () => {
  /*
   * The Pulse's "You're checked in" strip is gone -- a section header, a
   * carousel and a Check out pill, about a third of the first screen, to say
   * one bit. The button says it now, which makes these the tests that stop the
   * bit from being lost.
   */
  it('tells being in a room apart from standing outside one', () => {
    /*
     * The failure this exists to catch: a mark that only says "something is
     * happening" looks identical whether you are checked in or merely near a
     * door. That was survivable while the strip named the
     * event and is not now.
     */
    expect(roomButtonGlow('live')).toBe('live')
    expect(roomButtonGlow('checkin')).toBe('invite')
    expect(roomButtonGlow('live')).not.toBe(roomButtonGlow('checkin'))
  })

  it('stays dark when you are in no room', () => {
    expect(roomButtonGlow('today')).toBe('none')
    expect(roomButtonGlow('idle')).toBe('none')
  })
})

describe('the live state is a still dot, not a glow', () => {
  /*
   * The bar's disc is the redesign's (components/ds/Disc, Flow 4 T1–T10): the
   * states are still frames, so each reads in a screenshot and with Reduce
   * Motion on. Motion cannot carry a state.
   */
  const bar = readFileSync(join(__dirname, '..', 'app/(tabs)/_layout.tsx'), 'utf8')
  const disc = readFileSync(join(__dirname, '..', 'components/ds/Disc.tsx'), 'utf8')

  it('the bar draws the redesign disc, not its own button', () => {
    expect(bar).toContain('<TabBar')
    expect(bar).toMatch(/disc=\{\{ target, onPress: \(\) => openBlendn\(\)/)
    expect(bar).not.toContain('const RoomButton')
  })

  it('draws nothing on a loop', () => {
    expect(disc).not.toContain('withRepeat')
    expect(disc).not.toContain('Animated.loop')
  })

  it('tells being in a room apart from standing outside one: a green dot, a hollow ring', () => {
    expect(DISC_FRAMES[discLook({ state: 'live', eventId: 'e', badge: 0 })]).toMatchObject({ dot: 1, hollow: 0 })
    expect(DISC_FRAMES[discLook({ state: 'checkin', eventId: 'e', badge: 0 })]).toMatchObject({ dot: 0, hollow: 1 })
  })
})

describe('the Pulse no longer carries the checked-in strip', () => {
  const pulse = readFileSync(join(__dirname, '..', 'app/(tabs)/events.tsx'), 'utf8')

  it('has dropped the carousel and its header', () => {
    expect(pulse).not.toContain("You're checked in")
    expect(pulse).not.toContain('renderCheckedInCarousel')
  })

  it('did not take check out with it', () => {
    /*
     * The strip held the only one-tap check out, and `handleCheckOut` had gone
     * caller-less once before -- which cost three taps through the event detail
     * screen and is why the strip was added in the first place. Two callers
     * now: the long-press tray here, and the Blend'n room's top bar (through
     * `useRoomControls`, which calls `checkOutOf`). The room's asks first
     * now — one stray tap closed the room — but it is still one tray away.
     */
    expect(pulse).toContain("label: 'Check out'")
    // And asks first, like the room's, before `handleCheckOut` runs.
    expect(pulse).toContain('title: `Check out of ${event.title}?`')
    expect(pulse).toContain('void handleCheckOut(event)')
    const blendn = readFileSync(join(__dirname, '..', 'components/blendn/BlendnScreen.tsx'), 'utf8')
    expect(blendn).toContain('onPress={() => setConfirmingOut(true)}')
    expect(blendn).toMatch(/label: 'Check out', kind: 'destructive'[\s\S]*?void checkOut\(\)/)
    expect(readFileSync(join(__dirname, '..', 'lib/useRoomControls.ts'), 'utf8')).toContain(
      'checkOutOf(eventId)'
    )
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

  describe('the precise fix, not the rounded one (SCRUM-744)', () => {
    /*
     * The server measures `distance` from the lat/lon in the URL, which the phone rounds to three decimals (~110 m,
     * `lib/coordinates.ts`). Against a 100 m fence that is a missed offer for somebody 78 m inside and a false one for
     * somebody 155 m out. `serverKm` below is exactly what the server would compute from the rounded position.
     */
    const serverKm = (fix: { latitude: number; longitude: number }, at: { latitude: number; longitude: number }) =>
      getDistanceMetres(roundCoordinate(fix.latitude), roundCoordinate(fix.longitude), at.latitude, at.longitude) / 1000

    const door = { latitude: 12.97, longitude: 77.59 }
    const inside = { latitude: 12.9693, longitude: 77.59, accuracy: 15, timestamp: now - 5_000 } // 78 m south of the door; rounds to 111 m
    const outside = { latitude: 12.9745, longitude: 77.5945, accuracy: 15, timestamp: now - 5_000 } // 155 m from the other event; rounds to 78 m
    const farDoor = { latitude: 12.9755, longitude: 77.5955 }

    it('offers check-in to somebody 78 m inside whom the rounded distance puts outside', () => {
      const e = running({ ...door, distance: serverKm(inside, door) })
      expect(e.distance! * 1000).toBeGreaterThan(100)
      expect(pickInsideEvent([e], now)).toBeNull() // no fix handed over: the server's number, as before
      expect(pickInsideEvent([e], now, inside)).toBe('e')
    })

    it('does not offer it to somebody 155 m out whom the rounded distance puts inside', () => {
      const e = running({ ...farDoor, distance: serverKm(outside, farDoor) })
      expect(e.distance! * 1000).toBeLessThan(100)
      expect(pickInsideEvent([e], now)).toBe('e')
      expect(pickInsideEvent([e], now, outside)).toBeNull()
    })

    it('uses the server’s distance for an event with no real coordinates, and for no fix', () => {
      expect(pickInsideEvent([running({ distance: 0.05 })], now, outside)).toBe('e')
      expect(pickInsideEvent([running({ latitude: 0, longitude: 0, distance: 0.05 })], now, outside)).toBe('e')
      expect(pickInsideEvent([running({ ...farDoor, distance: 0.05 })], now, null)).toBe('e')
      expect(pickInsideEvent([running({ ...farDoor, distance: null })], now, null)).toBeNull()
    })

    it('a coarse, unknown-accuracy or approximate fix is not used: the server’s distance stands', () => {
      const e = running({ ...door, distance: serverKm(inside, door) }) // rounded: 111 m, outside
      const fix = (over: object) => ({ ...inside, ...over })
      expect(pickInsideEvent([e], now, fix({ accuracy: 100 }))).toBe('e') // exactly the zone radius: used
      expect(pickInsideEvent([e], now, fix({ accuracy: 101 }))).toBeNull() // coarser than the zone
      expect(pickInsideEvent([e], now, fix({ accuracy: 1500 }))).toBeNull()
      expect(pickInsideEvent([e], now, fix({ accuracy: null }))).toBeNull()
      expect(pickInsideEvent([e], now, { latitude: inside.latitude, longitude: inside.longitude })).toBeNull()
      expect(pickInsideEvent([e], now, fix({ approximate: true }))).toBeNull() // iOS reduced accuracy, even with a small number
    })

    it('a fix older than 120 s is not used, whoever handed it over; 120 s exactly still is (review: age at the root)', () => {
      const e = running({ ...door, distance: serverKm(inside, door) }) // rounded: 111 m, outside
      expect(pickInsideEvent([e], now, { ...inside, timestamp: now - 120_000 })).toBe('e')
      expect(pickInsideEvent([e], now, { ...inside, timestamp: now - 121_000 })).toBeNull()
      expect(pickInsideEvent([e], now, { ...inside, timestamp: null })).toBeNull() // an unknown age is not trusted
      expect(pickInsideEvent([e], now, { latitude: inside.latitude, longitude: inside.longitude, accuracy: 15 })).toBeNull()
      // A fresh, good fix is used.
      expect(pickInsideEvent([e], now, { ...inside, timestamp: now - 1_000 })).toBe('e')
    })

    it('fixOf carries the accuracy and the time of a position', () => {
      expect(fixOf({ coords: { latitude: 1, longitude: 2, accuracy: 7 }, timestamp: 99 })).toEqual({ latitude: 1, longitude: 2, accuracy: 7, timestamp: 99 })
    })

    it('a fix is judged against the zone’s own radius: 60 m accuracy suits a 100 m zone, not a 50 m one', () => {
      const small = running({ ...door, check_in_radius: 50, distance: 0.04 })
      expect(pickInsideEvent([small], now, { ...door, accuracy: 60, timestamp: now })).toBe('e') // falls back to the server's 40 m
      const wide = running({ ...door, check_in_radius: 100, distance: 0.2 })
      expect(pickInsideEvent([wide], now, { ...door, accuracy: 60, timestamp: now })).toBe('e') // fix used: 0 m
    })

    it('the nearer centre still wins when two fences overlap', () => {
      const near = running({ id: 'near', latitude: 12.97, longitude: 77.59, check_in_radius: 200 })
      const far = running({ id: 'far', latitude: 12.9702, longitude: 77.59, check_in_radius: 200 })
      expect(pickInsideEvent([far, near], now, { latitude: 12.97, longitude: 77.5899, accuracy: 10, timestamp: now })).toBe('near')
    })
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

describe('the callers hand the centre button the precise fix (SCRUM-744)', () => {
  const read = (file: string) => readFileSync(join(__dirname, '..', file), 'utf8')

  it('the Pulse (both pages) and Tonight publish with the phone’s own position', () => {
    const pulse = read('app/(tabs)/events.tsx')
    expect(pulse).toMatch(/publishRoomSignal\(normalized, Date\.now\(\), latestFixRef\.current && \{ \.\.\.latestFixRef\.current, approximate: approximateRef\.current \}\)/)
    expect(pulse).toMatch(/publishRoomSignal\(merged, Date\.now\(\), latestFixRef\.current && \{ \.\.\.latestFixRef\.current, approximate: approximateRef\.current \}\)/)
    expect(read('lib/useTonight.ts')).toMatch(/publishRoomSignal\(result\.data, Date\.now\(\), coords\)/)
  })

  it('the Tonight read asks for a fresh, accurate last-known fix and keeps its accuracy and time', () => {
    const tonight = read('lib/useTonight.ts')
    expect(tonight).toMatch(/getLastKnownPositionAsync\(\{ maxAge: FIX_MAX_AGE_MS, requiredAccuracy: FIX_REQUIRED_ACCURACY_M \}\)/)
    expect(tonight).toMatch(/\.\.\.fixOf\(last\), approximate: location === 'approximate'/)
    expect(read('lib/roomButton.ts')).toMatch(/FIX_MAX_AGE_MS = 120_000/)
  })

  it('the Pulse sets every position through fixOf (accuracy and time), asks for fresh last-known fixes, and says when the grant is approximate', () => {
    const pulse = read('app/(tabs)/events.tsx')
    expect(pulse).not.toMatch(/setUserLocation\(\{/)
    expect(pulse.match(/setUserLocation\(/g)?.length).toBeGreaterThan(2)
    expect(pulse).not.toMatch(/getLastKnownPositionAsync\(\)/)
    expect(pulse.match(/getLastKnownPositionAsync\(\{ maxAge: FIX_MAX_AGE_MS \}\)/g)).toHaveLength(2)
    expect(pulse).toMatch(/approximate: approximateRef\.current/)
    expect(pulse).toMatch(/ios\?\.accuracy === 'reduced'/)
  })

  it('publishRoomSignal judges inside from the fix it is given', () => {
    const { publishRoomSignal, getRoomSignal, clearRoomSignal } = require('../lib/roomSignal') as typeof import('../lib/roomSignal')
    const now = new Date(2026, 9, 24, 15, 0, 0).getTime()
    const event = {
      id: 'door',
      start_time: iso(now - HOUR),
      end_time: iso(now + HOUR),
      latitude: 12.97,
      longitude: 77.59,
      check_in_radius: 100,
      distance: 0.111, // what a position rounded to 12.969 measures
    }
    clearRoomSignal()
    publishRoomSignal([event], now)
    expect(getRoomSignal().insideEventId).toBeNull()
    publishRoomSignal([event], now, { latitude: 12.9693, longitude: 77.59, accuracy: 15, timestamp: now })
    expect(getRoomSignal().insideEventId).toBe('door')
    clearRoomSignal()
  })
})

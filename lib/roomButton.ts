/**
 * What the Blend'n button in the middle of the bar is currently offering.
 *
 * This control exists because the app has two mutually exclusive modes — you are
 * either looking for an event or you are in one — and a static tab has to
 * pretend the second is always available. It did: `MatchScreen` sat behind a
 * permanent Match tab and rendered "Not Checked In Yet" roughly all the time.
 *
 * So the centre is the **mode switch**, and because the mode is bound to time
 * and place it doubles as the status indicator. Four states, and every one of
 * them goes somewhere real. A centre button with nothing behind it would be a
 * dead control in the most prominent position on the screen.
 *
 * Pure, because this decides the most visible thing in the app and it is driven
 * by a geofence, a clock and a network call — three things that are awkward to
 * reproduce by hand and easy to get subtly wrong.
 */

export type RoomButtonState =
  /** Checked in. The room is live and one tap away. */
  | 'live'
  /** Standing inside the fence and not checked in — the moment that matters most. */
  | 'checkin'
  /** Something today you said you are going to, but you are not there yet. */
  | 'today'
  /** Nothing on. Tapping offers what is happening tonight. */
  | 'idle'

export interface RoomButtonInput {
  /** The event you are checked into, if any. */
  activeEventId?: string | null
  /**
   * An event whose geofence you are currently inside, per `lib/presence.ts`.
   *
   * Must come from `presenceAction`'s hysteresis rather than a fresh distance
   * check. A raw `isInside()` flickers on GPS noise, and this button flickering
   * between "check in" and "nothing on" while somebody stands still is worse
   * than it being slow to notice them arrive.
   */
  insideEventId?: string | null
  /** Events today you have saved or RSVP'd to, soonest first. */
  todayEventIds?: readonly string[]
  /** Unread messages in the live room. Shown only in `live`. */
  roomUnread?: number
}

export interface RoomButtonTarget {
  state: RoomButtonState
  /** The event the tap concerns, when there is one. */
  eventId: string | null
  /** Badge count, or 0 for none. */
  badge: number
}

/**
 * The button's state, and what a tap is about.
 *
 * Ordered by immediacy, not by importance, and the first two are the ones that
 * must not be reordered:
 *
 * **`live` outranks `checkin`.** Being checked into one event while standing
 * inside another's fence is a real situation — two venues on one street, or a
 * fence drawn generously. Offering to check in somewhere else while you are in
 * a room would drop you out of the room you are actually in.
 *
 * **`checkin` outranks `today`.** Standing at the door beats a reminder about
 * the thing you are standing at the door of.
 */
export function roomButtonTarget(input: RoomButtonInput): RoomButtonTarget {
  if (input.activeEventId) {
    return {
      state: 'live',
      eventId: input.activeEventId,
      badge: Math.max(0, Math.floor(input.roomUnread ?? 0)),
    }
  }

  if (input.insideEventId) {
    return { state: 'checkin', eventId: input.insideEventId, badge: 0 }
  }

  const next = input.todayEventIds?.[0]
  if (next) return { state: 'today', eventId: next, badge: 0 }

  return { state: 'idle', eventId: null, badge: 0 }
}

/**
 * The label under the button.
 *
 * Short enough not to wrap at the width of a tab slot, and it names the
 * *destination* rather than the state. "Live" tells you what is true; "Room"
 * tells you where the tap goes, and a nav label's job is the second one.
 */
export function roomButtonLabel(state: RoomButtonState): string {
  switch (state) {
    case 'live':
      return 'Room'
    case 'checkin':
      return 'Check in'
    case 'today':
      return 'Tonight'
    case 'idle':
      return "What's on"
  }
}

/**
 * Should the button draw attention to itself?
 *
 * Only the two states that are time-critical. An idle button that pulses is an
 * app tugging at somebody for no reason, and the cost is that the pulse stops
 * meaning anything on the night it does.
 */
export function roomButtonPulses(state: RoomButtonState): boolean {
  return state === 'live' || state === 'checkin'
}

/**
 * What a screen reader hears.
 *
 * States the consequence, because two of these four take an action rather than
 * navigate: `checkin` puts you on a roster that other people can see, and that
 * should never be a surprise from a nav button.
 */
export function roomButtonAccessibilityLabel(target: RoomButtonTarget): string {
  switch (target.state) {
    case 'live':
      return target.badge > 0
        ? `Open the room. ${target.badge} unread ${target.badge === 1 ? 'message' : 'messages'}`
        : 'Open the room'
    case 'checkin':
      return "You're at an event. Check in to see who else is here"
    case 'today':
      return "Open tonight's event"
    case 'idle':
      return "See what's on near you"
  }
}

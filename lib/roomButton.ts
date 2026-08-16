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
 * How the button glows — and it is two different things, not one at two volumes.
 *
 * The Pulse used to carry a **"You're checked in"** carousel: a section header,
 * a horizontal strip of cards and a Check out pill, roughly 200pt of the first
 * screen, to say one bit of information. It is gone, and this is where that bit
 * went.
 *
 * Which puts a real requirement on the glow. `roomButtonPulses` is true for both
 * `live` and `checkin`, so as long as the glow is *only* a breath, the button
 * looks identical whether you are in a room or merely standing outside one —
 * fine while the carousel said which, and not fine once it is the only signal.
 *
 *     invite  a breath, and nothing else    "there is a room here, come in"
 *     live    a breath around a steady ring "you are in it"
 *
 * The **ring is the status and the breath is the invitation**, and that split is
 * deliberate: motion cannot carry a state. It is invisible in a screenshot, to
 * anybody who has turned motion off at the OS level, and to anybody who simply
 * is not looking at the moment it swells. A ring that is always there is legible
 * at a glance and survives all three.
 */
export type RoomButtonGlow = 'none' | 'invite' | 'live'

export function roomButtonGlow(state: RoomButtonState): RoomButtonGlow {
  if (state === 'live') return 'live'
  if (state === 'checkin') return 'invite'
  return 'none'
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

/* -------------------------------------------------------------------------- */
/* Picking the events the button is about                                      */
/* -------------------------------------------------------------------------- */

/** The fields these need. Anything shaped like a `BlendnEvent` satisfies it. */
export interface RoomButtonEvent {
  id: string
  start_time: string
  end_time?: string | null
  /** Kilometres, from the server, present only when a fix was sent. */
  distance?: number | null
  check_in_radius?: number | null
  is_favorited?: boolean
}

/**
 * The event you are standing inside, if any.
 *
 * Only events that are **running right now** count. Standing outside a venue at
 * noon for a thing that starts at nine is not a check-in opportunity, and
 * offering one would put somebody on a roster hours before the doors open.
 *
 * `distance` is kilometres and `check_in_radius` is metres — the units differ
 * and the mismatch has bitten this codebase before, so the conversion happens
 * here rather than at a call site.
 *
 * **No margin.** `lib/presence.ts` widens the fence generously in the other
 * direction because a false *eviction* is harmful; a false *offer* to check in
 * is not — the server re-validates the GPS on the actual check-in and refuses
 * it. So this asks the plain question and lets the real gate be the gate.
 */
export function pickInsideEvent(
  events: readonly RoomButtonEvent[],
  now: number = Date.now()
): string | null {
  let best: { id: string; distanceM: number } | null = null

  for (const e of events) {
    if (typeof e.distance !== 'number' || !Number.isFinite(e.distance)) continue
    const radiusM = typeof e.check_in_radius === 'number' ? e.check_in_radius : 100
    const distanceM = e.distance * 1000
    if (distanceM > radiusM) continue

    const start = new Date(e.start_time).getTime()
    if (!Number.isFinite(start) || start > now) continue
    const end = e.end_time ? new Date(e.end_time).getTime() : NaN
    if (Number.isFinite(end) && end < now) continue

    // Two fences can overlap on one street. The nearer centre is the better
    // guess at which building somebody is actually in.
    if (!best || distanceM < best.distanceM) best = { id: e.id, distanceM }
  }

  return best?.id ?? null
}

/**
 * Events today you said you were going to, soonest first.
 *
 * **Saved only.** Every event in the city is not "yours", and a button that
 * pointed at whatever happens to be on tonight would be a recommendation
 * wearing the clothes of a reminder.
 *
 * Today in local time, and ending after now — an event that finished at lunch
 * is not something to be reminded about at nine.
 */
export function pickTodayEvents(
  events: readonly RoomButtonEvent[],
  now: number = Date.now()
): string[] {
  const today = new Date(now)
  return events
    .filter((e) => {
      if (!e.is_favorited) return false
      const start = new Date(e.start_time)
      if (Number.isNaN(start.getTime())) return false
      if (
        start.getFullYear() !== today.getFullYear() ||
        start.getMonth() !== today.getMonth() ||
        start.getDate() !== today.getDate()
      ) {
        return false
      }
      const end = e.end_time ? new Date(e.end_time).getTime() : NaN
      return Number.isFinite(end) ? end >= now : true
    })
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .map((e) => e.id)
}

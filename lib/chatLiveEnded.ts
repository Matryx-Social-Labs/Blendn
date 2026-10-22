import type { IconName } from '../components/ui/Icon'

/**
 * Every `live:ended` reason gets its own calm state in the place's room (Flow 11 · 11.5, R4.1 "Every live:ended reason,
 * its own calm state"), so none of them reads as the same generic refusal. The socket carries `{ eventId, reason }`
 * (blendn-admin docs/SOCKET_EVENTS.md): `expired` (the window ran out, or the venue's day reset: the room's own
 * end time tells which), `event_started`, `switched_event`, `manual`, `left_area`. An unknown reason, or a room
 * refused with no reason at all (`NOT_LIVE` on a read), is the plain "not live here any more".
 *
 * The sentences are the server's where it has them (`NOT_LIVE_MESSAGE`, the daily reset) and the design's proposals
 * otherwise. `lib/goLive.ts`'s `liveEndedMessage` keeps its toast wording for the three it words; this is the room's.
 */
export type LiveEndedAction = 'goLive' | 'seeWhatsOn' | 'back'

export type LiveEndedState = {
  icon: IconName
  title: string
  body: string
  action: { label: string; kind: LiveEndedAction }
}

export type LiveEndedFacts = {
  /** The place's name, from the room's row. */
  venueName?: string | null
  /** The venue day's end (its daily reset), when known: an `expired` past it is the day closing. */
  dayEndsAt?: string | null
  now?: number
}

const NOT_LIVE_BODY = 'You’re not live here any more. Go live at the venue to join today’s room.'
const RESET_BODY = 'Today’s room has closed. Tomorrow’s opens at 6.'

const GO_LIVE_AGAIN = { label: 'Go live again', kind: 'goLive' as const }

export function liveEndedState(reason: string | null | undefined, facts: LiveEndedFacts = {}): LiveEndedState {
  const at = facts.venueName?.trim() || 'this place'
  const dayEnds = facts.dayEndsAt ? Date.parse(facts.dayEndsAt) : NaN
  const dayClosed = Number.isFinite(dayEnds) && (facts.now ?? Date.now()) >= dayEnds
  switch (reason) {
    case 'event_started':
      return {
        icon: 'calendar',
        title: `An event just started at ${at}`,
        body: 'It’s on here now. Check in to it to be seen here.',
        action: { label: 'See what’s on here', kind: 'seeWhatsOn' },
      }
    case 'expired':
      return dayClosed
        ? { icon: 'moon', title: 'Today’s room has closed', body: RESET_BODY, action: { label: 'Back to Places', kind: 'back' } }
        : { icon: 'hourglass', title: 'Not live here any more', body: NOT_LIVE_BODY, action: GO_LIVE_AGAIN }
    case 'switched_event':
      return {
        icon: 'shuffle',
        title: 'You went live somewhere else',
        body: `Going live somewhere else ended your time at ${at}. One place at a time.`,
        action: { label: 'Back to Banter', kind: 'back' },
      }
    case 'left_area':
      return {
        icon: 'map-pin',
        title: `You left ${at}`,
        body: 'Your phone stopped seeing you inside, so your live time ended. Go live again when you’re back.',
        action: GO_LIVE_AGAIN,
      }
    case 'manual':
      return {
        icon: 'log-out',
        title: 'You ended it',
        body: `You left ${at}’s room. Go live again any time you’re here.`,
        action: GO_LIVE_AGAIN,
      }
    default:
      return { icon: 'radio', title: 'You’re not live here any more', body: 'Today’s room is for the people live at this place. Go live there again to rejoin it.', action: GO_LIVE_AGAIN }
  }
}

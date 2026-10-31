/**
 * The words around leaving one room for another and around checking out (SCRUM-970): one place, so the event page and
 * Tonight cannot drift apart. A name that is missing reads as "your other event" / "this event", never as a gap.
 */
export const SWITCH_LABEL = 'Hold to switch'
export const CHECK_OUT_LABEL = 'Hold to check out'
export const OPEN_ROOM_LABEL = 'Open the room'

const named = (name: string | null | undefined, fallback: string): string => name?.trim() || fallback

/** Under "Hold to switch", and its screen-reader hint: who you leave, and that the hold checks you in here. */
export const switchCaption = (current: string | null | undefined): string => `Leaves ${named(current, 'your other event')} and checks you in here.`

/** Under "Hold to check out", and its hint. */
export const checkOutCaption = (event: string | null | undefined): string => `Checks you out of ${named(event, 'this event')}.`

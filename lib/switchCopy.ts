/**
 * The words around leaving one room for another and around checking out (SCRUM-970): one place, so the event page and
 * Tonight cannot drift apart. A name that is missing reads as "your other event" / "this event", never as a gap.
 */
export const SWITCH_LABEL = 'Hold to switch'
export const CHECK_OUT_LABEL = 'Hold to check out'
/** The hold's busy words once held to the end, as the check-in's "Checking you in…". */
export const CHECKING_OUT_LABEL = 'Checking you out…'
export const OPEN_ROOM_LABEL = 'Open the room'

const named = (name: string | null | undefined, fallback: string): string => name?.trim() || fallback

/** Under "Hold to switch", and its screen-reader hint: who you leave, and that the hold checks you in here. */
export const switchCaption = (current: string | null | undefined): string => `Leaves ${named(current, 'your other event')} and checks you in here.`

/** Under "Hold to check out", and its hint. */
/** Every way out asks the same question (audit A-2): the event page's sheet, the room's ⋯ and the Events list's ⋯. */
export const checkOutQuestion = (event: string | null | undefined): string => `Check out of ${named(event, 'this event')}?`
/** What checking out costs, said wherever it is asked. */
export const CHECK_OUT_CONSEQUENCE = 'You’ll leave the room and its people. To come back in you’ll need to check in again, with your location.'
/** The quiet way back from the check-out question. */
export const STAY_LABEL = 'Stay'
export const checkOutCaption = (event: string | null | undefined): string => `Checks you out of ${named(event, 'this event')}.`
/** Said to a screen reader once a check-out lands: the sheet has closed and its link is gone, so nothing else says it. */
export const checkedOutLine = (event: string | null | undefined): string => `Checked out of ${named(event, 'this event')}.`

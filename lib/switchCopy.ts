/**
 * The words around leaving one room for another and around checking out (SCRUM-970): one place, so the event page and
 * Tonight cannot drift apart. A name that is missing reads as "your other event" / "this event", never as a gap.
 */
export const SWITCH_LABEL = 'Hold to switch'
export const CHECK_OUT_LABEL = 'Hold to check out'
/** The check-in hold's busy words once held to the end, the VenuePass's own default (Flow 4 R4-1 #05: the fill stays full while the server is asked). */
export const CHECKING_IN_LABEL = 'Checking you in…'
/** The hold's busy words once held to the end, as the check-in's. */
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

/*
 * Stopping being live at a place (the venue page: the live pill's End and the dock's Leave). It is a check-out of the
 * place's venue day, so it is asked the way Check out is: the question, what it costs, the neutral hold, Stay (buttons
 * board C, owner 2026-11-17: leaving is not a yes). The words are the place's own ("live"), as the pill and Go live say.
 */
export const STOP_LIVE_LABEL = 'Hold to stop being live'
export const STOPPING_LIVE_LABEL = 'Stopping…'
export const stopLiveQuestion = (place: string | null | undefined): string => `Stop being live at ${named(place, 'this place')}?`
export const STOP_LIVE_CONSEQUENCE = 'You leave today’s room at that second. Go live again any time you’re here.'
/** Under "Hold to stop being live", and its hint. */
export const stopLiveCaption = (place: string | null | undefined): string => `Ends your live time at ${named(place, 'this place')}.`

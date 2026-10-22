/**
 * An event hidden because its organiser was suspended (Flow 15 #10, blendn-admin #716 SCRUM-749): a 404 whose `errorCode` stays
 * `NOT_FOUND` and whose `reasonCode` is `ORGANISER_SUSPENDED`, on every route that refuses the event: the detail, the check-in,
 * the room chat, the crews. One sentence for all of them, so no screen says "not open yet" or "didn't load" about a thing that is
 * gone.
 */
export const ORGANISER_SUSPENDED = 'ORGANISER_SUSPENDED'

export const NO_LONGER_AVAILABLE = {
  title: 'No longer available',
  body: 'This event was taken down. Anything you saved or said has gone with it, and nothing was shared.',
  /** For a line or a toast, where the card's two do not fit. */
  line: 'No longer available. This event was taken down.',
} as const

/** Whether a refused response says the organiser was suspended, by its code, never by its sentence. */
export const isOrganiserSuspended = (failure: { reasonCode?: string } | null | undefined): boolean => failure?.reasonCode === ORGANISER_SUSPENDED

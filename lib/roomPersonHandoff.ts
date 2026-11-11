/**
 * The room's card for a person, handed to their full profile page (Flow 5 P-A, `pA-page`).
 *
 * `GET /users/:handle` answers an anonymous person with only their pseudonym, age, city and tonight block, so the lead
 * pills and In common come from the room's own deck card, the same data the person sheet drew. Passed in memory, never
 * through route params: a link can carry params, and a crafted one must not be able to put "Here to hire" on somebody.
 * Keyed by the room handle the page opens, so it is only ever the card of the person on the page; a cold open (a link,
 * a restart) finds none, and the page shows what the server sent.
 */
import type { LensPerson, RoomLens } from './roomLens'

export interface RoomPersonCard {
  person: LensPerson & { age?: number | null; tonightAnswer?: string | null }
  lens: RoomLens | null
}

// ponytail: one slot, the last card opened; the page reads it once on mount, so a later open cannot change a page already up.
let handed: { ref: string; card: RoomPersonCard } | null = null

export function handRoomPerson(ref: string, card: RoomPersonCard): void {
  handed = { ref, card }
}

/** The card handed for exactly this ref, or null. */
export function roomPersonFor(ref: string | undefined): RoomPersonCard | null {
  return ref && handed?.ref === ref ? handed.card : null
}

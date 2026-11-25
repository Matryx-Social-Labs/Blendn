/**
 * A crew's member opened from its room or its page: the room card (`/user/[id]`) for their handle. The server answers a
 * handle with the first name and `identityVisible: false` (SV-20), and the page titles it with the name it is given here,
 * so there is no photo and no bio to show (OD-8). `scope` seeds the creature the way the room's bubbles do.
 */
export const roomCardRoute = (person: { id: string; name: string }, scope: string) =>
  ({ pathname: '/user/[id]', params: { id: person.id, pseudonym: person.name, roomSeed: `${scope}:${person.id}` } }) as const

/**
 * Whose members open the room card rather than the in-room card: a crew's, and a Blend's (SCRUM-901). Both answer a handle
 * with a name (a Blend's the pseudonym, never a photo or bio); an event's room keeps its card over the feed.
 */
export const opensRoomCard = (roomKind: string | null | undefined): boolean => roomKind === 'crew' || roomKind === 'blend'

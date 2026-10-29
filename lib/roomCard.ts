/**
 * A crew's member opened from its room or its page: the room card (`/user/[id]`) for their handle. The server answers a
 * handle with the first name and `identityVisible: false` (SV-20), and the page titles it with the name it is given here,
 * so there is no photo and no bio to show (OD-8). `scope` seeds the creature the way the room's bubbles do.
 */
export const roomCardRoute = (person: { id: string; name: string }, scope: string) =>
  ({ pathname: '/user/[id]', params: { id: person.id, pseudonym: person.name, roomSeed: `${scope}:${person.id}` } }) as const

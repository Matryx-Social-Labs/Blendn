/**
 * What the Banter list says about a room the person can read but not post in.
 *
 * A mute silences; it does not banish (SCRUM-178). The server now lists a
 * muted membership and a locked room, and says which on the row; this is the
 * one line the list shows in place of the last message, because "the room is
 * here and you cannot post" needs a reason before anybody taps into it and
 * finds the composer refusing.
 */
export type RoomState = 'muted' | 'locked' | null

export function roomStateFrom(room: { membership?: { status?: string } | null; status?: string }): RoomState {
  if (room.membership?.status === 'muted') return 'muted'
  if (room.status === 'locked') return 'locked'
  return null
}

export function roomStateLine(state: RoomState): string | null {
  if (state === 'muted') return 'Muted — you can read, not post'
  if (state === 'locked') return 'Locked by the organiser — read only'
  return null
}

/**
 * What the Banter list says about a room the person can read but not post in.
 *
 * A mute silences; it does not banish (SCRUM-178). The server lists a muted
 * membership and says so on the row; this is the one line the list shows in
 * place of the last message, because "the room is here and you cannot post"
 * needs a reason before anybody taps into it and finds the composer refusing.
 * There is no organizer lock (SCRUM-893): a room's `locked` status, which
 * nothing writes, says nothing here.
 */
import type { Face } from '../components/ds/Facepile'
import { markSeed } from './pseudonymAvatar'
import type { EventChatData } from './apiClient'

export type RoomState = 'muted' | null

export function roomStateFrom(room: { membership?: { status?: string } | null; status?: string }): RoomState {
  if (room.membership?.status === 'muted') return 'muted'
  return null
}

export function roomStateLine(state: RoomState): string | null {
  if (state === 'muted') return 'Muted — you can read, not post'
  return null
}

/**
 * Your own face in a room (ROOM-01, flow4.js `room()`: `you = vis==='anon'||'blocked' ? {creature} : JF.you`).
 *
 * Named: your photo, if you have one. Anonymous: ALWAYS the creature, even when the server has not said the
 * pseudonym yet. A photo under "Nobody here sees your name or photo" is the one lie this room must never tell.
 */
export function myRoomFace(input: { revealed: boolean; photo: string | null; pseudonym: string | null; eventId: string | null }): Face {
  if (input.revealed && input.photo) return { kind: 'photo', uri: input.photo }
  return { kind: 'creature', pseudonym: input.pseudonym ?? markSeed('You', input.eventId ?? 'room') }
}

/** `you.pseudonym` from `GET /events/:id/chat` (SV-3). Absent on an older server. */
export function pseudonymFromDoor(data: EventChatData | null | undefined): string | null {
  const name = data?.you?.pseudonym
  return typeof name === 'string' && name.trim() ? name.trim() : null
}

/** `write.closesAt` from `GET /events/:id/chat`: when the room's chat closes. */
export function closesAtFromDoor(data: EventChatData | null | undefined): string | null {
  const at = data?.write?.closesAt
  return typeof at === 'string' && at ? at : null
}

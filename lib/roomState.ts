/**
 * What the Banter list says about a room the person can read but not post in.
 *
 * A mute silences; it does not banish (SCRUM-178). The server now lists a
 * muted membership and a locked room, and says which on the row; this is the
 * one line the list shows in place of the last message, because "the room is
 * here and you cannot post" needs a reason before anybody taps into it and
 * finds the composer refusing.
 */
import type { Face } from '../components/ds/Facepile'
import { markSeed } from './pseudonymAvatar'

export type RoomState = 'muted' | 'locked' | null

export function roomStateFrom(room: { membership?: { status?: string } | null; status?: string }): RoomState {
  if (room.membership?.status === 'muted') return 'muted'
  if (room.status === 'locked') return 'locked'
  return null
}

export function roomStateLine(state: RoomState): string | null {
  if (state === 'muted') return 'Muted — you can read, not post'
  if (state === 'locked') return 'Locked by the organizer — read only'
  return null
}

/**
 * Whether room `roomId` in a `GET /chat/groups` payload is locked by its organiser: read-only for everyone until it is
 * reopened. The room opens on this (TG-02); before, the lock was learnt only from a send it refused, so a locked room
 * opened with a live composer. Its own status, not `roomStateFrom`: a mute must not hide a lock.
 */
export function roomLockedIn(payload: unknown, roomId: string): boolean {
  const data = payload as Record<string, unknown> | unknown[] | null
  if (!data) return false
  const lists = Array.isArray(data) ? [data] : [data.groups, data.rooms, data.data].filter(Array.isArray)
  const rows = (lists as Record<string, unknown>[][]).flat()
  const room = rows.find((g) => String(g.id ?? g.chat_room_id ?? g.chatRoomId ?? '') === roomId)
  return room?.status === 'locked'
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

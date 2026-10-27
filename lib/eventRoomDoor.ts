import { apiClient } from './apiClient'
import { Logger } from './logger'
import { isOrganiserSuspended, NO_LONGER_AVAILABLE } from './noLongerAvailable'
import { notOpenYetAt, opensInLabelAt, opensInSpoken } from './preEventRoom'
import { markRoomLeft } from './roomMembership'
import { serverOffset } from './serverClock'

/**
 * Where an event's room is, asked of the server (`GET /events/:id/chat`): the one lookup behind every "Open the room"
 * outside the chat screen (the Blend'n overlay, the Scene's room line, R6-5).
 *
 * - `route`: open the chat with these params. A room not open yet, to someone entitled, carries the server's `opensAt` and
 *   `eventId` (the chat counts down to it); one you left opens on its Rejoin.
 * - `say`: no room to open; the sentence that says why (taken down, or when it opens).
 */
export type EventRoomDoor = { kind: 'route'; params: Record<string, string> } | { kind: 'say'; line: string }

export async function eventRoomDoor(eventId: string, eventTitle: string): Promise<EventRoomDoor> {
  const named = { roomName: eventTitle || 'Event chat', eventTitle }
  let gone = false
  let opensAt: string | null = null
  try {
    const r = await apiClient.getEventChat(eventId)
    gone = isOrganiserSuspended(r)
    opensAt = notOpenYetAt(r)
    if (opensAt && r.chatGroupId) return { kind: 'route', params: { id: r.chatGroupId, ...named, eventId, opensAt } }
    const id = r.success ? (r.data?.chatGroupId ?? r.data?.id) : null
    if (id) return { kind: 'route', params: { id: String(id), ...named } }
    // Left it: the chat opens on "You left this room" and its Rejoin.
    if (r.errorCode === 'LEFT_ROOM' && r.chatGroupId) {
      markRoomLeft(r.chatGroupId)
      return { kind: 'route', params: { id: r.chatGroupId, ...named } }
    }
  } catch (e) {
    Logger.warn('chat', 'room chat lookup failed', { error: e })
  }
  // With no room to open yet, when it opens is still said, not "not open" alone.
  const opensIn = opensAt ? opensInLabelAt(opensAt, Date.now() + serverOffset()) : null
  return {
    kind: 'say',
    line: gone ? NO_LONGER_AVAILABLE.line : opensIn ? `The room opens in ${opensInSpoken(opensIn)}.` : 'The chat for this event is not open yet.',
  }
}

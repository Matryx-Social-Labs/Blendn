import { isLiveRoomChat } from './blendnOverlay'
import { badgeCount } from './lobby'

/**
 * The room's two tabs (Flow 5 C1, R-A): People and Chat, one place. Which one
 * an entry opens is `openBlendn` (People, the disc) or `openRoomChat` (Chat:
 * "Open the room", a push, a link, the Lobby handover) in `blendnOverlay.ts`.
 */
export type RoomTab = 'people' | 'chat'

/**
 * Whether `chat/[id]` is the live room's own chat, so it opens as the
 * overlay's Chat tab. A crew's, a Blend's and a board post's room are their
 * own screens; so is any event's room but the one you are in now.
 */
export function chatOpensInRoom(room: { id: string; kind?: string | null; eventId?: string | null }): boolean {
  if (room.kind && room.kind !== 'event') return false
  return isLiveRoomChat(room.id)
}

/** The Chat tab's unread badge: exact to 9, then "9+"; nothing at 0. */
export const chatTabBadge = (unread: number): string | null => (unread > 0 ? badgeCount(unread) : null)

/** The Chat tab as a screen reader says it: "Chat, 9 or more new" past 9. */
export function chatTabLabel(unread: number): string {
  if (unread <= 0) return 'Chat'
  return unread > 9 ? 'Chat, 9 or more new' : `Chat, ${unread} new`
}

import { apiClient } from './apiClient'
import { getLiveEventId, isLiveRoomChat, setLiveHint, setLiveRoomChat } from './blendnOverlay'
import { settleWithin } from './fetchTimeout'
import { activeRoomName } from './leftRooms'
import { badgeCount } from './lobby'
import { Logger } from './logger'
import { roomUnreadFrom } from './roomUnread'

/**
 * The room's two tabs (Flow 5 C1, R-A): People and Chat, one place. Which one
 * an entry opens is `openBlendn` (People, the disc) or `openRoomChat` (Chat:
 * "Open the room", a push, a link, the Lobby handover) in `blendnOverlay.ts`.
 */
export type RoomTab = 'people' | 'chat'

/**
 * Whether `chat/[id]` is the live room's own chat, so it opens as the
 * overlay's Chat tab. A crew's, a Blend's and a board post's room are their
 * own screens; so is any event's room but the one you are in now. A link that names neither the live chat nor
 * the event (a bare `chat/<id>` before the Room has opened this session) stays the chat screen.
 */
export function chatOpensInRoom(room: { id: string; kind?: string | null; eventId?: string | null }): boolean {
  if (room.kind && room.kind !== 'event') return false
  // With the overlay closed the Room has not said its chat: the event you are checked in to says which room is yours.
  return isLiveRoomChat(room.id) || (!!room.eventId && room.eventId === getLiveEventId())
}

/** Whether a room of this kind can be the live room's: an event's, or a room that does not say. */
export const mayBeLiveRoom = (kind: string | null | undefined): boolean => !kind || kind === 'event'

/**
 * `chatOpensInRoom`, asking the server for what the app does not know yet (SCRUM-1049). Cold, a link or a push reaches
 * `chat/[id]` before the tab bar has read your check-in and before the Room has said its chat, so both checks above read
 * "no room" and your own room opened as a screen. Your check-in names the event (and seeds the hint, as the event page
 * does cold); a link that names no event is matched by the room's id in your chat list, the row the disc's unread reads.
 * Both reads are the cached ones the tab bar makes anyway. Anything that does not answer is the chat screen, as before.
 */
export function resolveChatOpensInRoom(room: { id: string; kind?: string | null; eventId?: string | null }): Promise<boolean> {
  if (!mayBeLiveRoom(room.kind)) return Promise.resolve(false)
  if (chatOpensInRoom(room)) return Promise.resolve(true)
  // Nothing is drawn while it asks: a slow network gets the chat screen rather than a blank one.
  return settleWithin(askWhetherLiveRoom(room), ROOM_ASK_MS, false)
}

/** How long a chat link waits to learn whether it is your room before it opens as the chat screen. */
export const ROOM_ASK_MS = 2500

async function askWhetherLiveRoom(room: { id: string; eventId?: string | null }): Promise<boolean> {
  try {
    const checkIns = await apiClient.getActiveCheckins()
    const active = checkIns?.success ? (checkIns.data?.checkIns?.[0] ?? null) : null
    if (!active) return false
    setLiveHint(active.eventId, activeRoomName(active))
    if (room.eventId) return room.eventId === active.eventId
    const groups = await apiClient.getChatGroups()
    const live = groups?.success ? roomUnreadFrom(groups.data, active.eventId) : null
    if (live) setLiveRoomChat(live.chatGroupId)
    return live?.chatGroupId === room.id
  } catch (error) {
    Logger.debug('navigation', 'which room a chat link is: no answer, opened as a screen', { error })
    return false
  }
}

/** The Chat tab's unread badge: exact to 9, then "9+"; nothing at 0. */
export const chatTabBadge = (unread: number): string | null => (unread > 0 ? badgeCount(unread) : null)

/** The Chat tab as a screen reader says it: "Chat, 9 or more new" past 9. */
export function chatTabLabel(unread: number): string {
  if (unread <= 0) return 'Chat'
  return unread > 9 ? 'Chat, 9 or more new' : `Chat, ${unread} new`
}

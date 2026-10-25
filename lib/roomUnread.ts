import { apiClient } from './apiClient'
import { Logger } from './logger'

/**
 * The live room's unread count, for the disc (Flow 4 T3, "(d) with an unread count").
 *
 * The truth is the server's `unreadCount` on the chat list, and only that: read through the cached
 * `getChatGroups()` on the bar's 30 s tick, and forced (`refresh(true)`) only when the answer is
 * known to have moved: the Room closed, the app came back, the chat was left. No socket and no
 * guessing between reads. A local +1 from the socket counted a message the person was reading in
 * the chat, and a concert room of 5,000 would have made every phone listen to every line.
 */
export interface RoomUnread {
  chatGroupId: string
  unread: number
}

/** The event's room in a `GET /chat/groups` payload: its id and unread (never negative, never NaN). */
export function roomUnreadFrom(data: unknown, eventId: string): RoomUnread | null {
  const list = Array.isArray(data) ? data : ((data as { groups?: unknown } | null)?.groups ?? [])
  if (!Array.isArray(list)) return null
  const room = (list as { id?: unknown; unreadCount?: unknown; event?: { id?: unknown } }[]).find((g) => g?.event?.id === eventId)
  if (!room || typeof room.id !== 'string') return null
  const n = Number(room.unreadCount)
  return { chatGroupId: room.id, unread: Number.isFinite(n) && n > 0 ? Math.floor(n) : 0 }
}

export function watchRoomUnread(opts: { eventId: string; onChange: (unread: number) => void }) {
  let stopped = false
  return {
    /** Read the server's count: the cached list, or `force` for a moment the answer has surely moved. A failed read keeps what is known. */
    async refresh(force = false): Promise<void> {
      try {
        const r = await apiClient.getChatGroups({ force })
        if (stopped || !r.success) return
        const found = roomUnreadFrom(r.data, opts.eventId)
        if (found) opts.onChange(found.unread)
      } catch (e) {
        Logger.debug('navigation', 'room unread read failed', { error: e })
      }
    },
    stop() {
      stopped = true
    },
  }
}

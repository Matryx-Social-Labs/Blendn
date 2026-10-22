import { apiClient } from './apiClient'
import { Logger } from './logger'
import { subscribeToChatMessage } from './socketClient'

/**
 * The live room's unread count, for the disc (Flow 4 T3, "(d) with an unread count").
 *
 * The truth is the server's `unreadCount` on the chat list, read on the bar's
 * 30 s poll. Between reads the socket only *adds* what others say (a local +1,
 * no request), so a busy room costs the phone nothing: a concert room of 5,000
 * must not make every phone re-read the list per message. The next read
 * replaces the guess, which is also what clears it after the chat was read.
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

export function watchRoomUnread(opts: { eventId: string; myId: () => string | null; onChange: (unread: number) => void }) {
  let stopped = false
  let current: RoomUnread | null = null
  let unsubscribe: (() => void) | null = null

  const set = (next: RoomUnread) => {
    if (next.chatGroupId !== current?.chatGroupId) {
      unsubscribe?.()
      unsubscribe = subscribeToChatMessage(next.chatGroupId, (data) => {
        if (stopped || !current || data.chatGroupId !== current.chatGroupId) return
        if (data.message.userId === opts.myId()) return
        current = { ...current, unread: current.unread + 1 }
        opts.onChange(current.unread)
      })
    }
    current = next
    opts.onChange(next.unread)
  }

  return {
    /** Read the server's count. A failed read keeps what is known. */
    async refresh(): Promise<void> {
      try {
        const r = await apiClient.getChatGroups({ force: true })
        if (stopped || !r.success) return
        const found = roomUnreadFrom(r.data, opts.eventId)
        if (found) set(found)
      } catch (e) {
        Logger.debug('navigation', 'room unread read failed', { error: e })
      }
    },
    stop() {
      stopped = true
      unsubscribe?.()
      unsubscribe = null
    },
  }
}

/**
 * Lightweight pub/sub for instant chat list updates.
 * When a message is sent from a chat screen, it emits an update here.
 * The chat tab subscribes and patches its list state immediately —
 * no API round-trip, no delay.
 */

export interface ChatListUpdate {
  type: 'personal' | 'group'
  conversationId?: string
  chatGroupId?: string
  lastMessage: string
  lastMessageTime: string
  senderName?: string
}

const subscribers = new Set<(update: ChatListUpdate) => void>()

export function emitChatListUpdate(update: ChatListUpdate): void {
  subscribers.forEach((cb) => {
    try {
      cb(update)
    } catch {}
  })
}

export function subscribeChatListUpdates(
  callback: (update: ChatListUpdate) => void
): () => void {
  subscribers.add(callback)
  return () => {
    subscribers.delete(callback)
  }
}

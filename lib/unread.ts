/**
 * Unread count helpers — server-side tracking via the REST API.
 *
 * The server returns unread_count per conversation from GET /api/mobile/conversations
 * based on `is_read` on private_messages. This module is a thin client-side cache
 * so screens can pessimistically clear counts locally without waiting for a full refresh.
 *
 * Fix #23: replaced the old AsyncStorage + Supabase approach with server-driven counts.
 */

const _cache: Record<string, number> = {}
const _listeners = new Set<() => void>()

/** Update local cache from the server-returned conversation list. */
export function syncUnreadCache(
  conversations: Array<{ conversation_id?: string; id?: string; unread_count?: number; unreadCount?: number }>
): void {
  for (const conv of conversations) {
    const id = conv.conversation_id ?? conv.id
    const count = conv.unread_count ?? conv.unreadCount ?? 0
    if (id) _cache[id] = count
  }
  _notify()
}

/**
 * Optimistically mark a conversation as fully read in local cache.
 * Returns a resolved promise so existing callers using .catch() / await still work.
 */
export function setConversationLastRead(conversationId: string): Promise<void> {
  _cache[conversationId] = 0
  _notify()
  return Promise.resolve()
}

/** Get the cached unread count for a conversation. */
export function getUnreadCount(conversationId: string): number {
  return _cache[conversationId] ?? 0
}

/** Get total unread across all conversations. */
export function getTotalUnread(): number {
  return Object.values(_cache).reduce((sum, n) => sum + n, 0)
}

/** Subscribe to cache changes. Returns an unsubscribe function. */
export function subscribeUnread(fn: () => void): () => void {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}

/**
 * @deprecated Unread counts now come from the server.
 * Use `syncUnreadCache()` with the conversation list response instead.
 * Kept for backward compatibility — returns zeros so callers don't break.
 */
export async function computeUnreadCounts(
  conversationIds: string[]
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const id of conversationIds) {
    counts[id] = _cache[id] ?? 0
  }
  return counts
}

function _notify() {
  for (const fn of _listeners) fn()
}

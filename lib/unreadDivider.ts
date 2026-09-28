/**
 * "N unread messages", right above the first one you have not read (SCRUM-406).
 *
 * The server names the first unread before it marks the thread read, so the
 * divider is where you left off even though everything is read by the time it
 * draws. An anchor that did not load leaves the list as it is.
 */
export interface UnreadDivider {
  kind: 'unread'
  id: 'unread-divider'
  label: string
}

export function withUnreadDivider<T extends { kind: string; id: string }>(
  items: T[],
  firstUnreadId: string | null | undefined,
  unreadCount: number
): (T | UnreadDivider)[] {
  if (!firstUnreadId || unreadCount <= 0) return items
  const at = items.findIndex((i) => i.kind === 'message' && i.id === firstUnreadId)
  if (at === -1) return items
  const label = `${unreadCount} unread message${unreadCount === 1 ? '' : 's'}`
  return [...items.slice(0, at), { kind: 'unread', id: 'unread-divider', label }, ...items.slice(at)]
}

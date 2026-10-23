import { calendarDate } from './time'

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

/** A day's heading in a chat list. */
export interface DaySeparator {
  kind: 'separator'
  id: string
  label: string
}

/** "Today", "Yesterday", or "4 Mar" (with the year when it is not this one). */
const dayLabel = (d: Date) => {
  const today = new Date()
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (same(d, today)) return 'Today'
  if (same(d, yesterday)) return 'Yesterday'
  return calendarDate(d, { now: today })
}

/** A chat's messages as list rows, with a day heading before each day's first message. */
export function withDaySeparators<M extends object>(
  messages: M[],
  createdAt: (m: M) => string
): (DaySeparator | ({ kind: 'message' } & M))[] {
  const items: (DaySeparator | ({ kind: 'message' } & M))[] = []
  let lastDay: string | null = null
  for (const m of messages) {
    const d = new Date(createdAt(m))
    const day = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (day !== lastDay) { items.push({ kind: 'separator', id: `sep-${day}`, label: dayLabel(d) }); lastDay = day }
    items.push({ kind: 'message', ...m })
  }
  return items
}

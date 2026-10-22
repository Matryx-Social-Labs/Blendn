import { Logger } from './logger'

/**
 * The number on the app's icon (Flow 9 · 9.4), from `GET /notifications` `badgeCount`: unseen bell rows plus conversations
 * with something unread from the other person (blendn-admin `app/api/mobile/notifications/route.ts`). The bell's own badge is
 * `unreadCount`, its rows only: opening the bell cannot clear a count that holds conversations.
 *
 * Absent from a server that does not send it: `null`, and the icon is left as it was.
 */
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null)

/** The icon's number off a feed read, or null when the server did not say. */
export const iconBadgeFor = (feed: { badgeCount?: unknown; unreadCount?: unknown }): number | null => count(feed.badgeCount)

/**
 * The icon's number once the bell's rows are seen: what is left is the conversations. `null` when the server sent no
 * `badgeCount`, or no `unreadCount` to take from it.
 */
export function iconBadgeAfterRead(feed: { badgeCount?: unknown; unreadCount?: unknown }): number | null {
  const all = count(feed.badgeCount)
  const rows = count(feed.unreadCount)
  return all === null || rows === null ? null : Math.max(0, all - rows)
}

/**
 * Set the icon's number. Never asks for the permission (that is the in-context ask, `lib/pushAsk`): without notifications
 * granted, or with badges switched off for the app in the phone's Settings, there is nothing to set. A failure is logged and
 * costs only the number: it is never the caller's to handle.
 */
export async function setAppIconBadge(n: number | null): Promise<void> {
  if (n === null) return
  try {
    // Loaded when there is a number to set, not with `useAuth`, which a great many modules (and tests) import and which has no other use for it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require('expo-notifications') as typeof import('expo-notifications')
    const { status, ios } = await Notifications.getPermissionsAsync()
    if (status !== 'granted' || ios?.allowsBadge === false) return
    await Notifications.setBadgeCountAsync(n)
  } catch (error) {
    Logger.warn('notifications', 'badge:failed', { error: error as never })
  }
}

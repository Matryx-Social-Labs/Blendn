/**
 * The notifications centre's types and formatting — a **leaf** module.
 *
 * Deliberately separate from `lib/notifications.ts`, which imports `apiClient`
 * and therefore AsyncStorage, which this jest setup cannot load. Everything
 * here is pure, so it can be unit-tested for real rather than asserted against
 * as source text — which is what every other test in this repo has to do.
 */

/**
 * Mirrors the server's `notification_kind` enum and `NotificationData["type"]`.
 * `__tests__/notifications.test.ts` in blendn-admin fails if those two drift;
 * this is the third copy and the only one a type checker can see.
 */
export type NotificationKind =
  | 'private_message'
  | 'group_message'
  | 'event_checkin'
  | 'event_update'
  | 'announcement'
  | 'message_request'
  | 'message_request_response'
  | 'waitlist_promoted'
  | 'match'
  | 'reveal_request'
  | 'reveal'

export interface NotificationItem {
  id: string
  kind: NotificationKind
  title: string
  body: string
  /** The push's own payload — the ids `navigateFromNotificationData` needs. */
  data: Record<string, string | undefined> | null
  readAt: string | null
  createdAt: string
}

export interface NotificationFeed {
  notifications: NotificationItem[]
  unreadCount: number
  pagination: { limit: number; hasMore: boolean; nextCursor?: string }
}

/**
 * "2m", "4h", "3d" — the age of a notification.
 *
 * Not `Intl.RelativeTimeFormat`, which produces "2 minutes ago": at this
 * column width that wraps and pushes the title around. The bell is scanned,
 * not read.
 */
export function notificationAge(createdAt: string, now: number = Date.now()): string {
  const then = new Date(createdAt).getTime()
  if (!Number.isFinite(then)) return ''
  const seconds = Math.max(0, Math.floor((now - then) / 1000))

  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  if (days < 30) return `${Math.floor(days / 7)}w`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${Math.floor(days / 365)}y`
}

/**
 * What the badge says. Above 9 it says "9+".
 *
 * The badge is 18pt wide on a 36pt control: "12" fits and "128" does not, and
 * a badge that stretches its own button is worse than one that rounds. The
 * exact number is in the sheet.
 */
export function badgeLabel(unread: number): string | null {
  if (!Number.isFinite(unread) || unread <= 0) return null
  return unread > 9 ? '9+' : String(unread)
}

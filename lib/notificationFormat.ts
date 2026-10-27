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
  /** Sent to people going when the time, venue or status changed; shown like `event_update`. */
  | 'event_changed'
  /** An event you were checked in to was cancelled: you are checked out. Carries `eventId`; opens the event. */
  | 'event_cancelled'
  | 'announcement'
  | 'message_request'
  | 'message_request_response'
  | 'waitlist_promoted'
  | 'match'
  | 'reveal_request'
  | 'reveal'
  /** Somebody asked to join your board post. No handle, no text. */
  | 'board_request'
  /** Your board ask was accepted. Carries `conversationId`. */
  | 'board_request_accepted'
  | 'friend_request'
  | 'friend_accepted'
  /** An event you checked in to has ended: rate it. Carries `eventId`. */
  | 'rating_request'
  /** A friend invited you into a crew. Carries `crewId`. */
  | 'crew_invite'
  /** A crewmate tapped "We're here". Carries `crewId` and `chatGroupId`. */
  | 'crew_here'
  /** Two crews (or a crew and a person) liked each other. Carries `chatGroupId`. */
  | 'blend'
  /** A place sent its regulars an offer. Carries `offerId`. */
  | 'venue_offer'

/**
 * What the server adds to a row once it resolves the people and the event for the
 * person reading (Flow 9 · 9.3: "names are filled in by fetching the target, only
 * where you may already see it; otherwise the stored title"). Every field is
 * optional and read through `rowFor`/`parseVisual`: an absent or malformed one
 * means the row draws from the stored title and `kind`. A friend request's is the
 * asker's first name and photo; a match's, the room pseudonym; a crew's, its emblem
 * seed; an event's, its cover and the kind's badge.
 */
export interface NotificationDisplay {
  title?: string
  /** One line: "Vinyl Night · 2 min ago". */
  context?: string
  visual?: unknown
}

export interface NotificationItem {
  id: string
  kind: NotificationKind
  title: string
  body: string
  /** The push's own payload — the ids `navigateFromNotificationData` needs. */
  data: Record<string, string | undefined> | null
  readAt: string | null
  createdAt: string
  /** What the row can say for its reader (`display`, from blendn-admin `lib/notification-display.ts`). Absent: the row draws from `kind` and the stored title. */
  display?: NotificationDisplay | null
  /** A request kind's row says whether it is still the reader's to answer; `false` once it is not. Absent reads as open. */
  open?: boolean
}

export interface NotificationFeed {
  notifications: NotificationItem[]
  /** Unseen bell rows: the bell's badge. */
  unreadCount: number
  /** The app icon's number: `unreadCount` plus conversations with something unread (`lib/appBadge`). Absent from a server that does not send it. */
  badgeCount?: number
  pagination: { limit: number; hasMore: boolean; nextCursor?: string }
  /** Whether `DELETE /notifications` leaves the requests waiting on you in place (Flow 9 · 9.2 frame 11). Not sent yet: absent means it clears them too. */
  clearKeepsRequests?: boolean
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

/**
 * A notification row as VoiceOver reads it: title, body, age, one full stop
 * after each sentence. Joined blindly, bodies that end in one read
 * "…what you say.. 8h".
 */
export function notificationLabel(title: string, body: string, age: string): string {
  const sentence = (text: string) => {
    const t = text.trim()
    if (!t) return ''
    return /[.!?…]$/.test(t) ? t : `${t}.`
  }
  return [sentence(title), sentence(body), age].filter(Boolean).join(' ')
}

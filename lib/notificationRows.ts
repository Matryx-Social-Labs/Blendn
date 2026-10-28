import type { NotificationVisualSpec, StackPerson } from '../components/ds/NotificationRow'
import type { IconName } from '../components/ui/Icon'
import type { NotificationItem, NotificationKind } from './notificationFormat'
import { calendarDate, weekdayIn, WEEKDAYS } from './time'

/**
 * What a notification becomes on the Notifications screen (Flow 9 · 9.2, 9.3).
 *
 * Pure, and a leaf: the screen and the tests share one reading of a row. The
 * server stores a push's own words, and those are nameless on purpose (a lock
 * screen is read by other people), so the row's leading visual, title and
 * context come from `kind` and the payload's ids unless the server has added
 * `display` for the person reading (blendn-admin #716: a friend request's asker, a match's pseudonym,
 * a crew's emblem seed, an event's cover; `parseVisual` guards the boundary, and an older server sends none). Nothing here invents a person, a photo or a crew's emblem: a
 * row with no `display` draws a glyph tile or the event tile, never a wrong face.
 */

/** Accept and Join are `lit` (with their glyph); Decline and View are `secondary`. */
export type RowAction = { key: 'accept' | 'decline' | 'join' | 'view'; label: string; kind: 'lit' | 'secondary'; icon?: IconName }

export type FeedRow = {
  id: string
  item: NotificationItem
  visual: NotificationVisualSpec
  title: string
  context: string
  actions: RowAction[]
  /** Still the reader's to answer: it sits in Waiting on you. */
  waiting: boolean
}

export type FeedGroups = { waiting: FeedRow[]; fresh: FeedRow[]; earlier: FeedRow[] }

/** A request older than this has lapsed (a crew invite's 14 days, the longest); it reads as history, with no pills. */
export const WAITING_DAYS = 14
/** Waiting on you shows this many before "See all N". */
export const WAITING_SHOWN = 3

const DAY_MS = 24 * 60 * 60 * 1000

/** The kinds that ask the reader something. */
const REQUEST_ACTIONS: Partial<Record<NotificationKind, RowAction[]>> = {
  friend_request: [
    { key: 'accept', label: 'Accept', kind: 'lit', icon: 'user-check' },
    { key: 'decline', label: 'Decline', kind: 'secondary' },
  ],
  crew_invite: [
    { key: 'join', label: 'Join', kind: 'lit', icon: 'users' },
    { key: 'decline', label: 'Decline', kind: 'secondary' },
  ],
  reveal_request: [{ key: 'view', label: 'View', kind: 'secondary' }],
  board_request: [{ key: 'view', label: 'View', kind: 'secondary' }],
  message_request: [{ key: 'view', label: 'View', kind: 'secondary' }],
}

export const isRequestKind = (kind: string): boolean => kind in REQUEST_ACTIONS

/** The glyph tile for a kind that is about somebody, or nobody by design. */
export const GLYPH: Record<string, IconName> = {
  friend_request: 'user-plus',
  friend_accepted: 'user-check',
  match: 'heart',
  reveal_request: 'eye',
  reveal: 'eye',
  board_request: 'hand-heart',
  board_request_accepted: 'circle-check',
  message_request: 'message-circle',
  message_request_response: 'message-circle',
  crew_invite: 'users',
  crew_here: 'users',
  blend: 'sparkles',
  venue_offer: 'gift',
  private_message: 'message-circle',
  group_message: 'message-circle',
  // A post of yours a moderator or the automatic check took down (C34): the moderation shield, never the generic bell.
  board_post_removed: 'shield',
  // The outcome of a report you made (SYS-06): the same shield, not the generic bell.
  report_actioned: 'shield',
}

const EVENT_BADGES = ['clock', 'map-pin', 'megaphone', 'star'] as const
type EventBadge = (typeof EVENT_BADGES)[number]

/** The event kinds and the badge on their tile. */
const EVENT_BADGE: Partial<Record<NotificationKind, EventBadge>> = {
  event_update: 'clock',
  event_changed: 'clock',
  event_cancelled: 'clock',
  announcement: 'megaphone',
  waitlist_promoted: 'star',
  rating_request: 'star',
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const MAX_STACK = 6

/** Anything the server sends for a visual is checked here; a shape that is not exactly one of the six reads as absent. */
export function parseVisual(raw: unknown): NotificationVisualSpec | null {
  if (!isRecord(raw)) return null
  switch (raw.type) {
    case 'photo': {
      const uri = text(raw.uri)
      return uri ? { type: 'photo', uri } : null
    }
    case 'creature': {
      const pseudonym = text(raw.pseudonym)
      return pseudonym ? { type: 'creature', pseudonym } : null
    }
    case 'emblem': {
      const seed = text(raw.seed)
      return seed ? { type: 'emblem', seed } : null
    }
    case 'event': {
      const badge = EVENT_BADGES.find((b) => b === raw.badge)
      if (!badge) return null
      return { type: 'event', cover: text(raw.cover), badge, cancelled: raw.cancelled === true }
    }
    case 'stack': {
      if (!Array.isArray(raw.people)) return null
      const people = raw.people.slice(0, MAX_STACK).flatMap((p): StackPerson[] => {
        if (!isRecord(p)) return []
        const pseudonym = text(p.pseudonym)
        if (pseudonym) return [{ pseudonym }]
        const uri = text(p.uri)
        return uri ? [{ uri }] : []
      })
      if (!people.length) return null
      const extra = typeof raw.extra === 'number' && Number.isInteger(raw.extra) && raw.extra > 0 ? raw.extra : undefined
      return { type: 'stack', people, extra }
    }
    default:
      return null
  }
}


/**
 * When, as the flow writes it: "2 min ago", "3 h ago", "Yesterday", "Tue", "9 Oct".
 * A week ago and more is a date; the year shows only when it is not this one.
 */
export function notificationWhen(createdAt: string, now: number = Date.now()): string {
  const then = new Date(createdAt)
  const ms = then.getTime()
  if (!Number.isFinite(ms)) return ''
  const minutes = Math.floor(Math.max(0, now - ms) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor((now - ms) / DAY_MS)
  if (days < 2) return 'Yesterday'
  if (days < 7) return WEEKDAYS[weekdayIn(then)]
  return calendarDate(then, { now })
}

const joinLine = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ')

/** The organiser push's title is "📢 {event}"; the row names the event without the emoji. */
const eventName = (title: string) => title.replace(/^\s*📢\s*/u, '').trim()

/** "A place opened up at Toit." → "Toit". */
const WAITLIST_VENUE = /^A place opened up at (.+?)\.?$/

/** The visual for a kind with nothing from the server: the event tile (no cover, the kind's badge) or a glyph tile. */
function fallbackVisual(item: NotificationItem): NotificationVisualSpec {
  const badge = EVENT_BADGE[item.kind]
  if (badge) {
    // `data.reason` is how the five event changes are told apart, once the server sends it.
    const reason = item.data?.reason
    const changed = item.kind === 'event_update' || item.kind === 'event_changed'
    return {
      type: 'event',
      cover: null,
      badge: changed && reason === 'venue' ? 'map-pin' : badge,
      cancelled: item.kind === 'event_cancelled' || (changed && reason === 'cancelled'),
    }
  }
  return { type: 'glyph', icon: GLYPH[item.kind] ?? 'bell' }
}

function fallbackCopy(item: NotificationItem, when: string): { title: string; context: string } {
  switch (item.kind) {
    case 'event_update':
    case 'event_changed':
    case 'event_cancelled':
      return { title: item.body || item.title, context: joinLine(item.title, when) }
    case 'announcement':
      return { title: item.body ? `From the organizer: ${item.body}` : item.title, context: joinLine(eventName(item.title), when) }
    case 'waitlist_promoted':
      return { title: 'You’re in: a place opened up', context: joinLine(WAITLIST_VENUE.exec(item.body)?.[1], when) }
    case 'rating_request':
      return { title: `How was ${item.title}?`, context: when }
    default:
      return { title: item.title, context: when }
  }
}

/** Whether a request is still the reader's to answer. */
const stillWaiting = (item: NotificationItem, now: number) =>
  isRequestKind(item.kind) && item.open !== false && now - new Date(item.createdAt).getTime() < WAITING_DAYS * DAY_MS

/**
 * A friend request comes through your invite link (`app/f/[token]`) or, since SCRUM-750, from a match where you both
 * revealed, so these rows are the person and the time: the server's `display.context` is not read for them, whatever it
 * names (an event, a room). The one thing a request may add is where it came from, and the server says so with
 * `data.via === 'match'`: "From your match", never the event or the room the match was made in.
 */
const PERSON_ONLY: ReadonlySet<string> = new Set(['friend_request', 'friend_accepted'])

const FROM_YOUR_MATCH = 'From your match'

/** The context line of a row that is only the person and the time. */
const personOnlyContext = (item: NotificationItem, when: string) =>
  item.kind === 'friend_request' && item.data?.via === 'match' ? joinLine(FROM_YOUR_MATCH, when) : when

/** One notification as a row: the server's `display` where it sent one, else the kind's own. */
export function rowFor(item: NotificationItem, now: number = Date.now()): FeedRow {
  const when = notificationWhen(item.createdAt, now)
  const waiting = stillWaiting(item, now)
  const fallback = fallbackCopy(item, when)
  return {
    id: item.id,
    item,
    visual: parseVisual(item.display?.visual) ?? fallbackVisual(item),
    title: text(item.display?.title) ?? fallback.title,
    context: PERSON_ONLY.has(item.kind) ? personOnlyContext(item, when) : (text(item.display?.context) ?? fallback.context),
    actions: waiting ? (REQUEST_ACTIONS[item.kind] ?? []) : [],
    waiting,
  }
}

/**
 * Waiting on you · New · Earlier. A request still open is Waiting on you
 * whatever its age on the screen; the rest is New if it was unseen when the
 * screen opened (or landed since) and Earlier otherwise. `resolved` rows (an
 * answered request, once its outcome has shown) are not in any of them.
 */
export function groupFeed(
  items: readonly NotificationItem[],
  { fresh, resolved, now = Date.now() }: { fresh: ReadonlySet<string>; resolved: ReadonlySet<string>; now?: number }
): FeedGroups {
  const groups: FeedGroups = { waiting: [], fresh: [], earlier: [] }
  for (const item of items) {
    if (resolved.has(item.id)) continue
    const row = rowFor(item, now)
    if (row.waiting) groups.waiting.push(row)
    else if (fresh.has(item.id)) groups.fresh.push(row)
    else groups.earlier.push(row)
  }
  return groups
}

/** The payload ids that say which thing a notification is about. */
const TARGET_KEYS = ['requestId', 'crewId', 'eventId', 'conversationId', 'chatGroupId', 'blendId', 'offerId'] as const

/**
 * The row a push or banner landed for (Flow 9 · motion #50): the first whose kind and every id the payload
 * carries agree. A payload with no id matches nothing, so a landing never highlights the wrong row.
 */
export function findLandingRow(items: readonly NotificationItem[], data: Record<string, unknown> | undefined): NotificationItem | null {
  if (!data || typeof data.type !== 'string') return null
  const ids = TARGET_KEYS.filter((k) => typeof data[k] === 'string')
  if (!ids.length) return null
  return items.find((n) => n.kind === data.type && ids.every((k) => n.data?.[k] === data[k])) ?? null
}

/**
 * A page of the feed folded into what is already loaded, newest first. A row the page carries replaces its
 * older copy (it may have been read since); rows only the older pages have stay, so a live arrival or a
 * refresh never shortens a list somebody has scrolled down.
 */
export function mergeFeed(loaded: readonly NotificationItem[], page: readonly NotificationItem[]): NotificationItem[] {
  const ids = new Set(page.map((n) => n.id))
  return [...page, ...loaded.filter((n) => !ids.has(n.id))].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

/** The ids of the rows in `page` that are unread and not in `loaded`: what has landed since. */
export function arrivedUnread(loaded: readonly NotificationItem[], page: readonly NotificationItem[]): string[] {
  const known = new Set(loaded.map((n) => n.id))
  return page.filter((n) => n.readAt === null && !known.has(n.id)).map((n) => n.id)
}

/**
 * A friend request whose id is not among the ones still waiting on you (`incoming`) was answered somewhere else: its row
 * is history, not Waiting on you. `null` (the list did not load) closes nothing.
 */
export function closeAnsweredElsewhere(items: readonly NotificationItem[], incoming: ReadonlySet<string> | null): NotificationItem[] {
  if (!incoming) return [...items]
  return items.map((n) => {
    const id = n.data?.requestId
    return n.kind === 'friend_request' && typeof id === 'string' && !incoming.has(id) ? { ...n, open: false } : n
  })
}

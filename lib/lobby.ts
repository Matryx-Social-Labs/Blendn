import type { BoardPost, BoardPostKind } from './board'
import { compactCount } from './format'
import { calendarDate, eventClock } from './time'

/**
 * The Lobby (was the Board), as the owner picked it on 2026-11-06: L-A cards, P-A on the event page, C-A one compose
 * sheet, H-A "From the Lobby" in the room (`mockups/redesign-2026-11/lobby/`, FLOW-WALK § Flow 4c, SCRUM-1026).
 *
 * Pure, so every rule the screens draw is tested without a render. The server owns the gates and the clock (admin #914:
 * `GET /events/:eventId/board`, `…/preview`, `…/summary`, `…/alerts`); this file only says how its answers read.
 */

/** What a post is about (`subKind`): a ride, spots, a spare ticket, or somebody to go with. Null on a chat post. */
export type LobbySubKind = 'ride' | 'spots' | 'ticket' | 'buddy'

/** A post's one photo. Only its author ever gets a pending or a rejected one. */
export type LobbyPhoto = { status: 'pending' | 'approved' | 'rejected'; url: string | null; alt: string | null } | null

/** `open` until doors (start − 90 min); `read_only` from doors until the room closes, a day after the end. */
export type LobbyState = 'open' | 'read_only'
/** `before` while the Lobby is the place; `live` once the doors, and the room, have opened. */
export type LobbyPhase = 'before' | 'live'

export type LobbyCounts = { all: number; offer: number; seeking: number; chat: number; offerRides: number; mine: number; replies: number }

/** The host's pinned post, under the host's public name; never the person who wrote it. */
export type LobbyHostPost = { id: string; body: string; host: string; createdAt: string; updatedAt: string }

/** Whether you may post now; when not, the sentence and the reason the composer's slot shows. */
export type LobbyCompose = { allowed: boolean; message: string | null; reasonCode: string | null }

/** What every page of the Lobby carries around its posts; the first page adds the chips' counts, the pin and the composer. */
export type LobbyMeta = {
  state: LobbyState
  phase: LobbyPhase
  doorsAt: string
  closesAt: string
  ticketsHidden: boolean
  subKinds: Record<BoardPostKind, LobbySubKind[]>
  counts?: LobbyCounts
  pinned?: LobbyHostPost | null
  compose?: LobbyCompose
  /** Your own room name at this event (admin #915); absent from an older server. */
  you?: { pseudonym: string | null }
}

/** The chips: a kind, or one of the two filters that are about you. */
export type LobbyFilter = 'all' | 'offer' | 'seeking' | 'chat' | 'mine' | 'replies'

export const LOBBY_FILTERS: readonly { key: LobbyFilter; label: string; count: keyof LobbyCounts }[] = [
  { key: 'all', label: 'All', count: 'all' },
  { key: 'offer', label: 'Offering', count: 'offer' },
  { key: 'seeking', label: 'Looking for', count: 'seeking' },
  { key: 'chat', label: 'Just saying', count: 'chat' },
  { key: 'mine', label: 'Mine', count: 'mine' },
  { key: 'replies', label: 'Replies to me', count: 'replies' },
]

/** The query a chip asks the server for: filters run there, so a chip over 2,000 posts is one read. */
export function filterQuery(filter: LobbyFilter): Record<string, string> {
  if (filter === 'all') return {}
  if (filter === 'mine' || filter === 'replies') return { filter }
  return { kind: filter }
}

/** Doors are 90 minutes before the start, when check-in opens (the server's `CHECK_IN_LEAD_MINUTES`). */
export const DOORS_LEAD_MINUTES = 90

/** When the doors open (epoch ms), or null with no known start. */
export function doorsAt(startTime: string | null | undefined): number | null {
  if (!startTime) return null
  const start = Date.parse(startTime)
  return Number.isNaN(start) ? null : start - DOORS_LEAD_MINUTES * 60_000
}

/** The kind pill's words (`LKIND`): what the post is, in plain words, with the number in its own slot. */
const KIND_WORDS: Record<BoardPostKind, Partial<Record<LobbySubKind, string>> & { none: string }> = {
  offer: { ride: 'Offering a ride', spots: 'Offering spots', ticket: 'Offering a spare ticket', none: 'Offering spots' },
  seeking: { ride: 'Looking for a ride', buddy: 'Looking for someone to go with', ticket: 'Looking for a ticket', none: 'Looking for someone to go with' },
  chat: { none: 'Just saying' },
}
export function kindWords(kind: BoardPostKind, subKind: LobbySubKind | null | undefined): string {
  const words = KIND_WORDS[kind] ?? KIND_WORDS.chat
  return (subKind && words[subKind]) || words.none
}

/** The kind pill's glyph (`LGLY`). */
export function kindGlyph(kind: BoardPostKind, subKind: LobbySubKind | null | undefined): 'car' | 'users' | 'ticket' | 'user-plus' | 'message-square' {
  if (kind === 'chat') return 'message-square'
  const s = subKind ?? (kind === 'offer' ? 'spots' : 'buddy')
  return ({ ride: 'car', spots: 'users', ticket: 'ticket', buddy: 'user-plus' } as const)[s]
}

/** The spots pill: "2 spots left", "1 spot left", "Full", and a spare ticket's "1 left". Null where there are none to count. */
export function spotsWords(post: Pick<BoardPost, 'kind' | 'spacesLeft'> & { subKind?: LobbySubKind | null }): string | null {
  const n = post.spacesLeft
  if (post.kind !== 'offer' || n === null || n === undefined || !Number.isFinite(n)) return null
  if (n <= 0) return 'Full'
  if (post.subKind === 'ticket') return `${n} left`
  return n === 1 ? '1 spot left' : `${n} spots left`
}

/** An offer at 0: it stays listed, says Full, and its action is off. */
export const isFull = (post: Pick<BoardPost, 'kind' | 'spacesLeft'>) => post.kind === 'offer' && post.spacesLeft !== null && post.spacesLeft <= 0

/**
 * The one lit action a post carries: "Ask to join" on an offer, "Say hi" on a search. A chat post carries none: the
 * server refuses an ask on one (422, "it asks nothing of anybody"), so the board's "Say hi" there would only fail.
 */
export function postAction(kind: BoardPostKind): { label: string; icon: 'user-plus' | 'message-square' } | null {
  if (kind === 'offer') return { label: 'Ask to join', icon: 'user-plus' }
  if (kind === 'seeking') return { label: 'Say hi', icon: 'message-square' }
  return null
}

/** How old a post is, as the cards say it: "now", "12 min", "3 h", "1 d". */
export function postAge(createdAt: string, now: number = Date.now()): string {
  const t = Date.parse(createdAt)
  if (!Number.isFinite(t)) return ''
  const minutes = Math.floor(Math.max(0, now - t) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours} h` : `${Math.floor(hours / 24)} d`
}

/** "Mon 10 Nov, 12 AM": until when the Lobby can be read, in the event's own clock and never a zone's name. */
export function untilWords(at: string | null | undefined, timeZone?: string | null): string {
  if (!at) return ''
  const day = calendarDate(at, { weekday: true, timeZone: timeZone ?? undefined })
  const clock = eventClock(at, timeZone)
  return day && clock ? `${day}, ${clock}` : ''
}

/** "18 posts · 3 offering rides": the preview's count line, compact past 999. */
export function countLine(counts: Pick<LobbyCounts, 'all' | 'offerRides'>): { posts: string; rides: string } {
  return { posts: compactCount(counts.all), rides: compactCount(counts.offerRides) }
}

/** Going's unread badge: exact to 9, then "9+". */
export const badgeCount = (n: number) => (n > 9 ? '9+' : String(n))

/** What sits in the composer's slot: the composer, a gate with its one way forward, or the doors. */
export type ComposerSlot = { kind: 'composer' } | { kind: 'gate'; gate: 'going' | 'profile' } | { kind: 'readOnly' }

export function composerSlot(meta: Pick<LobbyMeta, 'state' | 'compose'> | null): ComposerSlot {
  if (meta?.state === 'read_only') return { kind: 'readOnly' }
  const code = meta?.compose?.allowed === false ? meta.compose.reasonCode : null
  if (code === 'BOARD_NOT_GOING') return { kind: 'gate', gate: 'going' }
  if (code === 'BOARD_PROFILE_INCOMPLETE') return { kind: 'gate', gate: 'profile' }
  // A cap (5 waiting, 20 a week) has no button that fixes it: the composer stays, and the sheet says the server's sentence.
  return { kind: 'composer' }
}

/** The compose sheet's three types, in the order the segment draws them. */
export const COMPOSE_TYPES: readonly { kind: BoardPostKind; label: string }[] = [
  { kind: 'offer', label: 'Offering' },
  { kind: 'seeking', label: 'Looking for' },
  { kind: 'chat', label: 'Just saying' },
]

/** Each sub-kind's chip in the sheet, by type. A ticket one is gone where the server says tickets are hidden. */
const SUB_KIND_CHIPS: Record<BoardPostKind, readonly { subKind: LobbySubKind; label: string }[]> = {
  offer: [
    { subKind: 'ride', label: 'Ride' },
    { subKind: 'spots', label: 'Spots' },
    { subKind: 'ticket', label: 'Spare ticket' },
  ],
  seeking: [
    { subKind: 'ride', label: 'A ride' },
    { subKind: 'buddy', label: 'Someone to go with' },
    { subKind: 'ticket', label: 'A ticket' },
  ],
  chat: [],
}
export function subKindChips(kind: BoardPostKind, allowed: LobbyMeta['subKinds'] | null | undefined, ticketsHidden: boolean) {
  const offered = allowed?.[kind]
  return SUB_KIND_CHIPS[kind].filter((c) => (offered ? offered.includes(c.subKind) : !(ticketsHidden && c.subKind === 'ticket')))
}

/** Spots are counted on an offer of a ride or spots; a spare ticket is one, and a search has none. */
export const takesSpots = (kind: BoardPostKind, subKind: LobbySubKind | null) => kind === 'offer' && subKind !== 'ticket'

/** C-A's counter: 280 in the board, inside the server's 500. Code points, as the database counts them. */
export const LOBBY_POST_MAX = 280
export const codePoints = (text: string) => [...text].length

/** Alt text: optional, the server's 200 at most. */
export const LOBBY_ALT_MAX = 200

/** "From the Lobby" in the room: `GET /events/:eventId/board/summary`. `hasContent: false` is no card at all. */
export type LobbySummary = {
  state: LobbyState
  phase: LobbyPhase
  readUntil: string
  hasContent: boolean
  pinned?: LobbyHostPost | null
  joined?: LobbyJoined[]
  asks?: { yours: number; waitingOnYou: number }
}
export type LobbyJoined = {
  postId: string
  kind: BoardPostKind
  subKind: LobbySubKind | null
  body: string
  mine: boolean
  author: string
  others: number
  chatGroupId: string | null
  requestId: string | null
  /** admin #915: the 1:1 your accepted ask opened. */
  conversationId?: string | null
}

/** At most this many joined rows; the rest are "2 more". */
export const FROM_LOBBY_ROWS = 3

/** A joined row's title: what you are in. A spot at somebody's table and a search for company are both a group. */
export function joinedTitle(j: Pick<LobbyJoined, 'kind' | 'subKind'>): string {
  if (j.subKind === 'ride') return 'Your ride'
  if (j.subKind === 'ticket') return 'Your ticket'
  return 'Your group'
}

/** A joined row's line: who with, then the post's own words. Pseudonyms only. */
export function joinedLine(j: Pick<LobbyJoined, 'mine' | 'author' | 'others' | 'body'>): string {
  const others = j.mine ? j.others : j.others - 1
  const who = j.mine
    ? `${j.others === 1 ? '1 other' : `${compactCount(j.others)} others`} with you`
    : others > 0
      ? `With ${j.author} and ${others === 1 ? '1 other' : `${compactCount(others)} others`}`
      : `With ${j.author}`
  return `${who}: ${j.body}`
}

/** The event page's card: `GET /events/:eventId/board/preview`. */
export type LobbyPreview = {
  state: LobbyState
  phase: LobbyPhase
  canRead: boolean
  doorsAt: string
  closesAt: string
  counts: Omit<LobbyCounts, 'mine' | 'replies'>
  latest: (BoardPost & { subKind?: LobbySubKind | null })[]
}

/** What the event page's Lobby slot shows. */
export type PreviewView = 'gate' | 'empty' | 'posts' | 'readOnly' | 'roomOpen'
export function previewView(p: Pick<LobbyPreview, 'state' | 'phase' | 'canRead' | 'counts'>): PreviewView {
  if (p.phase === 'live' && p.counts.all === 0) return 'roomOpen'
  if (!p.canRead) return 'gate'
  if (p.state === 'read_only') return 'readOnly'
  return p.counts.all === 0 ? 'empty' : 'posts'
}

/** The three alert switches, all off until turned on, for one event. */
export type LobbyAlerts = { offersMatch: boolean; replies: boolean; hostPosts: boolean }
export const ALERT_ROWS: readonly { key: keyof LobbyAlerts; title: string; hint: string }[] = [
  { key: 'offersMatch', title: 'Someone offers what you’re looking for', hint: 'A ride, a spot or a ticket you posted about' },
  { key: 'replies', title: 'Someone replies to you', hint: 'Asks and replies to your posts' },
  { key: 'hostPosts', title: 'The host posts', hint: 'Their pinned note, when it changes' },
]

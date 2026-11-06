import type { BoardPost, BoardPostKind } from './board'
import { compactCount } from './format'
import { calendarDate, eventClock } from './time'
import { roomOpensAt } from './preEventRoom'

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

/** When the doors open (epoch ms), or null with no known start: the room's opening (`lib/preEventRoom.ts`), one moment. */
export const doorsAt = roomOpensAt

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

/** "18 posts · 3 offering rides": the preview's count line, compact past 999; no rides part when nobody offers one. */
export function countLine(counts: Pick<LobbyCounts, 'all' | 'offerRides'>): { posts: string; postsWord: string; rides: string | null; ridesWord: string } {
  return {
    posts: compactCount(counts.all),
    postsWord: counts.all === 1 ? 'post' : 'posts',
    rides: counts.offerRides > 0 ? compactCount(counts.offerRides) : null,
    ridesWord: counts.offerRides === 1 ? 'offering a ride' : 'offering rides',
  }
}

/** Going's unread badge: exact to 9, then "9+". */
export const badgeCount = (n: number) => (n > 9 ? '9+' : String(n))

/** Going reads one page this long: enough to say "9+". */
export const LOBBY_NEWS_PAGE = 10

type NewsPost = Pick<BoardPost, 'id' | 'author' | 'createdAt' | 'mine'>

/**
 * Going's "New in the Lobby": what others posted after the newest post you were shown when you last opened the Lobby
 * (all of it if you never did), newest first, and the three newest authors for the creature stack. A page that is new
 * to its last post says nothing about the rest, so it counts as the page (9+).
 *
 * ponytail: one page of the newest posts, counted on the phone against a marker kept on the phone (`lib/lobbySeen.ts`);
 * a server count (`?since=`) when the badge has to follow you across phones.
 */
export function lobbyNews(posts: readonly NewsPost[], seenAt: string | null, page = LOBBY_NEWS_PAGE): { count: number; authors: NewsPost[] } {
  const seen = seenAt ? Date.parse(seenAt) : -Infinity
  const newer = (p: NewsPost) => Date.parse(p.createdAt) > seen
  const fresh = posts.filter((p) => !p.mine && newer(p))
  const overflow = posts.length >= page && posts.every(newer)
  return { count: overflow ? Math.max(fresh.length, page) : fresh.length, authors: fresh.slice(0, 3) }
}

/** The marker the Lobby leaves when it shows its newest page: the newest post's own time, the server's clock. */
export function newestPostAt(posts: readonly Pick<BoardPost, 'createdAt'>[]): string | null {
  let newest: string | null = null
  for (const p of posts) if (!newest || Date.parse(p.createdAt) > Date.parse(newest)) newest = p.createdAt
  return newest
}

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
  return SUB_KIND_CHIPS[kind].filter((c) => (!offered || offered.includes(c.subKind)) && !(ticketsHidden && c.subKind === 'ticket'))
}

/** Spots are counted on an offer of a ride or spots; a spare ticket is one, and a search has none. */
export const takesSpots = (kind: BoardPostKind, subKind: LobbySubKind | null) => kind === 'offer' && subKind !== 'ticket'

/** C-A's counter: 280 in the board, inside the server's 500. Code points, as the database counts them. */
export const LOBBY_POST_MAX = 280
export const codePoints = (text: string) => [...text].length

/** Alt text: optional, the server's 200 at most. */
export const LOBBY_ALT_MAX = 200

/** What `POST /events/:eventId/board` takes from the sheet (admin #919). */
export type LobbyDraft = { kind: BoardPostKind; subKind?: LobbySubKind; body: string; spacesLeft?: number; photo?: { url: string; alt?: string } }

/** The sheet's uploaded picture: its `folder: 'chat'` public URL and the alt text typed for it. */
export type LobbyAttachment = { url: string; alt: string }

/** The sheet's fields as the server takes them: a chat has no sub-kind, only a ride or spots counts spots. */
export function lobbyDraft(f: { kind: BoardPostKind; subKind: LobbySubKind | null; body: string; spots: number; attachment: LobbyAttachment | null }): LobbyDraft {
  const subKind = f.kind === 'chat' ? null : f.subKind
  const alt = f.attachment?.alt.trim()
  return {
    kind: f.kind,
    ...(subKind && { subKind }),
    body: f.body.trim(),
    ...(subKind && takesSpots(f.kind, subKind) && { spacesLeft: f.spots }),
    ...(f.attachment && { photo: { url: f.attachment.url, ...(alt && { alt }) } }),
  }
}

/** Post waits for words inside the counter and for a photo still on its way. */
export const mayPost = (f: { body: string; uploading: boolean }) => {
  const n = codePoints(f.body.trim())
  return n > 0 && n <= LOBBY_POST_MAX && !f.uploading
}

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

/** Where a row of the card goes: the post's room you are seated in, the 1:1 your ask opened, or your asks in the Banter. */
export type FromLobbyOpen = { kind: 'room' | 'dm'; id: string } | { kind: 'asks' }
export type FromLobbyRow = {
  key: string
  glyph: 'car' | 'ticket' | 'users' | 'megaphone' | 'hand-heart'
  title: string
  line: string
  host?: true
  open: FromLobbyOpen | null
}
/** The room's card (H-A): its rows, how many joined rows it leaves out, until when Read the Lobby reads, and the folded line. */
export type FromLobbyCard = { rows: FromLobbyRow[]; more: number; readUntil: string | null; bar: string }

const joinedOpen = (j: LobbyJoined): FromLobbyOpen | null =>
  j.chatGroupId ? { kind: 'room', id: j.chatGroupId } : j.conversationId ? { kind: 'dm', id: j.conversationId } : null

function asksLine({ yours, waitingOnYou }: { yours: number; waitingOnYou: number }): string {
  const parts = [
    waitingOnYou > 0 ? `${compactCount(waitingOnYou)} ${waitingOnYou === 1 ? 'ask' : 'asks'} waiting on you` : null,
    yours > 0 ? `${compactCount(yours)} of yours waiting for an answer` : null,
  ]
  return parts.filter(Boolean).join(' · ')
}

/**
 * "From the Lobby" as the room draws it (board 4 and 4b). No card when the server says there is nothing. What you
 * joined, then the host's note; only the note when that is all there is, with no Read the Lobby (nothing else to read).
 * Asks waiting are a row only when nothing else is: the board draws none beside a ride.
 */
export function fromLobbyCard(s: LobbySummary | null): FromLobbyCard | null {
  if (!s?.hasContent) return null
  const joined = s.joined ?? []
  const rows: FromLobbyRow[] = joined.slice(0, FROM_LOBBY_ROWS).map((j) => ({
    key: j.postId,
    glyph: j.subKind === 'ride' ? 'car' : j.subKind === 'ticket' ? 'ticket' : 'users',
    title: joinedTitle(j),
    line: joinedLine(j),
    open: joinedOpen(j),
  }))
  if (s.pinned) rows.push({ key: 'host', glyph: 'megaphone', title: 'From the host', line: s.pinned.body, host: true, open: null })
  const asks = s.asks ?? { yours: 0, waitingOnYou: 0 }
  if (!rows.length && asks.yours + asks.waitingOnYou > 0) {
    rows.push({ key: 'asks', glyph: 'hand-heart', title: 'Your asks', line: asksLine(asks), open: { kind: 'asks' } })
  }
  if (!rows.length) return null
  return {
    rows,
    more: Math.max(0, joined.length - FROM_LOBBY_ROWS),
    readUntil: joined.length ? s.readUntil : null,
    bar: rows.map((r) => r.title).join(' · '),
  }
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

/**
 * The opt-in alert switches, all off until turned on, for one event. Asks and accepts always push (admin #918); the
 * server keeps a `replies` switch only so old apps don't error, and it controls nothing, so it is not shown.
 */
export type LobbyAlerts = { offersMatch: boolean; hostPosts: boolean }
export const ALERT_ROWS: readonly { key: keyof LobbyAlerts; title: string; hint: string }[] = [
  { key: 'offersMatch', title: 'Someone offers what you’re looking for', hint: 'A ride, a spot or a ticket you posted about' },
  { key: 'hostPosts', title: 'The host posts', hint: 'Their pinned note, when it changes' },
]

/**
 * The Lobby screen's parts (L-A), from the first page's meta: what sits in the composer's slot, whether the chips, the
 * pin and the two starts show, and the live Lobby nobody posted in (4b: "Nobody posted in the Lobby. The room is
 * open."). `listed` stands in for the counts on an older server that sends none.
 */
export type LobbyLayout = {
  top: 'composer' | 'going' | 'profile' | 'readOnly' | 'none'
  chips: boolean
  pinned: boolean
  starts: boolean
  liveEmpty: boolean
}
export function lobbyLayout(meta: Partial<LobbyMeta>, filter: LobbyFilter, listed = 0): LobbyLayout {
  const all = meta.counts?.all ?? listed
  const pinned = filter === 'all' && !!meta.pinned
  const liveEmpty = meta.state === 'read_only' && all === 0
  if (liveEmpty) return { top: 'none', chips: false, pinned, starts: false, liveEmpty }
  const slot = composerSlot({ state: meta.state ?? 'open', compose: meta.compose })
  const top = slot.kind === 'gate' ? slot.gate : slot.kind
  // An older server sends no counts, so no chip could say one.
  const chips = !!meta.counts && (all > 0 || filter !== 'all')
  return { top, chips, pinned, starts: top === 'composer' && all === 0 && filter === 'all', liveEmpty }
}

export function lobbyChips(counts: LobbyCounts) {
  return LOBBY_FILTERS.map((f) => ({ key: f.key, label: f.label, count: compactCount(counts[f.count]), exact: counts[f.count] }))
}

/** The pill over a busy Lobby: the list never jumps, the new posts wait behind it. */
export const newPostsWords = (n: number) => `${compactCount(n)} new ${n === 1 ? 'post' : 'posts'}`

/**
 * What a background read found that the list does not show yet: posts on its first page that nobody has seen, and not
 * your own (yours go up as you post). Nothing on a first load: there is no list yet to jump.
 */
export function freshOnTop(page: readonly { id: string; mine: boolean }[], shown: ReadonlySet<string>): string[] {
  if (shown.size === 0) return []
  return page.filter((p) => !p.mine && !shown.has(p.id)).map((p) => p.id)
}

/** The doors banner's line, in the event's own clock. */
export function readOnlyLine(closesAt: string | undefined, timeZone?: string | null): string {
  const until = untilWords(closesAt, timeZone)
  return until ? `The Lobby is read-only now. You can read it until ${until}.` : 'The Lobby is read-only now.'
}

/** The event page's card after doors (P-A `pA-ro`): why it is read-only, and until when. */
export function previewReadOnlyLine(closesAt: string | undefined, timeZone?: string | null): string {
  const until = untilWords(closesAt, timeZone)
  return `The doors are open, so the Lobby is read-only.${until ? ` You can read it until ${until}.` : ''}`
}

export const asksWords = (n: number) => (n === 0 ? 'No asks yet' : `${compactCount(n)} ${n === 1 ? 'ask' : 'asks'}`)

/**
 * How a post's photo draws. Only an https URL is ever loaded (the server seals uploads to its own bucket; anything else
 * is not ours). A pending photo is its author's alone, blurred until checked; a turned-down one says so to them only.
 */
export type PhotoView = { kind: 'none' } | { kind: 'rejected' } | { kind: 'shown' | 'pending'; url: string; alt: string }
export function photoView(photo: LobbyPhoto | undefined, mine: boolean): PhotoView {
  if (!photo) return { kind: 'none' }
  if (photo.status === 'rejected') return mine ? { kind: 'rejected' } : { kind: 'none' }
  if (!photo.url || !/^https:\/\//i.test(photo.url)) return { kind: 'none' }
  if (photo.status === 'pending') return mine ? { kind: 'pending', url: photo.url, alt: photo.alt || 'Your photo' } : { kind: 'none' }
  return { kind: 'shown', url: photo.url, alt: photo.alt || 'A photo with the post' }
}

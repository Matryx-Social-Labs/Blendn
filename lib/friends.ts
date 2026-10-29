/**
 * Friends, from the app's side.
 *
 * The rules live on the server (the API's `lib/friends.ts`); the two that shape
 * every screen here:
 *
 *  - **Nobody can be looked up.** There is no search. You add someone through
 *    the link they gave you, or from a match or a conversation — never by name.
 *    A link that does not work says only that; it never says why.
 *  - **Friends are still pseudonyms in a room**, unless they turn on "Friends
 *    can see who I am in rooms" in Settings. The friends list and a friend's
 *    profile show real names because both people said yes.
 *
 * Imports nothing but the pure `./time`, so it can be tested without mocking
 * the API client.
 */

import { dateIn, MONTHS } from './time'

export type FriendState = 'self' | 'friends' | 'requested' | 'incoming' | 'none'

export interface FriendPerson {
  userId: string
  name: string
  photo: string | null
}

export interface Friend extends FriendPerson {
  since: string
}

export interface FriendRequest {
  id: string
  person: FriendPerson
  createdAt: string
}

/** The server's page meta (admin #724). Absent on an older server: read as one page, the whole list. */
export interface PageMeta {
  limit: number
  hasMore: boolean
  nextCursor: string | null
  totalCount: number
}

/** `GET /friends`: a page of `friends`, and `count`, the whole list. */
export interface FriendsPayload {
  friends: Friend[]
  count: number
  pagination?: PageMeta
}

/**
 * `GET /friends/requests`: a page of each side, `pagination` named by side. A call with `?list=` answers only that side's array
 * (read it through `requestsPageFrom`, which does not trust the other to be there).
 */
export interface FriendRequestsPayload {
  incoming: FriendRequest[]
  outgoing: FriendRequest[]
  pagination?: { incoming?: PageMeta; outgoing?: PageMeta }
}

export interface FriendProfile {
  userId: string
  name: string
  photos: string[]
  bio: string | null
  occupation: string | null
  education: string | null
  age: number | null
  location: string | null
  interests: { id: string; name: string; slug: string; icon: string | null }[]
  /** The names of `interests` you hold too (SCRUM-896), as `GET /users/:id` sends them. Absent from an older server: nothing is outlined. */
  sharedInterests?: string[]
  /**
   * What `GET /friends/:id` sends for the about line and the badges, as `GET /users/:id` does for somebody you may see (a friend
   * always may). Absent from an older server: the page then simply draws less (YOU-04).
   */
  work_field?: string | null
  languages?: string[]
  homeState?: string | null
  sign?: string | null
  /** `{ kind, label }[]`, read through `parseBadges`; the key is absent when they turned badges off. */
  badges?: unknown
  friendsSince: string
  /** An open DM, if there is one. */
  conversationId: string | null
}

export interface FriendInvite {
  token: string
  url: string
}

/**
 * What the invite screen offers for each state.
 *
 * `incoming` asks back rather than looking up the request: the server treats
 * two people asking each other as both saying yes, so the same call covers it.
 */
export function inviteCta(state: FriendState): { label: string; action: 'ask' | 'open' | 'share' | null } {
  switch (state) {
    case 'none':
      return { label: 'Send friend request', action: 'ask' }
    case 'incoming':
      return { label: 'Accept friend request', action: 'ask' }
    case 'requested':
      return { label: 'Requested', action: null }
    case 'friends':
      return { label: 'View profile', action: 'open' }
    case 'self':
      return { label: 'Share your link', action: 'share' }
  }
}

/** The line under the person's name on the invite screen. */
export function inviteLine(state: FriendState): string {
  switch (state) {
    case 'self':
      return 'This is your own invite link. Share it with the people you want here.'
    case 'friends':
      return 'You’re friends.'
    case 'requested':
      return 'Your request is waiting. You’ll hear when they accept.'
    case 'incoming':
      return 'They asked to be your friend.'
    case 'none':
      return 'Wants you as a friend on Blend’n.'
  }
}

/** What goes out with a shared link. Short: it lands in somebody else's chat. */
export function inviteMessage(url: string): string {
  return `Add me on Blend’n: ${url}`
}

/**
 * "Friends since Sep 2026". Month and year: the day is nobody's business.
 *
 * A fixed list rather than `toLocaleDateString`: ICU spells September "Sept"
 * in en-GB on one engine and "Sep" on another, and Hermes carries its own.
 */
/** "Friends since " and "Mar 2026" apart, for the screens that set the date in Geist Mono; `date` is null when there is none to show. */
export function friendsSinceParts(iso: string): { words: string; date: string | null } {
  const label = friendsSinceLabel(iso)
  const words = 'Friends since '
  return label.startsWith(words) ? { words, date: label.slice(words.length) } : { words: label, date: null }
}

export function friendsSinceLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Friends'
  const [y, m] = dateIn(date)
  return `Friends since ${MONTHS[m]} ${y}`
}

/**
 * The request `senderId` sent you, among your pending ones: its id and the note as they wrote it, or null. Matched on the sender's
 * real id, so a profile opened by a room handle finds none and stays "Requested" (the server names nobody before a reveal).
 */
export function incomingRequestFrom(
  requests: readonly { id: string; senderId?: string; message?: string | null; status?: string }[],
  senderId: string
): { id: string; note: string | null } | null {
  const found = requests.find((r) => String(r.senderId ?? '').trim() === senderId && String(r.status ?? 'pending').toLowerCase() === 'pending')
  return found ? { id: found.id, note: found.message?.trim() || null } : null
}

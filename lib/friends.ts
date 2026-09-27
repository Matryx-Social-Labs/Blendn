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
 * Kept free of imports so it can be tested without mocking the API client.
 */

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
      return 'This is your own invite link.'
    case 'friends':
      return "You're friends."
    case 'requested':
      return "Your request is waiting. You'll hear when they accept."
    case 'incoming':
      return 'They asked to be your friend.'
    case 'none':
      return "Wants you as a friend on Blend'n."
  }
}

/** What goes out with a shared link. Short: it lands in somebody else's chat. */
export function inviteMessage(url: string): string {
  return `Add me on Blend'n: ${url}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * "Friends since Sep 2026". Month and year: the day is nobody's business.
 *
 * A fixed list rather than `toLocaleDateString`: ICU spells September "Sept"
 * in en-GB on one engine and "Sep" on another, and Hermes carries its own.
 */
export function friendsSinceLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Friends'
  return `Friends since ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/** "1 friend", "3 friends". */
export function friendsCountLabel(count: number): string {
  return `${count} friend${count === 1 ? '' : 's'}`
}

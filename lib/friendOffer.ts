import type { IconName } from '../components/ui/Icon'

/**
 * "Add as friend" after a match (owner, 2026-10-22: "if users have matched and they have revealed themselves we can
 * then give an option to add as friend"; SCRUM-750). A leaf, like `lib/friends.ts`: the screens and the tests share one
 * reading of the server's `friend` field.
 *
 * The server decides everything (`lib/friend-offer.ts` there): `canAdd` is true only for an open match where both of
 * you have revealed and you are not yet friends, and while the other person is still a pseudonym to you the answer is
 * always `{ state: 'none', canAdd: false }`. So the UI keys on `canAdd`, never on `fromMatch` or the reveal fields.
 */
export type FriendOfferState = 'none' | 'requested' | 'incoming' | 'friends'

export interface FriendOffer {
  state: FriendOfferState
  canAdd: boolean
}

const STATES: readonly string[] = ['none', 'requested', 'incoming', 'friends']

/** The server's `friend`, checked at the boundary: anything not exactly `{ state, canAdd }` reads as no offer. */
export function parseFriendOffer(raw: unknown): FriendOffer | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { state, canAdd } = raw as Record<string, unknown>
  if (typeof state !== 'string' || !STATES.includes(state) || typeof canAdd !== 'boolean') return null
  return { state: state as FriendOfferState, canAdd }
}

/** After a successful ask: you can no longer add them, whatever the answer was. */
export const afterAsk = (state: 'requested' | 'friends'): FriendOffer => ({ state, canAdd: false })

/** What a surface draws for an offer. `lit` is the live action in the rose world; the rest are quiet states. */
export type FriendAction =
  | { kind: 'add'; label: 'Add friend'; icon: IconName; lit: true; disabled: false; accessibilityLabel?: string }
  | { kind: 'accept'; label: 'Accept friend request'; icon: IconName; lit: true; disabled: false; accessibilityLabel?: string }
  | { kind: 'requested'; label: 'Requested'; accessibilityLabel: string; icon: IconName; lit: false; disabled: true }
  | { kind: 'friends'; label: 'Friends'; icon: IconName; lit: false; disabled: true; accessibilityLabel?: string }

/**
 * `none` and `incoming` are addable when the server says `canAdd` (asking someone who has asked you is the accept);
 * `requested` and `friends` are states (a surface that has nothing to say about a state ignores it: only a `lit`
 * action takes room on a dock or a card); nothing else, including a `none` the server does not offer, draws nothing.
 */
export function friendAction(offer: FriendOffer | null): FriendAction | null {
  if (!offer) return null
  if (offer.state === 'friends') return { kind: 'friends', label: 'Friends', icon: 'user-check', lit: false, disabled: true }
  if (offer.state === 'requested') return { kind: 'requested', label: 'Requested', accessibilityLabel: 'Friend request sent', icon: 'clock', lit: false, disabled: true }
  if (!offer.canAdd) return null
  return offer.state === 'incoming'
    ? { kind: 'accept', label: 'Accept friend request', icon: 'user-check', lit: true, disabled: false }
    : { kind: 'add', label: 'Add friend', icon: 'user-plus', lit: true, disabled: false }
}

/**
 * Room and conversation handles (`rh_…`) name a person only inside one room or one DM. `POST /friends/requests` takes
 * a real id and answers a handle as an id nobody has, so one is never sent.
 */
export const isHandle = (id: string): boolean => id.startsWith('rh_')

/** The server's reason when it says the match has not been revealed on both sides: "reveal first", not "unavailable". */
export const NOT_A_REVEALED_MATCH = 'NOT_A_REVEALED_MATCH'

export type FriendAskOutcome =
  | { ok: true; state: 'requested' | 'friends' }
  | { ok: false; reason: 'reveal-first' | 'failed' }

type AskResponse = { success: boolean; data?: { state?: string }; reasonCode?: string; errorCode?: string }

/** The answer to `POST /friends/requests`: `requested`, `friends` (they had already asked), or one of two refusals. */
export function friendAskOutcome(response: AskResponse): FriendAskOutcome {
  if (response.success) {
    const state = response.data?.state
    return state === 'requested' || state === 'friends' ? { ok: true, state } : { ok: false, reason: 'failed' }
  }
  return { ok: false, reason: (response.reasonCode ?? response.errorCode) === NOT_A_REVEALED_MATCH ? 'reveal-first' : 'failed' }
}

/** What each outcome says. A request sent is a toast of its own: the button flips, but the sheet that sent it has closed. */
export const FRIEND_COPY = {
  requested: (name: string) => `Friend request sent to ${name}`,
  friends: (name: string) => `You and ${name} are friends`,
  /** The dock's note once asked: a state, said in a line rather than as a dead button. */
  requestSentNote: 'Friend request sent',
  revealFirst: 'Reveal yourself first',
  failed: "That didn't go through. Try again.",
} as const

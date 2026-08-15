/**
 * Liking someone in a room, which is the mechanic the whole product is built on.
 *
 * > Mutual like opens the conversation — you never approach someone who has not
 * > already said yes. Rejection risk is zero.
 *
 * Three properties make that true, and all three are the server's:
 *
 * - **A like is silent.** Nothing reaches the other person. They are not asked,
 *   not notified, and cannot decline — there is nothing to decline.
 * - **The reverse is never disclosed.** The roster carries `youLiked` and no
 *   field for whether they liked you. So there is no "they're waiting on you"
 *   state to render, and no way for this screen to invent one.
 * - **Mutual opens the conversation for both at once.** Neither side sends a
 *   request; the room does it.
 *
 * This module is the client's half: what the card shows, and when a tap should
 * actually send. It is pure so the rules can be tested without a room.
 */

export type LikeStatus =
  /** Not liked, and a tap will send one. */
  | 'none'
  /** In flight. */
  | 'sending'
  /** Liked. Says nothing about them, because nothing is known about them. */
  | 'liked'
  /** Both liked, and a conversation exists. */
  | 'matched'

/**
 * What this card shows, from the server's answer and anything done since.
 *
 * Two sources, and the precedence is the load-bearing part. The roster refetches
 * constantly — on socket events, on pull-to-refresh, on pagination — and each
 * response carries `youLiked` as a plain boolean with **no idea whether the like
 * it is reporting was the one that matched**. So a refetch arriving a second
 * after a mutual like would downgrade `matched` back to `liked` and the person
 * would watch their new conversation disappear from the card.
 *
 * Local wins, therefore, and `matched` is the state that must survive a
 * refetch. The one case where the server wins is where it knows something this
 * session does not: a like sent from another device.
 */
export function likeStatusFor(
  serverYouLiked: boolean | undefined,
  local: LikeStatus | undefined
): LikeStatus {
  // Anything in flight or already matched is this session's business, and the
  // server's snapshot is older than it.
  if (local === 'sending' || local === 'matched') return local
  if (local === 'liked') return 'liked'
  return serverYouLiked ? 'liked' : 'none'
}

/**
 * Should this tap send a like?
 *
 * `false` for everything except `none`, and each of the three is a different
 * reason: `sending` would double-post, `liked` is already true, and `matched`
 * has a conversation — the tap belongs to opening it instead.
 *
 * The in-flight guard matters more here than on a normal button. `likeAtEvent`
 * is a queued request with three retries, so a double tap on a slow connection
 * can put two of them on the wire and the second lands after the first has
 * already opened a conversation.
 */
export function shouldSendLike(status: LikeStatus): boolean {
  return status === 'none'
}

/**
 * The state after the server answers.
 *
 * Failure returns `undefined` rather than `'none'`, which is deliberate: it
 * clears this session's opinion so the card falls back to whatever the server
 * last said. Writing `'none'` would *assert* not-liked, and a request can fail
 * after the like was recorded — a timeout on the response, not on the write.
 * Then the card would offer a like the server already has.
 */
export function likeStateAfter(outcome: {
  ok: boolean
  mutual?: boolean
}): LikeStatus | undefined {
  if (!outcome.ok) return undefined
  return outcome.mutual ? 'matched' : 'liked'
}

/**
 * What the button says to a screen reader.
 *
 * Never mentions the other person's feelings, in any state. There is no data
 * for it, and phrasing like "waiting for them" would invent a pending state the
 * mutual gate exists to not have — the whole point is that a like costs nothing
 * and carries no expectation.
 */
export function likeAccessibilityLabel(name: string, status: LikeStatus): string {
  switch (status) {
    case 'sending':
      return `Sending your like to ${name}`
    case 'liked':
      return `You liked ${name}`
    case 'matched':
      return `You and ${name} matched. Open the conversation`
    case 'none':
      return `Like ${name}. They are not told unless you both like each other`
  }
}

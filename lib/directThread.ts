import type { DmReplyQuote } from './apiClient'
/**
 * Small, pure decisions for the direct-message thread
 * (`app/private-chat/[conversationId].tsx`), kept here so they can be tested
 * without mounting the screen.
 */

export type DirectHeaderAvatar =
  | { kind: 'photo'; url: string }
  | { kind: 'mark'; seed: string }
  | { kind: 'initials' }

/**
 * The header's avatar.
 *
 * While the conversation is pseudonymous and they have not revealed, the
 * generated mark seeded on the pseudonym — the same disc the Banter row draws
 * for them (`PseudonymDisc`), so the thread and the inbox agree about who this
 * is. Otherwise the photo the server resolved (`getConversation`'s
 * `otherUser.image`), or the route's avatar as a first paint before the
 * conversation record lands. Initials for a named person with no photo.
 */
export function directHeaderAvatar(
  reveal: { displayName: string; pseudonymous?: boolean; theyRevealed: boolean } | null,
  serverImage: string | null,
  routeImage: string | null
): DirectHeaderAvatar {
  if (reveal && reveal.pseudonymous && !reveal.theyRevealed) {
    return { kind: 'mark', seed: reveal.displayName }
  }
  // The route param only before the server has answered: after, the server decides.
  const url = reveal ? serverImage : serverImage || routeImage
  return url ? { kind: 'photo', url } : { kind: 'initials' }
}

/**
 * The empty thread's invitation: "Say hi to Mika." — or nothing.
 *
 * It read "Say hi to ." when the screen was opened without a name param (from
 * a push, a request just accepted). The server's name comes first; the param
 * is only a first paint; with neither the sentence is left out.
 */
export function emptyThreadLine(displayName: string | null | undefined, routeName: string | null | undefined): string | null {
  const name = (displayName || routeName || '').trim()
  return name ? `Say hi to ${name}.` : null
}

/** One message in a direct thread, as the screen holds it. */
export interface PrivateMessage {
  id: string
  conversationId: string
  senderId: string
  sender: { id: string; name: string | null; image: string | null }
  text: string | null
  isRead: boolean
  /** Yours: when their app got it — ✓✓ delivered (SCRUM-408). */
  deliveredAt?: string | null
  /** The message this one replies to (SCRUM-409). */
  replyTo?: DmReplyQuote | null
  createdAt: string
  /** Yours, and it did not reach the server. Kept, marked, and retryable. */
  failed?: boolean
  /** This send's own id, the same on every try of it (SCRUM-410). */
  clientId?: string
  /** What a send not yet confirmed replies to, so a retry replies too. */
  replyToId?: string
}

let localIdCounter = 0

/**
 * Your message, drawn before the server has it: a `local-` id, you as the
 * sender, unread. The DM used to wait for the round trip before anything
 * appeared, while the room drew its bubble at once — the same tap felt slow in
 * one place and instant in the other.
 */
export function optimisticDirectMessage(text: string, conversationId: string, senderId: string): PrivateMessage {
  return {
    id: `local-${++localIdCounter}`,
    conversationId,
    senderId,
    sender: { id: senderId, name: null, image: null },
    text,
    isRead: false,
    createdAt: new Date().toISOString(),
  }
}

/** Still only on this phone: sending, or failed. A refresh keeps these. */
export const isLocalMessage = (m: Pick<PrivateMessage, 'id'>): boolean => m.id.startsWith('local-')

/**
 * The server accepted `localId` as `sent`.
 *
 * The socket can echo your own message before the response lands; if the echo
 * is already in the list the local copy goes, otherwise the local bubble takes
 * the server's copy in its place — same position, no second row.
 */
export function settleDirectMessage(list: PrivateMessage[], localId: string, sent: PrivateMessage): PrivateMessage[] {
  return list.some((m) => m.id === sent.id)
    ? list.filter((m) => m.id !== localId)
    : list.map((m) => (m.id === localId ? sent : m))
}

import { personFace, type PersonFace } from './personFace'
import type { DmReplyQuote } from './apiClient'
/**
 * Small, pure decisions for the direct-message thread
 * (`app/private-chat/[conversationId].tsx`), kept here so they can be tested
 * without mounting the screen.
 */

/**
 * The header's face, by `personFace` (owner F1 B): while the conversation is pseudonymous and they have not revealed,
 * their creature on the pseudonym — the same face the Banter row draws, so the thread and the inbox agree. Once they are
 * named, the photo the server resolved (`getConversation`'s `otherUser.image`) or, with none, their initial.
 *
 * Until the server has answered (`reveal` null) it fails closed: a creature on the route's name, never an initial that
 * would claim "named". Never a URL from the route: `blendn://private-chat/x?otherUserAvatar=…` is anybody's link, and
 * drawing it fetched a host the server never named (IP disclosure, Flow 5 security review).
 */
export function directHeaderAvatar(
  reveal: { displayName: string; pseudonymous?: boolean; theyRevealed: boolean } | null,
  serverImage: string | null,
  fallbackName: string
): PersonFace {
  if (!reveal) return personFace({ named: false, name: fallbackName })
  return personFace({ named: !(reveal.pseudonymous && !reveal.theyRevealed), name: reveal.displayName, photo: serverImage })
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
  /** A photo in an older thread (sending one is off at 1.0, D-024): the server's URL. */
  mediaUrl?: string | null
  mediaType?: string | null
  /** Offline: held until the connection is back (R3-D5 5.8). */
  waiting?: boolean
  /** Removed by moderation: yours stays as the dashed placeholder. */
  removed?: boolean
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

/** A message as the server sends it (history, the send's answer, the socket), as the thread holds it. */
export const directMessageFrom = (msg: any): PrivateMessage => ({
  id: msg.id,
  conversationId: msg.conversationId,
  senderId: msg.senderId,
  sender: msg.sender,
  text: msg.text,
  isRead: msg.isRead,
  deliveredAt: msg.deliveredAt ?? null,
  replyTo: msg.replyTo ?? null,
  createdAt: msg.createdAt,
  mediaUrl: msg.mediaUrl ?? null,
  mediaType: msg.mediaType ?? null,
  ...(msg.moderation_hidden ? { removed: true } : {}),
})

/** A local quote for a message being replied to, before the server's arrives. */
export const quoteFrom = (m: PrivateMessage): DmReplyQuote => ({
  id: m.id,
  senderName: m.sender?.name || '',
  text: m.text,
  mediaType: m.mediaUrl ? 'image' : null,
  unavailable: false,
})

/**
 * A room's messages as the room screen holds them (`app/chat/[id].tsx`), and
 * how the server's two shapes — the history page and the socket — become one.
 * Pure, so a test can hand it a payload.
 */

export interface RoomMessage {
  message_id: string
  sender_id: string
  sender_name: string
  message_text: string
  message_type: string
  reply_to_message_id: string | null
  /** This send's own id, kept on the optimistic row so a retry is the same send (SCRUM-410). */
  client_id?: string
  created_at: string
  /** Hidden by moderation. Only ever true on the sender's own messages. */
  removed?: boolean
  replyTo?: RoomMessage
  reactions?: { emoji: string; count: number; mine?: boolean }[]
  /** Yours, and it did not reach the server. Kept, marked, and retryable. */
  failed?: boolean
  /** The server's reason in the bubble's own words ("Not sent · Two links at most"). */
  failedLine?: string
  /** Offline: held until the connection is back, failed after two minutes (R3-D5 5.8). */
  waiting?: boolean
  /** A sponsored broadcast's media (R3-D5 5.5). */
  media?: { kind: 'image'; uri: string } | { kind: 'video'; uri: string; poster?: string; duration: string }
}

/** Still only on this phone: sending, waiting or failed. A refresh keeps these. */
export const isTemp = (m: Pick<RoomMessage, 'message_id'>) => m.message_id.startsWith('temp-')

/** Somebody talking, as opposed to the room speaking (a system line), a broadcast or a poll. */
export const isSpeech = (m: Pick<RoomMessage, 'sender_id' | 'message_type'>) =>
  m.sender_id !== 'system' && m.message_type !== 'announcement' && m.message_type !== 'sponsored' && m.message_type !== 'poll'

/**
 * A sponsored message's media, from the scheduler's metadata: an image, or a
 * video. Only `media_url`, which the server stores after its upload-grant
 * check; no poster field is read, since none is written and an unchecked one
 * would be a URL the phone loads unasked (Flow 5 security review).
 */
export function mediaOf(msg: any): RoomMessage['media'] {
  const url = msg.metadata?.media_url || msg.media_url || msg.mediaUrl
  if (!url) return undefined
  const type = String(msg.metadata?.media_type || msg.media_type || msg.type || '').toLowerCase()
  if (type.includes('video')) return { kind: 'video', uri: String(url), duration: String(msg.metadata?.duration ?? '') }
  return { kind: 'image', uri: String(url) }
}

/** A history page, as the room holds it: your own is "You", a quote resolved where its parent is loaded. */
export function roomMessagesFrom(raw: any[], userId?: string): RoomMessage[] {
  const list: RoomMessage[] = raw.map((msg: any) => {
    const senderId = msg.sender_id || msg.senderId || msg.user_id || msg.userId
    const serverName = msg.user?.name || msg.sender_name || msg.senderName || 'Attendee'
    // An ad's `type` is its media kind; the marker is in metadata (K3.2).
    const sponsored = !!msg.metadata?.sponsored_message_id
    return {
      message_id: msg.id || msg.message_id,
      sender_id: senderId,
      sender_name: senderId === 'system' ? 'System' : senderId === userId ? 'You' : serverName,
      message_text: msg.message_text || msg.content || msg.text || '',
      // The server nulls the text and says why; an empty bubble said nothing.
      removed: Boolean(msg.moderation_hidden),
      message_type: sponsored ? 'sponsored' : msg.message_type || msg.type || 'text',
      ...(sponsored ? { media: mediaOf(msg) } : {}),
      // The server's field is `parent_id`; a reply lost its quote on reload otherwise.
      reply_to_message_id: msg.parent_id || msg.reply_to_message_id || msg.replyToMessageId || null,
      created_at: msg.created_at || msg.createdAt,
      // `parent_message` rides along on history, so a quote survives the parent scrolling away.
      replyTo: msg.parent_message
        ? {
            message_id: msg.parent_message.id,
            sender_id: msg.parent_message.user?.id ?? '',
            sender_name: msg.parent_message.user?.id === userId ? 'You' : msg.parent_message.user?.name || 'Attendee',
            message_text: msg.parent_message.content ?? '',
            message_type: 'text',
            reply_to_message_id: null,
            created_at: msg.parent_message.created_at ?? '',
          }
        : undefined,
      // Counts and yours, from the server's tally; never who.
      reactions: Array.isArray(msg.reactions) ? msg.reactions : undefined,
    }
  })
  return list.map((msg) => ({
    ...msg,
    replyTo: msg.reply_to_message_id ? list.find((m) => m.message_id === msg.reply_to_message_id) ?? msg.replyTo : undefined,
  }))
}

/** A `chat:message` from the socket, as the room holds it. */
export function roomMessageFromSocket(
  message: { id: string; userId: string; userName?: string; content: string; kind?: string; type?: string; parentId?: string | null; createdAt: string },
  userId: string | undefined
): RoomMessage {
  return {
    message_id: message.id,
    sender_id: message.userId,
    sender_name: message.userId === userId ? 'You' : message.userName || 'Attendee',
    message_text: message.content,
    message_type: message.kind === 'sponsored' ? 'sponsored' : message.type || 'text',
    reply_to_message_id: message.parentId || null,
    created_at: message.createdAt,
  }
}

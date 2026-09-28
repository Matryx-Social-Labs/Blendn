/**
 * Who you are rating, as you know them.
 *
 * `GET /events/:id/peer-ratings` answers ids only — deliberately: it is a
 * gate, not a profile. The face and name come from your conversation list,
 * because every person on it is a mutual like, and a mutual like opened a
 * conversation. That list is the one surface that already resolves somebody
 * *as they appear to you*: their pseudonym and no photo until they revealed,
 * their name and face once they have (`mayShowRealName` on the server).
 *
 * The public profile would have been the obvious fetch and the wrong one — it
 * answers a real name and photo for an id, so the rating screen would have
 * unmasked somebody who met you anonymously, at the exact moment you are
 * deciding whether they made you uncomfortable.
 */

export interface RatePerson {
  id: string
  /** How they appear to you. Never their real name unless they revealed. */
  name: string
  /** Only when they revealed. `Face` draws their creature otherwise. */
  photo: string | null
}

/** Somebody the list has not caught up with: a safe, anonymous stand-in. */
export const UNKNOWN_MATCH = 'Your match'

type ConversationLike = Record<string, unknown>

function otherUserOf(c: ConversationLike): { id?: unknown; name?: unknown; image?: unknown } | null {
  const other = c.otherUser
  return other && typeof other === 'object' ? (other as { id?: unknown; name?: unknown; image?: unknown }) : null
}

export function ratePeople(userIds: readonly string[], conversations: readonly ConversationLike[]): RatePerson[] {
  const known = new Map<string, { name: string | null; photo: string | null }>()
  for (const c of conversations) {
    const other = otherUserOf(c)
    if (!other || typeof other.id !== 'string') continue
    known.set(other.id, {
      name: typeof other.name === 'string' && other.name.trim() ? other.name.trim() : null,
      photo: typeof other.image === 'string' && other.image ? other.image : null,
    })
  }
  return userIds.map((id) => {
    const k = known.get(id)
    return { id, name: k?.name ?? UNKNOWN_MATCH, photo: k?.photo ?? null }
  })
}

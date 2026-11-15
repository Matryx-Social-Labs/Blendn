import { isHandle } from './friendOffer'
import { markSeed } from './pseudonymAvatar'

/**
 * Who the attendee profile (`app/user/[id].tsx`) says this is, and what it may
 * draw — decided by the server's `identityVisible` and nothing else.
 *
 * ## Fail closed
 *
 * The screen used to infer "revealed" from what arrived: a photo, a bio or an
 * occupation meant yes. That is the wrong direction for a privacy gate. A
 * field that turns up by mistake — an older route, a fallback endpoint, a
 * server bug — became a reveal nobody agreed to, with the real name as the
 * title. Now only `identityVisible === true` (or your own profile) shows
 * identity, and when it is anything else the photos, bio, occupation,
 * education and interests are dropped here, at the boundary, even if the payload had them.
 */

export interface ProfileFields {
  name?: string
  age?: number
  bio?: string
  occupation?: string
  education?: string
  photos?: string[]
  /** Interest chips, and the ones you share: identity-gated like the bio (YOU-03; the server sends `[]` too, SV-10). */
  interests?: string[]
  sharedInterests?: string[]
  /** Languages, home state, sign — sent only when identified; withheld here too. */
  about?: string | null
  identityVisible: boolean
}

/** The payload with every identity field removed unless the server said you may see it. */
export function withheldUnlessVisible<T extends ProfileFields>(profile: T): T {
  if (profile.identityVisible === true) return profile
  return { ...profile, photos: [], bio: undefined, occupation: undefined, education: undefined, about: undefined, interests: [], sharedInterests: [] }
}

export interface ProfileIdentity {
  revealed: boolean
  /** The hero's title: "Julian, 24" once visible; the room's pseudonym until then. */
  title: string
  /** The name alone ("Julian"; the pseudonym until then), for a hero that sets the age beside it in its own face. */
  name: string
  /** Their age, when the server sent one: it is outside the identity gate, so a pseudonym carries it too. */
  age: number | null
  /** What the generated mark is seeded on (`markSeed`) — never a user id. */
  seed: string
}

/**
 * @param from The room this was opened from, when it was: the person's
 *   pseudonym there, and a per-room seed for the mark when the pseudonym is a
 *   placeholder. `ref` is the id the page asked the server by. Asked by a room
 *   handle, the server answers in that room's terms, so for somebody still
 *   anonymous its `name` is their pseudonym there (SCRUM-1046: a cold link or
 *   Room info passes none). Asked by a real id it is the flat "Attendee", or
 *   whatever a buggy route sent, and is never shown: the page says "Someone".
 */
export function profileIdentity(
  profile: Pick<ProfileFields, 'name' | 'age' | 'identityVisible'> | null,
  from: { pseudonym?: string | null; roomSeed?: string | null; ref?: string | null } = {}
): ProfileIdentity {
  const revealed = profile?.identityVisible === true
  // A placeholder ("Attendee": a DM's handle, an erased member) is no name; `markSeed` knows them all.
  const roomName = from.ref && isHandle(from.ref) ? markSeed(profile?.name, '') || null : null
  const pseudonym = from.pseudonym?.trim() || (revealed ? null : roomName)
  const fallbackSeed = from.roomSeed || 'someone'
  const age = typeof profile?.age === 'number' && profile.age > 0 ? profile.age : null
  if (revealed) {
    return {
      revealed,
      title: [profile?.name, profile?.age].filter(Boolean).join(', ') || 'Someone',
      name: profile?.name || 'Someone',
      age,
      seed: markSeed(pseudonym ?? profile?.name, fallbackSeed),
    }
  }
  return { revealed, title: pseudonym ?? 'Someone', name: pseudonym ?? 'Someone', age, seed: markSeed(pseudonym, fallbackSeed) }
}

type WorkFieldList = { slug: string; label: string }[]

/** A stored `work_field` code ("data_ai") as its label ("Data & AI"). A code the list does not know is left out, never shown raw. */
export const workFieldLabel = (slug: string | null | undefined, fields: WorkFieldList): string | undefined =>
  slug ? fields.find((f) => f.slug === slug)?.label : undefined

/** "Karthik Subramaniam Venkataraman" is Karthik: a toast or a greeting speaks the way a friend would. */
export const firstNameOf = (name: string): string => name.trim().split(/\s+/)[0] || name

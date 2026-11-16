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
 *   placeholder. `roomName` is the pseudonym a handle read sent
 *   (`roomNameFrom`), for a page opened with none in its link (SCRUM-1046: a
 *   cold link, Room info). With neither there is no pseudonym to show, and the
 *   page says "Someone" rather than any name the profile carries.
 */
export function profileIdentity(
  profile: Pick<ProfileFields, 'name' | 'age' | 'identityVisible'> | null,
  from: { pseudonym?: string | null; roomSeed?: string | null; roomName?: string | null } = {}
): ProfileIdentity {
  const revealed = profile?.identityVisible === true
  const pseudonym = from.pseudonym?.trim() || (revealed ? null : from.roomName?.trim() || null)
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

/**
 * The person's pseudonym in the room a handle names, from `GET /users/:handle`'s own answer (`data`, null when that
 * read failed). Asked by a room handle, the server answers in that room's terms: for somebody still anonymous to you
 * its `name` is the pseudonym there (admin `users/[userId]/route.ts`, `roomPseudonymOf`). Only that field of that
 * answer: never `display_name`, never the `/profiles/:id` fallback, never a real id's answer (the flat "Attendee", or
 * whatever a buggy route sent). A placeholder ("Attendee": a DM's handle, an erased member) is no name.
 */
export function roomNameFrom(
  ref: string,
  data: { name?: unknown; display_name?: unknown; identityVisible?: unknown } | null | undefined
): string | null {
  if (!isHandle(ref) || !data || data.identityVisible === true || typeof data.name !== 'string') return null
  return markSeed(data.name, '') || null
}

type WorkFieldList = { slug: string; label: string }[]

/** A stored `work_field` code ("data_ai") as its label ("Data & AI"). A code the list does not know is left out, never shown raw. */
export const workFieldLabel = (slug: string | null | undefined, fields: WorkFieldList): string | undefined =>
  slug ? fields.find((f) => f.slug === slug)?.label : undefined

/** "Karthik Subramaniam Venkataraman" is Karthik: a toast or a greeting speaks the way a friend would. */
export const firstNameOf = (name: string): string => name.trim().split(/\s+/)[0] || name

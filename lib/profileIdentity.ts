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
 * identity, and when it is anything else the photos, bio, occupation and
 * education are dropped here, at the boundary, even if the payload had them.
 */

export interface ProfileFields {
  name?: string
  age?: number
  bio?: string
  occupation?: string
  education?: string
  photos?: string[]
  /** Languages, home state, sign — sent only when identified; withheld here too. */
  about?: string | null
  identityVisible: boolean
}

/** The payload with every identity field removed unless the server said you may see it. */
export function withheldUnlessVisible<T extends ProfileFields>(profile: T): T {
  if (profile.identityVisible === true) return profile
  return { ...profile, photos: [], bio: undefined, occupation: undefined, education: undefined, about: undefined }
}

export interface ProfileIdentity {
  revealed: boolean
  /** The hero's title: "Julian, 24" once visible; the room's pseudonym until then. */
  title: string
  /** What the generated mark is seeded on (`markSeed`) — never a user id. */
  seed: string
}

/**
 * @param from The room this was opened from, when it was: the person's
 *   pseudonym there, and a per-room seed for the mark when the pseudonym is a
 *   placeholder. Opened from anywhere else there is no pseudonym to show, and
 *   the page says "Someone" rather than the server's flat "Attendee".
 */
export function profileIdentity(
  profile: Pick<ProfileFields, 'name' | 'age' | 'identityVisible'> | null,
  from: { pseudonym?: string | null; roomSeed?: string | null } = {}
): ProfileIdentity {
  const revealed = profile?.identityVisible === true
  const pseudonym = from.pseudonym?.trim() || null
  const fallbackSeed = from.roomSeed || 'someone'
  if (revealed) {
    return {
      revealed,
      title: [profile?.name, profile?.age].filter(Boolean).join(', ') || 'Someone',
      seed: markSeed(pseudonym ?? profile?.name, fallbackSeed),
    }
  }
  return { revealed, title: pseudonym ?? 'Someone', seed: markSeed(pseudonym, fallbackSeed) }
}

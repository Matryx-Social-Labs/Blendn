/**
 * Your own card as a room reads it (`GET /me/preview`, admin #998, SCRUM-1076), for "See as others do" on Me. The server builds
 * both cards with the code that answers a room member, so what it leaves out is left out here: nothing is filled in on the phone.
 */
import { interestNames } from './meProfile'

export interface MePreview {
  /** Your card before you show who you are: the name you carried in the room joined last. Null before a first room. */
  anonymous: { name: string; age?: number } | null
  named: { name: string; age?: number; photo: string | null; about: string | null; interests: string[]; work: string | null }
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const ageOf = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)

/** The preview out of the answer; null when it is not one (a failure, never an empty card). */
export function mePreviewFrom(data: unknown): MePreview | null {
  const raw = data as { pseudonym?: unknown; anonymous?: Record<string, unknown>; named?: Record<string, unknown> } | null | undefined
  const named = raw?.named
  const name = text(named?.name)
  if (!raw || !named || !name || !raw.anonymous) return null
  // `pseudonym`, never the anonymous card's `name`: that is the flat "Attendee" before a first room.
  const pseudonym = text(raw.pseudonym)
  const photos = Array.isArray(named.photos) ? named.photos : []
  return {
    anonymous: pseudonym ? { name: pseudonym, age: ageOf(raw.anonymous.age) } : null,
    named: {
      name,
      age: ageOf(named.age),
      photo: text(photos[0]) ?? text(named.image),
      about: text(named.bio),
      interests: interestNames(named.interests),
      work: text(named.occupation),
    },
  }
}

import type { Badge } from './aboutYou'
import { parseBadges } from './profileBadges'

/**
 * What `GET /profiles/:id` carries that `GET /users/:id` may not: their badges, and `friend` (the friend offer, which the
 * friend-offer reader parses; here it is passed through untouched). A server that puts both on `/users/:id` (blendn-admin
 * follow-up to #716) sends `friend` there, and then nothing here is asked. An older one sends neither, and this is the ONE
 * extra request, shared by whoever asks for the same person while it is on the wire.
 */
export interface ProfileExtras {
  /** null: none sent (badges off, anonymous to you, or an older server). */
  badges: Badge[] | null
  friend: unknown
}

const inFlight = new Map<string, Promise<ProfileExtras | null>>()

/** One read of `/profiles/:id` for its extras, or null when it failed. Never touches the profile cache (it holds YOUR profile). */
export function profileExtras(id: string): Promise<ProfileExtras | null> {
  const wired = inFlight.get(id)
  if (wired) return wired
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { apiClient } = require('./apiClient') as typeof import('./apiClient')
  const read = (async (): Promise<ProfileExtras | null> => {
    try {
      const result = await apiClient.getProfile(id, { cache: false })
      if (!result.success || !result.data) return null
      const data = result.data as { profile?: { badges?: unknown }; friend?: unknown }
      return { badges: parseBadges(data.profile?.badges), friend: data.friend }
    } catch {
      return null
    }
    // Cleared from a later turn, so a read that failed at once still comes after the `set` below, never before it.
  })().finally(() => inFlight.delete(id))
  inFlight.set(id, read)
  return read
}

/**
 * The badges on a `/users/:id` answer, when it is the server that knows to send them: `friend` beside them says so. Then a
 * missing `badges` means "off" (`[]` here, nothing drawn). Without `friend` the server is an older one, and a missing key says
 * nothing: `null`, and the caller asks `profileExtras`.
 */
export function badgesOnUserRead(data: { badges?: unknown; friend?: unknown }): Badge[] | null {
  const parsed = parseBadges(data.badges)
  if (parsed) return parsed
  return 'friend' in data ? [] : null
}

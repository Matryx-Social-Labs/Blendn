/**
 * The links Blend'n sends and the links it opens (Flow 16 · 16.1 and 16.7), in one place.
 *
 * Outbound: `https://www.blendn.app/e/<event id>`, `/v/<venue id>` and `/f/<invite token>`. The host is `www` because
 * that is the host the iOS associated domain and the Android intent filters verify (`app.json`); the bare domain
 * redirects, and a redirect hands the tap to the browser instead of the app. The id is the event's id, never its slug:
 * a link is a frozen snapshot forwarded to strangers, and a slug names the thing.
 *
 * Inbound: the same three, plus the paths the app already answers to (`/event/<id>`, from an organiser's QR code). The
 * file routes are `app/event/[id]`, `app/venue/[id]` and `app/f/[token]`, so `/e/` and `/v/` are rewritten to them by
 * `app/+native-intent.tsx` before the router sees them.
 */

export const SHARE_HOST = 'www.blendn.app'
export const SHARE_ORIGIN = `https://${SHARE_HOST}`
const OUR_HOSTS: ReadonlySet<string> = new Set([SHARE_HOST, 'blendn.app'])

/** An id or token as it may appear in a path: what the server mints, nothing that could climb out of one segment. */
const SEGMENT = /^[A-Za-z0-9_-]{1,64}$/

export type LinkKind = 'event' | 'venue' | 'invite'
export type LinkTarget = { kind: LinkKind; id: string }

export const eventLink = (id: string): string => `${SHARE_ORIGIN}/e/${id}`
export const venueLink = (id: string): string => `${SHARE_ORIGIN}/v/${id}`
export const inviteLink = (token: string): string => `${SHARE_ORIGIN}/f/${token}`

/** The file route a target opens in the app. */
export function routeFor({ kind, id }: LinkTarget): string {
  if (kind === 'event') return `/event/${id}`
  if (kind === 'venue') return `/venue/${id}`
  return `/f/${id}`
}

const KIND_OF_PREFIX: Record<string, LinkKind> = { e: 'event', event: 'event', v: 'venue', venue: 'venue', f: 'invite' }

/**
 * What a link or path points at, or null for anything else. Takes `https://www.blendn.app/e/<id>`, `blendn://e/<id>`
 * and a bare `/e/<id>`; an `https` link on another host is not ours and is refused.
 */
export function parseLink(input: string | null | undefined): LinkTarget | null {
  if (!input) return null
  const web = input.match(/^https?:\/\/([^/?#]+)(\/[^?#]*)?/i)
  if (web && !OUR_HOSTS.has(web[1].toLowerCase())) return null
  const path = web ? (web[2] ?? '') : input.replace(/^[a-z][a-z0-9+.-]*:\/{0,2}/i, '/').replace(/^\/{2,}/, '/')
  // The id is the last segment: `/e/<id>/anything` is not a link to the event.
  const match = path.match(/^\/?([a-z]+)\/([^/?#]*)\/?(?:[?#].*)?$/i)
  if (!match) return null
  const kind = KIND_OF_PREFIX[match[1].toLowerCase()]
  let id: string
  try {
    id = decodeURIComponent(match[2])
  } catch {
    return null
  }
  return kind && SEGMENT.test(id) ? { kind, id } : null
}

/**
 * The path the router should open for an incoming system URL (`redirectSystemPath`): `/e/<id>` and `/v/<id>`, which
 * have no screen of their own, become the event's and the venue's.
 *
 * A link to an event or a venue never keeps its query. The Scene reads title, cover and description from its route to
 * draw before it has loaded (`lib/sceneSeed.ts`), and a link is anyone's string: `?title=…&cover=https://attacker/x.jpg`
 * would put their words on our screen and make the phone fetch their image. That holds for `/event/` and `/venue/` as
 * they arrive, the `blendn://` form, and a path that does not parse as a link but still names one. An invite keeps its
 * path as it came (its token is the only thing in it), and anything else is not ours to rewrite.
 */
export function nativeIntentPath(path: string): string {
  const target = parseLink(path)
  if (target && target.kind !== 'invite') return routeFor(target)
  // Names an event or a venue but is not a clean link (an id that would climb out of its segment): no query, no rewrite.
  const base = path.split(/[?#]/, 1)[0]
  return /(?:^|\/)(?:event|venue|e|v)\//i.test(base) ? base : path
}

/* -------------------------------------------------------------------------- */

/**
 * Whether an event may be put in a link (the "never shareable" list).
 *
 * - `public`: shared as it is.
 * - `unlisted`: shared, with the area only: never the venue or the street. The public page is `noindex` and says the same.
 * - `never`: private, a draft, deleted. The share control is hidden, never disabled, and no link is made.
 * - `unknown`: the list this row came from does not say. Ask the event itself before opening the tray.
 */
export type Shareability = 'public' | 'unlisted' | 'never' | 'unknown'

export function shareability(event: { visibility?: string | null; status?: string | null }): Shareability {
  if (event.status === 'draft' || event.status === 'deleted') return 'never'
  if (event.visibility === 'public') return 'public'
  if (event.visibility === 'unlisted') return 'unlisted'
  if (event.visibility === 'private') return 'never'
  return 'unknown'
}


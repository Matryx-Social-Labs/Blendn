/**
 * The links Blend'n sends and the links it opens (Flow 16 · 16.1 and 16.7), in one place.
 *
 * Outbound: `https://www.blendn.app/event/<event id>` and `/f/<invite token>` for now (`WEB_PAGES_LIVE`), and a venue's
 * share points at the site's front page: the live site's associated-domain file lists only `/f/*` and `/event/*`, and
 * `/e/` and `/v/` serve the homepage, so a link on them opens nothing (SCRUM-738). The host is `www` because
 * that is the host the iOS associated domain and the Android intent filters verify (`app.json`); the bare domain
 * redirects, and a redirect hands the tap to the browser instead of the app. The id is the event's id, never its slug:
 * a link is a frozen snapshot forwarded to strangers, and a slug names the thing.
 *
 * Inbound: `/e/`, `/v/` and `/f/` AND `/event/` / `/venue/`, whatever `WEB_PAGES_LIVE` says (links already sent, the Android
 * intent filters and an organiser's QR code all use them). The
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

/**
 * The one switch for the interim (SCRUM-738). False until the public `/e/<id>` and `/v/<id>` pages and their associated-domain
 * entries are live (SCRUM-689), then true: an event goes back to `/e/<id>` and a venue to its own `/v/<id>`.
 *
 * Why a venue is the front page meanwhile, not "the venue's next event": the card the sender approved says the venue, and
 * the page behind the link would be an event (or nothing, for a venue with none coming), and a venue's event may not be
 * shareable at all. A link that works and says less beats one that opens something else. The tray's text names the venue.
 */
export const WEB_PAGES_LIVE = false

export const eventLink = (id: string): string => `${SHARE_ORIGIN}/${WEB_PAGES_LIVE ? 'e' : 'event'}/${id}`
export const venueLink = (id: string): string => (WEB_PAGES_LIVE ? `${SHARE_ORIGIN}/v/${id}` : SHARE_ORIGIN)
export const inviteLink = (token: string): string => `${SHARE_ORIGIN}/f/${token}`

/** The file route a target opens in the app. */
export function routeFor({ kind, id }: LinkTarget): string {
  if (kind === 'event') return `/event/${id}`
  if (kind === 'venue') return `/venue/${id}`
  return `/f/${id}`
}

const KIND_OF_PREFIX: Record<string, LinkKind> = { e: 'event', event: 'event', v: 'venue', venue: 'venue', f: 'invite' }

/**
 * Reduces a URL or path to what could name a route, and does it in ONE place: both `parseLink` (what is this link?) and
 * `nativeIntentPath` (what does the router get?) read this, so they cannot disagree about a form one of them did not
 * think of. Control characters are dropped and backslashes become slashes (as a browser reads them); the query and the
 * fragment go; the scheme goes, and for https the host is kept apart; slashes collapse. The segments are returned as they
 * came, still encoded: they are decoded once, for the decision, and never echoed back decoded.
 */
function normalise(input: string): { host: string | null; segments: string[] } {
  let rest = input.replace(/[\t\n\r]/g, '').replace(/\\/g, '/').trim().split(/[?#]/, 1)[0]
  let host: string | null = null
  const scheme = rest.match(/^([a-z][a-z0-9+.-]*):/i)
  if (scheme) {
    rest = rest.slice(scheme[0].length)
    if (/^https?$/i.test(scheme[1])) {
      const authority = rest.match(/^\/*([^/]*)(.*)$/s)
      host = (authority?.[1] ?? '').toLowerCase()
      rest = authority?.[2] ?? ''
    }
  }
  return { host, segments: rest.split('/').filter(Boolean) }
}

/** The one place a normalised path becomes a target: the route word case-folded, each segment decoded once. */
function targetOf({ host, segments }: ReturnType<typeof normalise>): LinkTarget | null {
  if (host !== null && !OUR_HOSTS.has(host)) return null
  if (segments.length !== 2) return null
  let route: string
  let id: string
  try {
    route = decodeURIComponent(segments[0]).toLowerCase()
    id = decodeURIComponent(segments[1])
  } catch {
    return null
  }
  const kind = KIND_OF_PREFIX[route]
  return kind && SEGMENT.test(id) ? { kind, id } : null
}

/**
 * What a link or path points at, or null for anything else. Takes `https://www.blendn.app/e/<id>`, `blendn://e/<id>`
 * and a bare `/e/<id>`, in any case, encoding, slash count or scheme form `normalise` understands; an `https` link on
 * another host is not ours and is refused.
 */
export function parseLink(input: string | null | undefined): LinkTarget | null {
  return input ? targetOf(normalise(input)) : null
}

/**
 * The URLs that are not routes and keep what they carry: the dev client's launch link, which is only the dev client's
 * root and its `url` query. Nothing else that arrives from outside needs a query: invites carry their token in the path,
 * notification taps navigate in JS, and sign-in with Google or Apple is native.
 */
const KEEPS_ITS_QUERY: readonly RegExp[] = [/^exp\+blendn:\/\/expo-development-client\/?(?:[?#]|$)/i]

/**
 * The path the router gets for an incoming system URL (`redirectSystemPath`). Fail closed: every external URL loses its
 * query and fragment (but a room link's checked `eventId` and `opensAt`, `chatQuery`), so no screen can be handed a param by a link (a DM's `draft` and `otherUserName`, sign-in's
 * `notice`, forgot-password's `email`, the Scene's title and cover). A link to an event, a venue or an invite is rebuilt
 * from its validated id (`/e/` and `/v/` have no screen of their own and become the event's and the venue's); an https
 * link on another host goes to the root; any other path keeps only its own segments.
 */
export function nativeIntentPath(path: string): string {
  // The dev client's launch link only exists in development; a Release build strips it like any other.
  if (__DEV__ && KEEPS_ITS_QUERY.some((re) => re.test(path))) return path
  const n = normalise(path)
  if (n.host !== null && !OUR_HOSTS.has(n.host)) return '/'
  const target = targetOf(n)
  return target ? routeFor(target) : `/${n.segments.join('/')}${chatQuery(n.segments, path)}`
}

/**
 * The one query a link keeps (R6-5): a room link (`/chat/<id>`) keeps `eventId` and `opensAt`, so a room that has not opened
 * yet counts down to the server's own time. Both are checked here (an id's shape, an instant that parses) and again by the
 * chat, which uses `opensAt` only when the link names the event and drops it when the server's door says otherwise. Nothing
 * else: a room's name and title come from the server, never from a link.
 */
const CHAT_LINK_PARAMS: Readonly<Record<string, (value: string) => boolean>> = {
  eventId: (v) => SEGMENT.test(v),
  opensAt: (v) => Number.isFinite(Date.parse(v)),
}
function chatQuery(segments: string[], path: string): string {
  if (segments.length !== 2 || segments[0].toLowerCase() !== 'chat' || !SEGMENT.test(segments[1])) return ''
  const query = path.split('#', 1)[0].split('?')[1] ?? ''
  const kept: string[] = []
  for (const pair of query.split('&')) {
    const [key, raw = ''] = pair.split('=')
    let value: string
    try {
      value = decodeURIComponent(raw.replace(/\+/g, ' '))
    } catch {
      continue
    }
    if (CHAT_LINK_PARAMS[key]?.(value) && !kept.some((k) => k.startsWith(`${key}=`))) kept.push(`${key}=${encodeURIComponent(value)}`)
  }
  return kept.length ? `?${kept.join('&')}` : ''
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


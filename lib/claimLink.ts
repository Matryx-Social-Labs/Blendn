/**
 * "Running this event? Claim it" — the address the server offers, or null.
 *
 * The server decides whether there is one at all (`claim` on
 * `GET /events/:eventId`: a curated event nobody has claimed) and builds it on
 * the dashboard host, so the app hard-codes no environment and never sends a
 * person to the API host, which has no page there.
 *
 * Still checked here, because this opens a browser on whatever it is given: a
 * page under `/claim/` on blendn.app or one of its subdomains
 * (`dashboard.blendn.app`, `staging-dashboard.blendn.app`), over https. A
 * development build may also open plain http on this machine or the local
 * network, where a dev server has no certificate. Anything else opens nothing.
 */
const BLENDN_HOST = /^(?:[a-z0-9-]+\.)*blendn\.app$/
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/

export function claimUrlFrom(claim: unknown, dev: boolean = __DEV__): string | null {
  const raw = (claim as { url?: unknown } | null | undefined)?.url
  if (typeof raw !== 'string') return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (!url.pathname.startsWith('/claim/')) return null
  const ours = url.protocol === 'https:' && BLENDN_HOST.test(url.hostname)
  const local = dev && (url.protocol === 'http:' || url.protocol === 'https:') && LOCAL_HOST.test(url.hostname)
  return ours || local ? url.toString() : null
}

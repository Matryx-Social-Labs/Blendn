/**
 * "Running this event? Claim it" — the address the server offers, or null.
 *
 * The server decides whether there is one at all (`claim` on
 * `GET /events/:eventId`: a curated event nobody has claimed) and builds it on
 * the dashboard host, so the app hard-codes no environment and never sends a
 * person to the API host, which has no page there. This only refuses a value
 * that is not a web page under `/claim/`, so a malformed payload opens nothing
 * rather than something unexpected.
 */
export function claimUrlFrom(claim: unknown): string | null {
  const raw = (claim as { url?: unknown } | null | undefined)?.url
  if (typeof raw !== 'string') return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.pathname.startsWith('/claim/') ? url.toString() : null
  } catch {
    return null
  }
}

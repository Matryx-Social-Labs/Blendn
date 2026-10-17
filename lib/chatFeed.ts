/**
 * How a chat's feed groups and says things (Flow 5): pure, so the screens'
 * rules are pinned by tests rather than re-derived in two renderers.
 */

/**
 * Consecutive messages from one sender run together: their name on the
 * first, their creature, the time and the tail on the last (the ChatBubble
 * page). A day pill, a broadcast or a system line ends a run, and so does a
 * pause long enough that one time under the group would mislabel its start.
 * ponytail: five minutes, the common messenger's; tune it if runs read wrong.
 */
export const RUN_GAP_MS = 5 * 60 * 1000

export type RunPlace = { first: boolean; last: boolean }

/** `speaker` is null for anything that is not somebody talking (it breaks a run). */
export function runPlace<T>(
  items: readonly T[],
  i: number,
  speaker: (item: T) => string | null,
  at: (item: T) => number
): RunPlace {
  const me = speaker(items[i])
  const joins = (j: number, k: number) => {
    const a = items[j]
    const b = items[k]
    if (!a || !b || me === null) return false
    return speaker(a) === me && speaker(b) === me && Math.abs(at(b) - at(a)) <= RUN_GAP_MS
  }
  return { first: !joins(i - 1, i), last: !joins(i, i + 1) }
}

/** "0:12": a rate limit's wait, in Geist Mono, ticked by the screen. */
export function waitLabel(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * The server's reason a send was refused, as the place it is shown (R3-D5 5.4):
 * too many links stays on the bubble ("Not sent · Two links at most"); a burst
 * or a rate limit locks the composer ("Slow down a moment") and the bubble
 * says the usual "Not sent · Tap to retry". The server's spam reasons are
 * developer text ("Too many links (3)") and are never shown.
 */
export function refusalPlace(errorCode: string | null | undefined, serverText: string | null | undefined): 'links' | 'slow' | null {
  if (errorCode === 'SPAM_BLOCKED' && /link/i.test(serverText ?? '')) return 'links'
  if (errorCode === 'SPAM_BLOCKED' || errorCode === 'RATE_LIMITED') return 'slow'
  return null
}
export const LINKS_LINE = 'Not sent · Two links at most'

/**
 * A broadcast's sender and words, from what the server writes into its
 * content (`📢 [Announcement from Toit]\n…`, `📣 [Sponsored]\n…`). The prefix is
 * the server's bookkeeping, never shown (R3-D5 5.6; SCRUM-625 moves it out of
 * the content). The scheduler sends no brand name yet: a sponsor is "Partner".
 */
const BROADCAST_HEAD = /^\s*(?:📢|📣)\s*\[(?:Announcement from\s+(.+?)|Sponsored)\]\s*\n?/u
export function broadcastParts(kind: 'announcement' | 'sponsored', content: string, fallbackFrom: string): { from: string; text: string } {
  const head = content.match(BROADCAST_HEAD)
  const text = head ? content.slice(head[0].length).trim() : content.trim()
  const named = head?.[1]?.trim()
  return { from: named || (kind === 'sponsored' ? 'Partner' : fallbackFrom), text }
}

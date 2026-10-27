/**
 * The server's bounds on a list's `search` (admin #751, `GET /events`): trimmed, 2 to 100 characters; outside them a 400
 * `VALIDATION_FAILED` with `reasonCode: SEARCH_TOO_SHORT`. The client never sends one it would refuse: under 2 characters
 * the list is the normal, unfiltered one, and a field holds at most 100.
 */
export const SEARCH_MIN = 2
export const SEARCH_MAX = 100
export const SEARCH_TOO_SHORT = 'SEARCH_TOO_SHORT'

/** What a list is searched by: the trimmed words, at most `SEARCH_MAX`; null under `SEARCH_MIN` (no search at all). */
export function searchTermOf(input: string | null | undefined): string | null {
  const term = (input ?? '').trim().slice(0, SEARCH_MAX).trim()
  return term.length >= SEARCH_MIN ? term : null
}

import { apiClient } from './apiClient'
import type { BlockedUser } from './safetyUtils'

/**
 * One page of the people you blocked (`GET /users/blocked`).
 *
 * The list is read a page at a time: `limit` always, `cursor` from the page before. The server is moving this route to
 * cursors (`nextCursor`, flat or under `pagination`; the screen draws no count, so a `total` is not read). Until it has, it
 * ignores both parameters and sends everyone in `users` with no cursor, which reads here as one page that is the whole list and has no next: the screen
 * works on both, and is virtualised either way.
 */
export const BLOCKED_PAGE_SIZE = 50

export type BlockedPage = { users: BlockedUser[]; nextCursor: string | null }
export type BlockedPageResult = { ok: true; page: BlockedPage } | { ok: false; error?: string }

type Raw = {
  users?: unknown
  nextCursor?: unknown
  pagination?: { nextCursor?: unknown } | null
}

const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

/** A page out of the server's answer, tolerant of where it puts the cursor. Null when there is no `users` list. */
export function blockedPageFrom(data: unknown): BlockedPage | null {
  const raw = data as Raw | null
  if (!raw || !Array.isArray(raw.users)) return null
  return {
    users: raw.users as BlockedUser[],
    nextCursor: text(raw.nextCursor) ?? text(raw.pagination?.nextCursor),
  }
}

/** A failure stays a failure, never an empty list: "nobody blocked" is the wrong thing to say to somebody offline. */
export async function fetchBlockedPage(cursor: string | null = null): Promise<BlockedPageResult> {
  const query = `limit=${BLOCKED_PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
  const result = await apiClient.queuedRequest<unknown>(`/api/mobile/users/blocked?${query}`, undefined, true, 4)
  const page = result.success ? blockedPageFrom(result.data) : null
  return page ? { ok: true, page } : { ok: false, error: result.error }
}

/**
 * The count on Settings' Blocked row and the search's placeholder: "3 people", "50+ people" when a page is still to come (the
 * server sends no total yet: ROADMAP § Backend later). Null for nobody, which the row leaves unsaid.
 */
export function blockedCountLine(count: number, more: boolean): string | null {
  if (count <= 0) return null
  return `${count.toLocaleString('en-US')}${more ? '+' : ''} ${count === 1 && !more ? 'person' : 'people'}`
}

/** Past this many loaded, Blocked offers a search (Me + settings A 06). */
export const BLOCKED_SEARCH_FROM = 20
/**
 * How many rows Blocked loads at most. ponytail: the search runs over the loaded rows only, so past the cap a name further back
 * is not found; a server-side search (ROADMAP § Backend later) lifts it.
 */
export const BLOCKED_LOAD_CAP = 1000

/** The loaded rows whose name holds the query, case- and accent-blind; an empty query is everyone. */
export function searchBlocked<T extends { blocked_user_name?: string | null }>(users: readonly T[], query: string): readonly T[] {
  const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()
  const q = fold(query.trim())
  if (!q) return users
  return users.filter((u) => fold(u.blocked_user_name ?? '').includes(q))
}

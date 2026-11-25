import { apiClient } from './apiClient'
import type { BlockedUser } from './safetyUtils'

/**
 * One page of the people you blocked (`GET /users/blocked`).
 *
 * The list is read a page at a time: `limit` always, `cursor` from the page before, `q` for a search the server runs (over the
 * pseudonym you saw, where you blocked them, and a name you were allowed to see). `total` is the server's
 * `pagination.totalCount`: the whole list, or the whole search. A server with no cursors sends everyone in `users`, which reads
 * here as one page that is the whole list.
 */
export const BLOCKED_PAGE_SIZE = 50

export type BlockedPage = { users: BlockedUser[]; nextCursor: string | null; total: number }
export type BlockedPageResult = { ok: true; page: BlockedPage } | { ok: false; error?: string }

type Raw = {
  users?: unknown
  nextCursor?: unknown
  pagination?: { nextCursor?: unknown; totalCount?: unknown } | null
}

const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

/** A page out of the server's answer, tolerant of where it puts the cursor. Null when there is no `users` list. */
export function blockedPageFrom(data: unknown): BlockedPage | null {
  const raw = data as Raw | null
  if (!raw || !Array.isArray(raw.users)) return null
  const total = raw.pagination?.totalCount
  return {
    users: raw.users as BlockedUser[],
    nextCursor: text(raw.nextCursor) ?? text(raw.pagination?.nextCursor),
    total: typeof total === 'number' && Number.isFinite(total) ? total : raw.users.length,
  }
}

/** A failure stays a failure, never an empty list: "nobody blocked" is the wrong thing to say to somebody offline. */
export async function fetchBlockedPage(cursor: string | null = null, search = ''): Promise<BlockedPageResult> {
  const q = search.trim()
  const query = `limit=${BLOCKED_PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`
  const result = await apiClient.queuedRequest<unknown>(`/api/mobile/users/blocked?${query}`, undefined, true, 4)
  const page = result.success ? blockedPageFrom(result.data) : null
  return page ? { ok: true, page } : { ok: false, error: result.error }
}

/** The count on Settings' Blocked row and the search's placeholder, from the server's total: "3 people". Null for nobody. */
export function blockedCountLine(count: number): string | null {
  if (count <= 0) return null
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'person' : 'people'}`
}

/** Past this many blocked, Blocked offers a search (Me + settings A 06). */
export const BLOCKED_SEARCH_FROM = 20

/** The server caps a search at this many characters (`GET /users/blocked?q=`). */
export const BLOCKED_SEARCH_MAX = 100

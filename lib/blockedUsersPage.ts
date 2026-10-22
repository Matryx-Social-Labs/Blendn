import { apiClient } from './apiClient'
import type { BlockedUser } from './safetyUtils'

/**
 * One page of the people you blocked (`GET /users/blocked`).
 *
 * The list is read a page at a time: `limit` always, `cursor` from the page before. The server is moving this route to
 * cursors (`nextCursor`, and a `total`, flat or under `pagination`). Until it has, it ignores both parameters and sends
 * everyone in `users` with neither, which reads here as one page that is the whole list and has no next: the screen
 * works on both, and is virtualised either way.
 */
export const BLOCKED_PAGE_SIZE = 50

export type BlockedPage = { users: BlockedUser[]; nextCursor: string | null; total: number | null }
export type BlockedPageResult = { ok: true; page: BlockedPage } | { ok: false; error?: string }

type Raw = {
  users?: unknown
  nextCursor?: unknown
  total?: unknown
  pagination?: { nextCursor?: unknown; total?: unknown; totalCount?: unknown } | null
}

const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)

/** A page out of the server's answer, tolerant of where it puts the cursor. Null when there is no `users` list. */
export function blockedPageFrom(data: unknown): BlockedPage | null {
  const raw = data as Raw | null
  if (!raw || !Array.isArray(raw.users)) return null
  return {
    users: raw.users as BlockedUser[],
    nextCursor: text(raw.nextCursor) ?? text(raw.pagination?.nextCursor),
    total: count(raw.total) ?? count(raw.pagination?.total) ?? count(raw.pagination?.totalCount),
  }
}

/** A failure stays a failure, never an empty list: "nobody blocked" is the wrong thing to say to somebody offline. */
export async function fetchBlockedPage(cursor: string | null = null): Promise<BlockedPageResult> {
  const query = `limit=${BLOCKED_PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
  const result = await apiClient.queuedRequest<unknown>(`/api/mobile/users/blocked?${query}`, undefined, true, 4)
  const page = result.success ? blockedPageFrom(result.data) : null
  return page ? { ok: true, page } : { ok: false, error: result.error }
}

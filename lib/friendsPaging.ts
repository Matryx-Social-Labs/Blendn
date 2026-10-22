/**
 * The friend lists, a page at a time (admin #724: `?limit=`, `pagination.nextCursor`, `pagination.totalCount`).
 *
 * Pure, so every rule about a page is tested without a render. The server may answer without `pagination` (an older
 * one, or a mock): that reads as one page that is the whole list, with no next, and the count is what was sent.
 */

import type { Friend, FriendRequest } from './friends'

/** How many friends a page holds (the server's `?limit=` 1-100); `LIST_PAGE.friends` in the API client is this number. */
export const FRIENDS_PAGE = 100

export type Page<T> = { items: T[]; nextCursor: string | null; total: number }
export type RequestSide = 'incoming' | 'outgoing'

type Meta = { nextCursor?: unknown; hasMore?: unknown; totalCount?: unknown }

const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const whole = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null)

/** The next cursor, only when the server says there is more: a cursor on a last page must never ask for another. */
const nextOf = (meta: Meta | null | undefined): string | null => (meta && meta.hasMore !== false ? text(meta.nextCursor) : null)

/** The friends page out of `GET /friends`; null when there is no `friends` list (a failure, never an empty list). */
export function friendsPageFrom(data: unknown): Page<Friend> | null {
  const raw = data as { friends?: unknown; count?: unknown; pagination?: Meta | null } | null
  if (!raw || !Array.isArray(raw.friends)) return null
  const items = raw.friends as Friend[]
  return { items, nextCursor: nextOf(raw.pagination), total: whole(raw.pagination?.totalCount) ?? whole(raw.count) ?? items.length }
}

/** One side of `GET /friends/requests`; null when the answer has no list for it. */
export function requestsPageFrom(data: unknown, side: RequestSide): Page<FriendRequest> | null {
  const raw = data as ({ pagination?: { incoming?: Meta; outgoing?: Meta } | null } & Partial<Record<RequestSide, unknown>>) | null
  const list = raw?.[side]
  if (!raw || !Array.isArray(list)) return null
  const meta = raw.pagination?.[side]
  return { items: list as FriendRequest[], nextCursor: nextOf(meta), total: whole(meta?.totalCount) ?? list.length }
}

/** A later page onto what is held: the key is the person (or the request), so a row the server moved between pages never draws twice. */
export function appendUnique<T>(held: readonly T[], next: readonly T[], keyOf: (item: T) => string): T[] {
  const seen = new Set(held.map(keyOf))
  return [...held, ...next.filter((item) => !seen.has(keyOf(item)))]
}

/**
 * A focus refresh's first page laid over a list that may have been read further (so a screen coming back from a profile
 * does not jump to the top).
 *
 * The page replaces the head. What was loaded past the page's last row stays, unless the page is the whole list now
 * (`nextCursor` null: whatever was past it is gone) or its last row is no longer in what is held (the boundary moved: the
 * old tail cannot be joined to the new head). Then the page stands alone and `keptTail` is false: the caller's cursor must
 * be the page's.
 */
export function refreshFirstPage<T>(
  held: readonly T[],
  page: Page<T>,
  keyOf: (item: T) => string
): { items: T[]; keptTail: boolean } {
  if (page.nextCursor === null || page.items.length === 0) return { items: page.items, keptTail: false }
  const lastKey = keyOf(page.items[page.items.length - 1])
  const joint = held.findIndex((item) => keyOf(item) === lastKey)
  if (joint < 0) return { items: page.items, keptTail: false }
  return { items: [...page.items, ...held.slice(joint + 1)], keptTail: joint + 1 < held.length }
}

import { apiClient, type ApiResponse } from './apiClient'
import type { BoardPost } from './board'

/**
 * Cursor paging for the lists a concert can fill (SCRUM-760: every list is designed for thousands): the Board's posts
 * and the Banter's conversations. The server's cursor is the one every other list here speaks (`pagination` with
 * `hasMore` and `nextCursor`, blendn-admin lib/pagination.ts `CursorPaginationMeta`); it is added to these two reads
 * on blendn-admin `feat/redesign-sv-a`. Until a server sends one, `cursorOf` is null, nothing more is asked, and the
 * list is the single page it always was, so an older server loses nothing.
 */

/** The next-page cursor in a list's body, or null when it says there is no more (or says nothing). */
export function cursorOf(body: unknown): string | null {
  const data = body as { pagination?: { hasMore?: unknown; nextCursor?: unknown }; hasMore?: unknown; nextCursor?: unknown } | null | undefined
  const meta = data?.pagination ?? data
  if (!meta || meta.hasMore === false) return null
  return typeof meta.nextCursor === 'string' && meta.nextCursor ? meta.nextCursor : null
}

/** A board post that may carry what the server will say about a post it took down (SV9, not sent yet). */
export type BoardPostView = BoardPost & {
  /**
   * Proposed: the author's own post that moderation took down is listed to them alone with `takenDown: true`, so the
   * board can say why it went (Flow 4 · 4.10 frame 36). Until then it just vanishes, as it did.
   */
  takenDown?: boolean
}

type BoardPage = { posts: BoardPostView[]; pagination?: { hasMore?: boolean; nextCursor?: string | null } }

/** The next page of an event's board, after `cursor`. */
export function getBoardPage(eventId: string, cursor: string): Promise<ApiResponse<BoardPage>> {
  return apiClient.queuedRequest<BoardPage>(`/api/mobile/events/${encodeURIComponent(eventId)}/board?cursor=${encodeURIComponent(cursor)}`)
}

/**
 * A refresh's newest page laid over what the list already holds: the page first, then the older pages loaded earlier
 * (`older` names them), minus anything the page now has. The page's copy wins. A forced refresh does not use this:
 * it starts the list over, which is how a block or a pull drops what was loaded under it.
 */
export function laidOver<T>(page: readonly T[], held: readonly T[], idOf: (item: T) => string, older: ReadonlySet<string>): T[] {
  const onPage = new Set(page.map(idOf))
  return [...page, ...held.filter((item) => older.has(idOf(item)) && !onPage.has(idOf(item)))]
}

/** `GET /chat/groups` pages by number; this is the next one, or null on the last (or when it sends no paging). */
export function nextGroupsPage(body: unknown): number | null {
  const meta = (body as { pagination?: { page?: unknown; hasMore?: unknown } } | null | undefined)?.pagination
  return meta?.hasMore === true ? (typeof meta.page === 'number' ? meta.page : 1) + 1 : null
}

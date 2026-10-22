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

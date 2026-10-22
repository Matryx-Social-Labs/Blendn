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

/**
 * A post of yours that moderation took down (SV9), as the server's first page lists it beside `posts`: yours only (another
 * reader gets none), newest first, at most 20, never your own withdrawals, never on a later page.
 */
export type TakenDown = { id: string; kind: BoardPost['kind']; body: string; createdAt: string; takenDownAt: string }

/** A board post as the Board draws it: `takenDown` marks the card that says why the post went. */
export type BoardPostView = BoardPost & { takenDown?: boolean }

type BoardPage = {
  posts: BoardPostView[]
  /** The first page only. */
  takenDown?: TakenDown[]
  pagination?: { hasMore?: boolean; nextCursor?: string | null; totalCount?: number }
}

/** The cards for posts taken down: yours, with no spaces and nobody asking, drawn by `takenDown`. */
export const goneFrom = (taken: readonly TakenDown[] | undefined): BoardPostView[] =>
  (taken ?? []).map((t) => ({
    id: t.id,
    kind: t.kind,
    body: t.body,
    spacesLeft: null,
    createdAt: t.createdAt,
    author: 'You',
    mine: true,
    requestCount: 0,
    takenDown: true,
  }))

/** The next page of an event's board, after `cursor`. */
export function getBoardPage(eventId: string, cursor: string): Promise<ApiResponse<BoardPage>> {
  return apiClient.queuedRequest<BoardPage>(`/api/mobile/events/${encodeURIComponent(eventId)}/board?cursor=${encodeURIComponent(cursor)}`)
}

/**
 * A refresh's newest page laid over what the list already holds. With no older page loaded (`older` empty) the page is the
 * list. With some, the page comes first and everything held that is not on it stays: an item that slid off the newest
 * page (a room that was bumped down, a conversation that went quiet) is still on screen, in the older pages' place,
 * until a forced load starts the list over (which is also how a block drops people). The page's copy wins.
 */
export function laidOver<T>(page: readonly T[], held: readonly T[], idOf: (item: T) => string, older: ReadonlySet<string>): T[] {
  if (older.size === 0) return [...page]
  const onPage = new Set(page.map(idOf))
  return [...page, ...held.filter((item) => !onPage.has(idOf(item)))]
}

/** `GET /chat/groups` pages by number; this is the next one, or null on the last (or when it sends no paging). */
export function nextGroupsPage(body: unknown): number | null {
  const meta = (body as { pagination?: { page?: unknown; hasMore?: unknown } } | null | undefined)?.pagination
  return meta?.hasMore === true ? (typeof meta.page === 'number' ? meta.page : 1) + 1 : null
}

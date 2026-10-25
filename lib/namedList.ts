import type { ApiResponse } from './apiClient'

/**
 * `data.categories`, or a bare `data` array from an older server.
 *
 * The server wrapped these two lists so they answer `data.<name>` like the
 * other eleven, and so `/conversations` — the surface most likely to need
 * paging — has somewhere to put a cursor. Both shapes are read here, and the
 * seven call sites are unchanged, because the unwrap belongs in the one place
 * that knows the endpoint rather than in every screen that renders it.
 *
 * The old shape is not transitional politeness. A client build does not travel
 * with a server version: staging and production run different releases, and a
 * build that hit the older one would otherwise render an empty list — the
 * failure that looks like "there are no conversations" rather than like an
 * error, which is the worst kind to ship.
 */
export type NamedList<K extends string> =
  | Record<string, unknown>[]
  | ({ [P in K]: Record<string, unknown>[] } & Record<string, unknown>)

/*
 * The cursor `/conversations` will send beside its rows (blendn-admin feat/redesign-sv-a), kept off the rows themselves
 * so the seven call sites that read an array are untouched: `conversationsCursor(rows)` reads what this call saw.
 */
const cursors = new WeakMap<object, string>()

/** The next-page cursor the response that produced `rows` carried, or null (none sent, or no more). */
export const conversationsCursor = (rows: readonly unknown[] | undefined | null): string | null => (rows ? (cursors.get(rows) ?? null) : null)

export function namedList<K extends string>(
  res: ApiResponse<NamedList<K>>,
  key: K
): ApiResponse<Record<string, unknown>[]> {
  const body = res.data
  const rows = Array.isArray(body) ? body : body?.[key]
  if (Array.isArray(rows) && !Array.isArray(body) && body) {
    const meta = ((body as Record<string, unknown>).pagination ?? body) as { hasMore?: unknown; nextCursor?: unknown }
    if (meta.hasMore !== false && typeof meta.nextCursor === 'string' && meta.nextCursor) cursors.set(rows, meta.nextCursor)
  }
  return { ...res, data: Array.isArray(rows) ? rows : undefined }
}

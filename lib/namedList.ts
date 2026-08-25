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

export function namedList<K extends string>(
  res: ApiResponse<NamedList<K>>,
  key: K
): ApiResponse<Record<string, unknown>[]> {
  const body = res.data
  const rows = Array.isArray(body) ? body : body?.[key]
  return { ...res, data: Array.isArray(rows) ? rows : undefined }
}

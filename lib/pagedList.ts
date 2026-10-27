/**
 * A list read a page at a time, kept so that reading the first page again (a focus, a pull, the app coming back) does not throw
 * away the pages somebody scrolled to. The Going tab's lists can hold hundreds of rows (past nights, saves); the server returns
 * a page and the true total, and the screen asks for the next page as the reader reaches the end.
 *
 * `head` is the newest read of page 1. `tail` is every later page, in order. A refresh replaces the head and drops from the tail
 * anything the new head now holds (a row that moved up a page), so a row is never listed twice and the reader's place is kept.
 */
export interface PageMeta {
  hasMore: boolean
  totalCount: number
  /** The page the server says it answered with (1-based), when it says. */
  page?: number
  /**
   * The cursor for the page after this one, once the server pages by keyset (`undefined`: it still pages by number). With
   * cursors a page number means nothing, and the next page is asked for by this.
   */
  nextCursor?: string | null
}

export interface Paged<T extends { id: string }> {
  head: T[]
  tail: T[]
  /** Pages held: 1 is the head alone. */
  pages: number
  hasMore: boolean
  /** The server's true count, which can exceed what is held; null before the first answer. */
  total: number | null
  /** The cursor for the next page; `undefined` while the server pages by number (the pager then asks for `pages + 1`). */
  nextCursor?: string | null
}

export const emptyPaged = <T extends { id: string }>(): Paged<T> => ({ head: [], tail: [], pages: 1, hasMore: false, total: null })

export const pagedRows = <T extends { id: string }>(p: Paged<T>): T[] => (p.tail.length ? [...p.head, ...p.tail] : p.head)

const without = <T extends { id: string }>(rows: T[], head: T[]): T[] => {
  if (!rows.length || !head.length) return rows
  const taken = new Set(head.map((r) => r.id))
  return rows.filter((r) => !taken.has(r.id))
}

/** The first page read again. While later pages are held, whether more remain is theirs to say. */
export function withFirstPage<T extends { id: string }>(p: Paged<T>, rows: T[], meta?: PageMeta): Paged<T> {
  return {
    head: rows,
    tail: without(p.tail, rows),
    pages: p.pages,
    hasMore: p.pages > 1 ? p.hasMore : (meta?.hasMore ?? false),
    total: meta ? meta.totalCount : p.total,
    nextCursor: p.pages > 1 || !meta ? p.nextCursor : meta.nextCursor,
  }
}

/** The next page read: after the pages held, never twice. */
export function withNextPage<T extends { id: string }>(p: Paged<T>, rows: T[], meta?: PageMeta): Paged<T> {
  const held = [...p.head, ...p.tail]
  return {
    head: p.head,
    tail: [...p.tail, ...without(rows, held)],
    // The page the server answered, never counted twice: a read that lands after another for the same page changes nothing.
    pages: meta?.page ? Math.max(p.pages, meta.page) : p.pages + 1,
    hasMore: meta?.hasMore ?? false,
    total: meta ? meta.totalCount : p.total,
    nextCursor: meta ? meta.nextCursor : p.nextCursor,
  }
}

/** The held rows after a local change the server's total has not seen yet (a save removed, or put back): `total` moves with them. */
export function withoutRow<T extends { id: string }>(p: Paged<T>, id: string): Paged<T> {
  const held = pagedRows(p)
  if (!held.some((r) => r.id === id)) return p
  return {
    ...p,
    head: p.head.filter((r) => r.id !== id),
    tail: p.tail.filter((r) => r.id !== id),
    total: p.total === null ? null : Math.max(0, p.total - 1),
  }
}

/** How many the server has that are not held yet. Never negative, and never claims more than the server said. */
export const remainingOf = <T extends { id: string }>(p: Paged<T>): number =>
  p.total === null ? 0 : Math.max(0, p.total - pagedRows(p).length)

/** A row put back where it was (Undo): into the head when it was there, else at the front of the tail; the total moves with it. */
export function withRowAt<T extends { id: string }>(p: Paged<T>, row: T, index: number): Paged<T> {
  if (pagedRows(p).some((r) => r.id === row.id)) return p
  const at = Math.min(index, p.head.length)
  return {
    ...p,
    head: [...p.head.slice(0, at), row, ...p.head.slice(at)],
    total: p.total === null ? null : p.total + 1,
  }
}


/** What one page read is asked for: by number, or by the cursor the page before it handed over. */
export interface PageAsk {
  page: number
  cursor: string | null
}

export type PageRead<T, F> = { ok: true; rows: T[]; meta?: PageMeta } | { ok: false; failure: F }

/** How many held pages a refresh reads again; rows held beyond them are kept as they were rather than asked for. */
export const REREAD_MAX_PAGES = 5

/**
 * The held pages read again (a focus, a pull, the app coming back), so that nothing held is stale: a row that moved down a page
 * is on the page it is on now, and a row that was removed elsewhere is gone, wherever it was held.
 *
 * By number the pages are asked for together (1…n, n the pages held, at most `REREAD_MAX_PAGES`). By cursor each page's cursor
 * comes from the page before, so the reads follow one another from the head. Either way the result is built with
 * `withFirstPage` and `withNextPage`, so a row is never listed twice. Rows held beyond the pages read stay as they were, after
 * the fresh ones. Any page refused fails the whole refresh: what is on screen is kept, and the caller says so.
 */
export async function rereadPaged<T extends { id: string }, F>(
  p: Paged<T>,
  pageSize: number,
  read: (ask: PageAsk) => Promise<PageRead<T, F>>,
  head: (rows: T[]) => T[] = (rows) => rows
): Promise<{ ok: true; paged: Paged<T> } | { ok: false; failure: F }> {
  const n = Math.max(1, Math.min(p.pages, REREAD_MAX_PAGES))
  const reads: PageRead<T, F>[] = []
  if (p.nextCursor === undefined) {
    reads.push(...(await Promise.all(Array.from({ length: n }, (_, i) => read({ page: i + 1, cursor: null })))))
  } else {
    let cursor: string | null = null
    for (let page = 1; page <= n; page++) {
      const r = await read({ page, cursor })
      reads.push(r)
      cursor = r.ok ? (r.meta?.nextCursor ?? null) : null
      if (!r.ok || cursor === null) break
    }
  }
  const refused = reads.find((r): r is { ok: false; failure: F } => !r.ok)
  if (refused) return refused
  const ok = reads as { ok: true; rows: T[]; meta?: PageMeta }[]
  let out = withFirstPage(emptyPaged<T>(), head(ok[0].rows), ok[0].meta)
  for (let i = 1; i < ok.length; i++) out = withNextPage(out, ok[i].rows, ok[i].meta ?? { hasMore: out.hasMore, totalCount: out.total ?? 0, page: i + 1 })
  if (p.pages > n) {
    // Pages beyond the ones read again: what was held is kept, after the fresh rows, and the end is as it was.
    const kept = without(pagedRows(p).slice(n * pageSize), pagedRows(out))
    out = { ...out, tail: [...out.tail, ...kept], pages: p.pages, hasMore: p.hasMore, nextCursor: p.nextCursor }
  }
  return { ok: true, paged: out }
}

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
}

export interface Paged<T extends { id: string }> {
  head: T[]
  tail: T[]
  /** Pages held: 1 is the head alone. */
  pages: number
  hasMore: boolean
  /** The server's true count, which can exceed what is held; null before the first answer. */
  total: number | null
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
  }
}

/** The next page read: after the pages held, never twice. */
export function withNextPage<T extends { id: string }>(p: Paged<T>, rows: T[], meta?: PageMeta): Paged<T> {
  const held = [...p.head, ...p.tail]
  return {
    head: p.head,
    tail: [...p.tail, ...without(rows, held)],
    pages: p.pages + 1,
    hasMore: meta?.hasMore ?? false,
    total: meta ? meta.totalCount : p.total,
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

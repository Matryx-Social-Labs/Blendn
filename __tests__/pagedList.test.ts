import { emptyPaged, pagedRows, remainingOf, rereadPaged, REREAD_MAX_PAGES, withFirstPage, withNextPage, withoutRow, withRowAt, type PageAsk, type PageRead } from '../lib/pagedList'

const r = (id: string) => ({ id })
const ids = (rows: { id: string }[]) => rows.map((x) => x.id)

describe('a list read a page at a time', () => {
  it('holds the first page and the true total, which can exceed it', () => {
    const p = withFirstPage(emptyPaged<{ id: string }>(), [r('a'), r('b')], { hasMore: true, totalCount: 312 })
    expect(ids(pagedRows(p))).toEqual(['a', 'b'])
    expect(remainingOf(p)).toBe(310)
    expect(p.hasMore).toBe(true)
  })

  it('appends the next page after the ones held, and never lists a row twice', () => {
    const one = withFirstPage(emptyPaged<{ id: string }>(), [r('a'), r('b')], { hasMore: true, totalCount: 5 })
    const two = withNextPage(one, [r('b'), r('c')], { hasMore: true, totalCount: 5 })
    expect(ids(pagedRows(two))).toEqual(['a', 'b', 'c'])
    expect(two.pages).toBe(2)
    expect(remainingOf(two)).toBe(2)
    expect(ids(pagedRows(withNextPage(two, [r('d'), r('e')], { hasMore: false, totalCount: 5 })))).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('reading the first page again keeps the pages the reader scrolled to', () => {
    const one = withFirstPage(emptyPaged<{ id: string }>(), [r('a'), r('b')], { hasMore: true, totalCount: 4 })
    const two = withNextPage(one, [r('c'), r('d')], { hasMore: false, totalCount: 4 })
    const fresh = withFirstPage(two, [r('a'), r('b')], { hasMore: true, totalCount: 4 })
    expect(ids(pagedRows(fresh))).toEqual(['a', 'b', 'c', 'd'])
    // Whether more remain is the last page's to say while later pages are held.
    expect(fresh.hasMore).toBe(false)
  })

  it('a row that moved up a page is listed once, in the head', () => {
    const one = withFirstPage(emptyPaged<{ id: string }>(), [r('a'), r('b')], { hasMore: true, totalCount: 4 })
    const two = withNextPage(one, [r('c'), r('d')], { hasMore: false, totalCount: 4 })
    expect(ids(pagedRows(withFirstPage(two, [r('a'), r('c')], { hasMore: true, totalCount: 4 })))).toEqual(['a', 'c', 'd'])
  })

  it('a row that left the head and the server is gone (not kept from a stale read)', () => {
    const one = withFirstPage(emptyPaged<{ id: string }>(), [r('a'), r('b')], { hasMore: false, totalCount: 2 })
    expect(ids(pagedRows(withFirstPage(one, [r('a')], { hasMore: false, totalCount: 1 })))).toEqual(['a'])
  })

  it('a failed read leaves the total alone: no meta, no change to it', () => {
    const one = withFirstPage(emptyPaged<{ id: string }>(), [r('a')], { hasMore: true, totalCount: 9 })
    expect(withNextPage(one, [r('b')]).total).toBe(9)
    expect(remainingOf(emptyPaged())).toBe(0)
  })

  it('a row removed here lowers the total with it, so "more" does not grow by one', () => {
    const one = withFirstPage(emptyPaged<{ id: string }>(), [r('a'), r('b')], { hasMore: true, totalCount: 10 })
    const gone = withoutRow(one, 'a')
    expect(remainingOf(gone)).toBe(remainingOf(one))
    expect(withoutRow(one, 'zzz')).toBe(one)
  })

  it('Undo puts the row back where it was and the total with it', () => {
    const one = withFirstPage(emptyPaged<{ id: string }>(), [r('a'), r('b'), r('c')], { hasMore: true, totalCount: 10 })
    const back = withRowAt(withoutRow(one, 'b'), r('b'), 1)
    expect(ids(pagedRows(back))).toEqual(['a', 'b', 'c'])
    expect(back.total).toBe(10)
    expect(withRowAt(back, r('b'), 0)).toBe(back)
  })
})

describe('the held pages read again (a refresh with more than one page held)', () => {
  const row = (id: string) => ({ id })
  /** A server of `all`, `size` to a page, by number or (when `cursors`) by cursor "c<n>" naming the next page. */
  const server = (all: string[], size: number, cursors = false) => {
    const calls: PageAsk[] = []
    const read = async ({ page, cursor }: PageAsk): Promise<PageRead<{ id: string }, string>> => {
      calls.push({ page, cursor })
      const n = cursors && cursor ? Number(cursor.slice(1)) : page
      const rows = all.slice((n - 1) * size, n * size).map(row)
      const hasMore = n * size < all.length
      return { ok: true, rows, meta: { hasMore, totalCount: all.length, page: n, ...(cursors && { nextCursor: hasMore ? `c${n + 1}` : null }) } }
    }
    return { read, calls }
  }
  /** Two pages of four held, as a reader who scrolled to the end of page 2 has. */
  const heldTwo = async (cursors = false) => {
    const s = server(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'], 4, cursors)
    const first = await rereadPaged(emptyPaged<{ id: string }>(), 4, s.read)
    if (!first.ok) throw new Error('read')
    const one = first.paged
    const r2 = await s.read({ page: 2, cursor: one.nextCursor ?? null })
    if (!r2.ok) throw new Error('read')
    return withNextPage(one, r2.rows, r2.meta)
  }

  it('a row that moved DOWN a page is listed once, on the page it is on now (by number, in parallel)', async () => {
    const held = await heldTwo()
    expect(ids(pagedRows(held))).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])
    // "b" is pushed to page 2 by a new row at the front; "h" falls to page 3.
    const now = server(['new', 'a', 'c', 'd', 'b', 'e', 'f', 'g', 'h', 'i', 'j'], 4)
    const out = await rereadPaged(held, 4, now.read)
    expect(out.ok && ids(pagedRows(out.paged))).toEqual(['new', 'a', 'c', 'd', 'b', 'e', 'f', 'g'])
    expect(out.ok && out.paged.pages).toBe(2)
    expect(out.ok && out.paged.hasMore).toBe(true)
    // Both pages asked together, by number, and no more than are held.
    expect(now.calls.map((c) => c.page).sort()).toEqual([1, 2])
  })

  it('a row held on page 2 that is removed elsewhere is gone, not kept from the stale read', async () => {
    const held = await heldTwo()
    const now = server(['a', 'b', 'c', 'd', 'e', 'g', 'h', 'i', 'j'], 4)
    const out = await rereadPaged(held, 4, now.read)
    expect(out.ok && ids(pagedRows(out.paged))).toEqual(['a', 'b', 'c', 'd', 'e', 'g', 'h', 'i'])
    expect(out.ok && ids(pagedRows(out.paged))).not.toContain('f')
  })

  it('by cursor it resets to the head and follows the cursors, one after the other', async () => {
    const held = await heldTwo(true)
    expect(held.nextCursor).toBe('c3')
    const now = server(['new', 'a', 'b', 'c', 'd', 'e', 'g', 'h', 'i', 'j'], 4, true)
    const out = await rereadPaged(held, 4, now.read)
    expect(out.ok && ids(pagedRows(out.paged))).toEqual(['new', 'a', 'b', 'c', 'd', 'e', 'g', 'h'])
    expect(now.calls).toEqual([{ page: 1, cursor: null }, { page: 2, cursor: 'c2' }])
    expect(out.ok && out.paged.nextCursor).toBe('c3')
  })

  it('by cursor, a list that has shrunk to one page stops following', async () => {
    const held = await heldTwo(true)
    const now = server(['a', 'b'], 4, true)
    const out = await rereadPaged(held, 4, now.read)
    expect(out.ok && ids(pagedRows(out.paged))).toEqual(['a', 'b'])
    expect(out.ok && out.paged.hasMore).toBe(false)
    expect(now.calls).toHaveLength(1)
  })

  it('a refused page fails the whole refresh: the failure is returned and nothing is rebuilt', async () => {
    const held = await heldTwo()
    const out = await rereadPaged(held, 4, async ({ page }) => (page === 2 ? { ok: false, failure: 'boom' } : { ok: true, rows: [row('a')], meta: { hasMore: true, totalCount: 9 } }))
    expect(out).toEqual({ ok: false, failure: 'boom' })
  })

  it('reads at most REREAD_MAX_PAGES again and keeps what was held beyond them, after the fresh rows', async () => {
    const all = Array.from({ length: 40 }, (_, i) => `r${i}`)
    const s = server(all, 4)
    let held = emptyPaged<{ id: string }>()
    for (let page = 1; page <= 8; page++) {
      const r = await s.read({ page, cursor: null })
      if (!r.ok) throw new Error('read')
      held = page === 1 ? withFirstPage(held, r.rows, r.meta) : withNextPage(held, r.rows, r.meta)
    }
    expect(held.pages).toBe(8)
    const now = server(all, 4)
    const out = await rereadPaged(held, 4, now.read)
    expect(now.calls).toHaveLength(REREAD_MAX_PAGES)
    expect(out.ok && ids(pagedRows(out.paged))).toEqual(all.slice(0, 32))
    expect(out.ok && out.paged.pages).toBe(8)
    expect(out.ok && out.paged.hasMore).toBe(true)
  })

  it('a page asked for twice is counted once: the page the server answered is the page held', async () => {
    const one = withFirstPage(emptyPaged<{ id: string }>(), [row('a')], { hasMore: true, totalCount: 9, page: 1 })
    const two = withNextPage(one, [row('b')], { hasMore: true, totalCount: 9, page: 2 })
    const again = withNextPage(two, [row('b')], { hasMore: true, totalCount: 9, page: 2 })
    expect(two.pages).toBe(2)
    expect(again.pages).toBe(2)
    expect(ids(pagedRows(again))).toEqual(['a', 'b'])
  })

  it('hands the cursor on: the next page is asked for by it', () => {
    const one = withFirstPage(emptyPaged<{ id: string }>(), [row('a')], { hasMore: true, totalCount: 9, nextCursor: 'c2' })
    expect(one.nextCursor).toBe('c2')
    expect(withNextPage(one, [row('b')], { hasMore: false, totalCount: 9, nextCursor: null }).nextCursor).toBeNull()
    // A server that pages by number never has one.
    expect(withFirstPage(emptyPaged<{ id: string }>(), [row('a')], { hasMore: true, totalCount: 9 }).nextCursor).toBeUndefined()
  })
})

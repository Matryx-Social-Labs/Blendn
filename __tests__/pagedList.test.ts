import { emptyPaged, pagedRows, remainingOf, withFirstPage, withNextPage, withoutRow, withRowAt } from '../lib/pagedList'

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

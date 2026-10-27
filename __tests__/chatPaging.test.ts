// Pure functions only: the client itself is not under test, and loading it needs EXPO_PUBLIC_API_BASE_URL (alone, this file failed to run).
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))

import { cursorOf, goneFrom, laidOver, nextGroupsPage } from '../lib/chatPaging'

describe('laidOver: the newest page over what is held', () => {
  const id = (x: { id: string }) => x.id
  const A = { id: 'a' }, B = { id: 'b' }, C = { id: 'c' }, D = { id: 'd' }

  it('with no older page loaded, the page is the list: what left it is gone', () => {
    expect(laidOver([A, B], [A, B, C], id, new Set())).toEqual([A, B])
  })

  it('with older pages loaded, the page comes first and everything held that is not on it stays', () => {
    expect(laidOver([D, A], [A, B, C], id, new Set(['c']))).toEqual([D, A, B, C])
  })

  it('demotion: an item that slid off the newest page is kept in place, not dropped', () => {
    const newest = [{ id: 'new' }, A]
    expect(laidOver(newest, [A, B, C], id, new Set(['c'])).map(id)).toEqual(['new', 'a', 'b', 'c'])
  })

  it('the page’s copy of an item wins', () => {
    const fresh = { id: 'a', v: 2 }
    expect(laidOver([fresh], [{ id: 'a', v: 1 }, B], id, new Set(['b']))).toEqual([fresh, B])
  })
})

describe('the server’s cursors', () => {
  it('reads nextCursor from pagination or beside the list, and none when it says there is no more', () => {
    expect(cursorOf({ pagination: { hasMore: true, nextCursor: 'k' } })).toBe('k')
    expect(cursorOf({ nextCursor: 'k' })).toBe('k')
    expect(cursorOf({ pagination: { hasMore: false, nextCursor: 'k' } })).toBeNull()
    expect(cursorOf({ pagination: { hasMore: true, nextCursor: null } })).toBeNull()
    expect(cursorOf(undefined)).toBeNull()
  })

  it('pages rooms by number', () => {
    expect(nextGroupsPage({ pagination: { page: 1, hasMore: true } })).toBe(2)
    expect(nextGroupsPage({ pagination: { page: 3, hasMore: false } })).toBeNull()
    expect(nextGroupsPage({})).toBeNull()
  })
})

describe('the board’s taken-down list (SV9, the server’s real shape)', () => {
  const taken = [
    { id: 'p1', kind: 'offer' as const, body: 'Spare ticket', createdAt: '2026-10-01T09:00:00Z', takenDownAt: '2026-10-01T09:30:00Z' },
    { id: 'p2', kind: 'seeking' as const, body: 'Anyone?', createdAt: '2026-10-01T08:00:00Z', takenDownAt: '2026-10-01T09:31:00Z' },
  ]

  it('is yours, with no spaces and nobody asking, marked takenDown, in the order the server sent', () => {
    const gone = goneFrom(taken)
    expect(gone.map((g) => g.id)).toEqual(['p1', 'p2'])
    expect(gone.every((g) => g.mine && g.author === 'You' && g.takenDown === true && g.requestCount === 0 && g.spacesLeft === null)).toBe(true)
  })

  it('is nothing when the server sends none (an older server, or a later page)', () => {
    expect(goneFrom(undefined)).toEqual([])
    expect(goneFrom([])).toEqual([])
  })
})

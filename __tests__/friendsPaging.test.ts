import { appendUnique, friendsPageFrom, FRIENDS_PAGE, refreshFirstPage, requestsPageFrom } from '../lib/friendsPaging'
import type { Friend, FriendRequest } from '../lib/friends'

const friend = (i: number): Friend => ({ userId: `u${i}`, name: `Friend ${i}`, photo: null, since: '2026-09-01T00:00:00Z' })
const friends = (n: number, from = 0) => Array.from({ length: n }, (_, i) => friend(from + i))
const request = (i: number): FriendRequest => ({ id: `r${i}`, person: { userId: `u${i}`, name: `P${i}`, photo: null }, createdAt: '2026-09-01T00:00:00Z' })
const key = (f: Friend) => f.userId

describe('the friends page', () => {
  it.each([0, 1, 100])('reads %i friends as one whole page when the server sends no pagination', (n) => {
    const page = friendsPageFrom({ friends: friends(n), count: n })
    expect(page).toEqual({ items: friends(n), nextCursor: null, total: n })
  })

  it('101 friends: the first page is 100, a cursor says more, and the total is the whole list', () => {
    const page = friendsPageFrom({
      friends: friends(FRIENDS_PAGE),
      count: 101,
      pagination: { limit: 100, hasMore: true, nextCursor: 'c1', totalCount: 101 },
    })
    expect(page?.items).toHaveLength(100)
    expect(page?.nextCursor).toBe('c1')
    expect(page?.total).toBe(101)
  })

  it('1,000 friends: the total is the server’s, never the length of what is loaded', () => {
    const page = friendsPageFrom({ friends: friends(100), count: 1000, pagination: { hasMore: true, nextCursor: 'c1', totalCount: 1000 } })
    expect(page?.items).toHaveLength(100)
    expect(page?.total).toBe(1000)
  })

  it('a cursor on a last page asks for nothing more', () => {
    expect(friendsPageFrom({ friends: friends(3), count: 3, pagination: { hasMore: false, nextCursor: 'stale', totalCount: 3 } })?.nextCursor).toBeNull()
  })

  it('falls back to `count` when the pagination block has no total', () => {
    expect(friendsPageFrom({ friends: friends(2), count: 50, pagination: { hasMore: true, nextCursor: 'c' } })?.total).toBe(50)
  })

  it('an answer with no friends list is a failure, never an empty list', () => {
    expect(friendsPageFrom({ count: 0 })).toBeNull()
    expect(friendsPageFrom(null)).toBeNull()
    expect(friendsPageFrom(undefined)).toBeNull()
  })
})

describe('the requests pages', () => {
  const both = {
    incoming: [request(1), request(2)],
    outgoing: [request(3)],
    pagination: {
      incoming: { limit: 50, hasMore: true, nextCursor: 'i1', totalCount: 120 },
      outgoing: { limit: 50, hasMore: false, nextCursor: null, totalCount: 1 },
    },
  }

  it('reads each side with its own cursor and total', () => {
    expect(requestsPageFrom(both, 'incoming')).toEqual({ items: both.incoming, nextCursor: 'i1', total: 120 })
    expect(requestsPageFrom(both, 'outgoing')).toEqual({ items: both.outgoing, nextCursor: null, total: 1 })
  })

  it('a page of one side alone has no other side to read', () => {
    const one = { incoming: [request(9)], pagination: { incoming: { limit: 50, hasMore: false, nextCursor: null, totalCount: 51 } } }
    expect(requestsPageFrom(one, 'incoming')?.total).toBe(51)
    expect(requestsPageFrom(one, 'outgoing')).toBeNull()
  })

  it('without pagination the list is the whole list, and its length the count', () => {
    expect(requestsPageFrom({ incoming: [request(1)], outgoing: [] }, 'incoming')).toEqual({ items: [request(1)], nextCursor: null, total: 1 })
  })
})

describe('appendUnique', () => {
  it('a row the server moved between two pages is not drawn twice', () => {
    const held = friends(3)
    expect(appendUnique(held, [friend(2), friend(3), friend(4)], key).map(key)).toEqual(['u0', 'u1', 'u2', 'u3', 'u4'])
  })

  it('1,000 loaded in ten pages stay 1,000', () => {
    let held: Friend[] = []
    for (let p = 0; p < 10; p++) held = appendUnique(held, friends(100, p * 100), key)
    expect(held).toHaveLength(1000)
  })
})

describe('refreshFirstPage (a screen coming back to the list)', () => {
  const page = (items: Friend[], nextCursor: string | null) => ({ items, nextCursor, total: 0 })

  it('keeps what was read past the first page, so the list does not jump', () => {
    const held = friends(250)
    const out = refreshFirstPage(held, page(friends(100), 'c'), key)
    expect(out.items).toHaveLength(250)
    expect(out.keptTail).toBe(true)
  })

  it('a friend removed from the head leaves the head, and the tail still joins it', () => {
    const held = friends(250)
    const headNow = [...friends(100)].filter((f) => f.userId !== 'u5')
    const out = refreshFirstPage(held, page(headNow, 'c'), key)
    expect(out.items.map(key)).not.toContain('u5')
    // The page now ends at u99, where the tail picks up.
    expect(out.items).toHaveLength(249)
  })

  it('when the page is the whole list now, what was past it is gone', () => {
    const out = refreshFirstPage(friends(250), page(friends(40), null), key)
    expect(out.items).toHaveLength(40)
    expect(out.keptTail).toBe(false)
  })

  it('when the page’s last row is not in what is held, the page stands alone and its cursor is used', () => {
    const out = refreshFirstPage(friends(5), page(friends(100, 500), 'c'), key)
    expect(out.items).toHaveLength(100)
    expect(out.keptTail).toBe(false)
  })

  it('held exactly one page: nothing was past it', () => {
    const out = refreshFirstPage(friends(100), page(friends(100), 'c'), key)
    expect(out.items).toHaveLength(100)
    expect(out.keptTail).toBe(false)
  })

  it('0 friends held and 1 arriving', () => {
    expect(refreshFirstPage([], page(friends(1), null), key).items).toHaveLength(1)
  })
})

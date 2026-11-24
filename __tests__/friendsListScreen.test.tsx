/**
 * Friends, at every size (owner's large-data rule, 2026-10-22): 0, 1, 100, 101 and 1,000.
 *
 * The list is read a page at a time by the server's cursor, windowed (fixed 64 pt rows, an exact `getItemLayout`),
 * and its counts are the server's: the badge on Requests and the number under the title say how many there ARE, not
 * how many have been read. A failed later page keeps every row and offers Try again; it is never drawn as the end.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'

import FriendsScreen from '../app/friends'
import { friendItems, letterOf, type FriendItem } from '../lib/friendsIndex'
import type { Friend } from '../lib/friends'
import { FlatList, StyleSheet } from 'react-native'
import { COLOR, SIZE, SPACE } from '../lib/design/tokens'
import { noteFriendGone } from '../lib/friendsGone'
import { PERSON_ROW_HEIGHT } from '../components/friends/PersonRow'
import { atScale, resetScale } from './helpers/ax'

// React Native's jest preset reads fontScale 2; a test that windows by index sets the default size itself.
afterEach(resetScale)

const mockPush = jest.fn()
const mockGetFriends = jest.fn()
// The A–Z (`order=name`, admin #998) has its own queue; newest-first reads (the head, a short list, a search) use mockGetFriends.
const mockByName = jest.fn()
const mockGetRequests = jest.fn()
const mockOpenChat = jest.fn()
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getFriends: (...a: unknown[]) => (a[2] === 'name' ? mockByName(...a) : mockGetFriends(...a)),
    getFriendRequests: (...a: unknown[]) => mockGetRequests(...a),
    getFriendInvite: async () => ({ success: true, data: { token: 't', url: 'https://www.blendn.app/f/abcdefqrstuv' } }),
    openFriendConversation: (...a: unknown[]) => mockOpenChat(...a),
  },
}))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../lib/friendsSeeMeAsk', () => ({ askFriendsSeeMe: jest.fn(), useStillHere: () => () => true }))
// The screen's own focus effect: it runs on mount, and a test hands the screen back to itself (a return from a profile) by calling it.
let mockFocus: () => void = () => {}
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: (...a: unknown[]) => mockPush(...a) },
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = require('react')
    mockFocus = effect
    useEffect(effect, [effect])
  },
}))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
const mockToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'me', name: 'Maya Rc', image: null } }) }))
jest.mock('../components/OptimizedImage', () => {
  const { View } = require('react-native')
  return { OptimizedImage: () => <View /> }
})
jest.mock('../components/profile/OfflineStrip', () => ({ OfflineStrip: () => null, useOffline: () => false }))

const friend = (i: number) => ({ userId: `u${i}`, name: `Friend ${i}`, photo: null, since: '2026-03-01T00:00:00Z' })
const friends = (n: number, from = 0) => Array.from({ length: n }, (_, i) => friend(from + i))
const page = (items: ReturnType<typeof friend>[], total: number, nextCursor: string | null = null) => ({
  success: true,
  data: { friends: items, count: total, pagination: { limit: 100, hasMore: nextCursor !== null, nextCursor, totalCount: total } },
})
/** An A–Z page: the server's `letters` for the whole list ride every page. */
const named = (items: ReturnType<typeof friend>[], total: number, nextCursor: string | null = null, whole: ReturnType<typeof friend>[] = items) => {
  const counts = new Map<string, number>()
  for (const f of whole) counts.set(letterOf(f.name), (counts.get(letterOf(f.name)) ?? 0) + 1)
  const out = page(items, total, nextCursor)
  return { ...out, data: { ...out.data, letters: [...counts].map(([letter, count]) => ({ letter, count })) } }
}
const noRequests = { success: true, data: { incoming: [], outgoing: [], pagination: { incoming: { totalCount: 0 }, outgoing: { totalCount: 0 } } } }

beforeEach(() => {
  jest.clearAllMocks()
  mockGetRequests.mockResolvedValue(noRequests)
  mockByName.mockResolvedValue(named([], 0))
})

const open = async () => {
  await render(<FriendsScreen />)
  await act(async () => {})
}
const list = () => screen.getByTestId('friends-list')
/** The friends the list draws, once each: its rows minus the heads and the "Recently added" copies (D7). */
const rows = (): Friend[] =>
  (list().props.data as FriendItem[]).flatMap((item) => (item.kind === 'friend' && !item.key.startsWith('r:') ? [item.friend] : []))
const reachEnd = async () => {
  await act(async () => {
    fireEvent(list(), 'endReached')
  })
}

describe('0 friends', () => {
  it('says there are none, and offers the link; no Make a crew with nobody to make one with', async () => {
    mockGetFriends.mockResolvedValue(page([], 0))
    await open()
    expect(screen.getByText('No friends yet')).toBeTruthy()
    expect(screen.queryByTestId('make-crew-row')).toBeNull()
  })
})

describe('1 friend', () => {
  it('draws the row, Make a crew, and no count under the title: a short list is visibly all of itself', async () => {
    mockGetFriends.mockResolvedValue(page([friend(1)], 1))
    await open()
    expect(screen.getByText('Friend 1')).toBeTruthy()
    expect(screen.getByLabelText('Make a crew, from your friends')).toBeTruthy()
    expect(screen.queryByText('1')).toBeNull()
  })

  it('Make a crew opens the sheet over Friends', async () => {
    mockGetFriends.mockResolvedValue(page([friend(1)], 1))
    await open()
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Make a crew, from your friends'))
    })
    expect(mockPush).toHaveBeenCalledWith('/crews/new')
  })
})

describe('100 friends (exactly one page)', () => {
  it('reads one page, asks for no more, and shows no foot', async () => {
    mockGetFriends.mockResolvedValue(page(friends(100), 100))
    mockByName.mockResolvedValue(named(friends(100), 100))
    await open()
    expect(mockGetFriends).toHaveBeenCalledTimes(1)
    expect(mockByName).toHaveBeenCalledTimes(1)
    await reachEnd()
    expect(mockGetFriends).toHaveBeenCalledTimes(1)
    expect(mockByName).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('friends-more')).toBeNull()
    expect(screen.queryByText('100')).toBeNull()
  })
})

// The A–Z pages as you scroll (Flow 7 1-A, admin #998): these are its paging rules. The head (newest) is read once, for the count.
describe('1,001 friends', () => {
  it('the second page is asked for by cursor when the end comes near, once, and the count is the whole list', async () => {
    mockGetFriends.mockResolvedValue(page(friends(100), 1001, 'n1'))
    mockByName.mockResolvedValueOnce(named(friends(100), 1001, 'c1')).mockResolvedValueOnce(named(friends(1, 100), 1001))
    await open()
    expect(screen.getByText('1,001 friends')).toBeTruthy()
    expect(rows()).toHaveLength(100)
    await reachEnd()
    expect(mockByName).toHaveBeenLastCalledWith('c1', null, 'name')
    expect(rows()).toHaveLength(101)
    await reachEnd()
    expect(mockByName).toHaveBeenCalledTimes(2)
    // The newest page is the head only: it is never paged here.
    expect(mockGetFriends).toHaveBeenCalledTimes(1)
  })

  it('a second ask while the first is on its way is not sent', async () => {
    let release: (v: unknown) => void = () => {}
    mockGetFriends.mockResolvedValue(page(friends(100), 1001, 'n1'))
    mockByName.mockResolvedValueOnce(named(friends(100), 1001, 'c1')).mockReturnValueOnce(new Promise((r) => (release = r)))
    await open()
    await reachEnd()
    await reachEnd()
    expect(mockByName).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText('Loading more')).toBeTruthy()
    await act(async () => release(named(friends(1, 100), 1001)))
    expect(screen.queryByLabelText('Loading more')).toBeNull()
  })

  it('a failed second page keeps all 100 rows and offers Try again; it is not the end of the list', async () => {
    mockGetFriends.mockResolvedValue(page(friends(100), 1001, 'n1'))
    mockByName.mockResolvedValueOnce(named(friends(100), 1001, 'c1')).mockResolvedValueOnce({ success: false })
    await open()
    await reachEnd()
    expect(rows()).toHaveLength(100)
    expect(screen.getByText('Couldn’t load more.')).toBeTruthy()
    mockByName.mockResolvedValueOnce(named(friends(1, 100), 1001))
    await act(async () => {
      fireEvent.press(screen.getByText('Try again'))
    })
    expect(mockByName).toHaveBeenLastCalledWith('c1', null, 'name')
    expect(rows()).toHaveLength(101)
    expect(screen.queryByText('Couldn’t load more.')).toBeNull()
  })
})

describe('1,000 friends', () => {
  it('ten pages by cursor, each row exactly one fixed height, and the whole count under the title', async () => {
    await atScale(1)
    mockGetFriends.mockResolvedValue(page(friends(100), 1000, 'n1'))
    for (let p = 0; p < 10; p++) mockByName.mockResolvedValueOnce(named(friends(100, p * 100), 1000, p < 9 ? `c${p + 1}` : null))
    await open()
    expect(screen.getByText('1,000')).toBeTruthy()
    for (let p = 1; p < 10; p++) await reachEnd()
    expect(rows()).toHaveLength(1000)
    expect(mockByName.mock.calls.map((c) => c[0])).toEqual([null, 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'])
    // Every row one fixed height, every head one fixed height: the last item's offset is their sum, so the list stays windowed.
    const data = list().props.data as FriendItem[]
    const last = data.length - 1
    const heads = data.filter((i) => i.kind === 'head').length
    expect(list().props.getItemLayout(null, last)).toEqual({ length: PERSON_ROW_HEIGHT, offset: SPACE.sm + PERSON_ROW_HEIGHT * (last - heads) + SIZE.tag * heads, index: last })
  })

  it('is a windowed FlatList: a small first render and a window of seven screens, never every row', async () => {
    await atScale(1)
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 1000, 'n1'))
    mockByName.mockResolvedValueOnce(named(friends(100), 1000, 'c1'))
    await open()
    expect(list().props.initialNumToRender).toBeLessThanOrEqual(12)
    expect(list().props.windowSize).toBeLessThanOrEqual(7)
    expect(list().props.getItemLayout).toEqual(expect.any(Function))
    expect(list().props.onEndReached).toEqual(expect.any(Function))
  })

  // DS-05: past the default size a row grows, so indexing by 64 would misplace every row below a tall one. Negative
  // control: an ungated getItemLayout fails this.
  it('windows by index only at the default text size; at a larger size the list measures its rows', async () => {
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 1000, 'n1'))
    mockByName.mockResolvedValueOnce(named(friends(100), 1000, 'c1'))
    await atScale(2)
    try {
      await open()
      expect(list().props.getItemLayout).toBeUndefined()
    } finally {
      resetScale()
    }
  })

  // rc7: at AX "Recently added" outgrew its fixed 32 pt head and touched the first row; at 1× the head stays the fixed
  // size getItemLayout counts on. Every head is a `-bar` for the visual checker, on solid ink.
  it('a head is the fixed size at 1×, grows with its text at a larger size, and is always opaque and named a bar', async () => {
    const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
    mockGetFriends.mockResolvedValueOnce(page(friends(64), 64))
    mockByName.mockResolvedValueOnce(named(friends(64), 64))
    await atScale(1)
    await open()
    expect(flat('friends-head-recently-added-bar')).toMatchObject({ height: SIZE.tag, backgroundColor: COLOR.ink })
    await screen.unmount()
    mockGetFriends.mockResolvedValueOnce(page(friends(64), 64))
    mockByName.mockResolvedValueOnce(named(friends(64), 64))
    await atScale(2)
    try {
      await open()
      const head = flat('friends-head-recently-added-bar')
      expect(head.height).toBeUndefined()
      expect(head).toMatchObject({ minHeight: SIZE.tag, backgroundColor: COLOR.ink })
      expect(flat('friends-head-f-bar').backgroundColor).toBe(COLOR.ink)
    } finally {
      resetScale()
    }
  })

  it('a page that repeats a friend does not draw them twice', async () => {
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 1000, 'n1'))
    mockByName.mockResolvedValueOnce(named(friends(100), 1000, 'c1')).mockResolvedValueOnce(named(friends(100, 99), 1000, 'c2'))
    await open()
    await reachEnd()
    expect(rows()).toHaveLength(199)
  })
})

describe('coming back to the list', () => {
  const twoPages = async () => {
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 1250, 'n1'))
    mockByName.mockResolvedValueOnce(named(friends(100), 1250, 'c1')).mockResolvedValueOnce(named(friends(100, 100), 1250, 'c2'))
    await open()
    await reachEnd()
    expect(rows()).toHaveLength(200)
  }

  it('reads the head again and keeps the pages read further down: the list does not jump to the top', async () => {
    await twoPages()
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 1250, 'n1'))
    mockByName.mockResolvedValueOnce(named(friends(100), 1250, 'c1'))
    await act(async () => mockFocus())
    // Both heads are read with no cursor: the newest (for the count and Recently added) and the A–Z's.
    expect(mockGetFriends.mock.calls.at(-1)).toEqual([null, null])
    expect(mockByName.mock.calls.at(-1)).toEqual([null, null, 'name'])
    expect(rows()).toHaveLength(200)
    // And the next page is still the one after what was read, not the second page over again.
    mockByName.mockResolvedValueOnce(named(friends(50, 200), 1250))
    await reachEnd()
    expect(mockByName).toHaveBeenLastCalledWith('c2', null, 'name')
    expect(rows()).toHaveLength(250)
  })

  it('somebody removed on their profile leaves with it, from a page read earlier', async () => {
    await twoPages()
    noteFriendGone('u150')
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 1249, 'n1'))
    mockByName.mockResolvedValueOnce(named(friends(100), 1249, 'c1'))
    await act(async () => mockFocus())
    const ids = rows().map((f) => f.userId)
    expect(ids).toHaveLength(199)
    expect(ids).not.toContain('u150')
    expect(screen.getByText('1,249 friends')).toBeTruthy()
  })
})

describe('search (Friends)', () => {
  const type = async (text: string) => {
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('friends-search'), text)
    })
    await act(async () => {
      jest.advanceTimersByTime(300)
    })
  }
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('0 friends: no search field, nothing to search', async () => {
    mockGetFriends.mockResolvedValue(page([], 0))
    await open()
    expect(screen.queryByTestId('friends-search')).toBeNull()
  })

  it('asks the server with q once typing settles, not on every key, and a short list still has the field', async () => {
    mockGetFriends.mockResolvedValue(page(friends(3), 3))
    await open()
    mockGetFriends.mockResolvedValue(page([friend(1)], 1))
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('friends-search'), 'F')
      fireEvent.changeText(screen.getByTestId('friends-search'), 'Fr')
      fireEvent.changeText(screen.getByTestId('friends-search'), 'Friend 1')
    })
    expect(mockGetFriends).toHaveBeenCalledTimes(1)
    await act(async () => {
      jest.advanceTimersByTime(300)
    })
    expect(mockGetFriends).toHaveBeenCalledTimes(2)
    expect(mockGetFriends).toHaveBeenLastCalledWith(null, 'friend 1')
    expect(rows()).toHaveLength(1)
  })

  it('narrows to the server’s answer, pages it by cursor with q kept, and the title’s count stays the whole list', async () => {
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 1000, 'c1'))
    await open()
    mockGetFriends.mockResolvedValueOnce(page(friends(100, 0).map((f) => ({ ...f, name: `Pri ${f.userId}` })), 230, 's1'))
    await type('pri')
    expect(screen.getByText('1,000')).toBeTruthy()
    mockGetFriends.mockResolvedValueOnce(page(friends(100, 100).map((f) => ({ ...f, name: `Pri ${f.userId}` })), 230, 's2'))
    await reachEnd()
    expect(mockGetFriends).toHaveBeenLastCalledWith('s1', 'pri')
    expect(rows()).toHaveLength(200)
  })

  it('clearing it brings the whole list back, with its header rows', async () => {
    mockGetFriends.mockResolvedValueOnce(page(friends(5), 5))
    await open()
    mockGetFriends.mockResolvedValueOnce(page([friend(2)], 1))
    await type('Friend 2')
    expect(screen.queryByTestId('make-crew-row')).toBeNull()
    mockGetFriends.mockResolvedValueOnce(page(friends(5), 5))
    await type('')
    expect(rows()).toHaveLength(5)
    expect(screen.getByTestId('make-crew-row')).toBeTruthy()
  })

  it('no match says so; it is not "No friends yet"', async () => {
    mockGetFriends.mockResolvedValueOnce(page(friends(5), 5))
    await open()
    mockGetFriends.mockResolvedValueOnce(page([], 0))
    await type('zzz')
    expect(screen.getByText('No friend by that name.')).toBeTruthy()
    expect(screen.queryByText('No friends yet')).toBeNull()
    expect(screen.getByTestId('friends-search')).toBeTruthy()
  })

  it('an older answer never lands on a newer search', async () => {
    mockGetFriends.mockResolvedValueOnce(page(friends(5), 5))
    await open()
    let slow: (v: unknown) => void = () => {}
    mockGetFriends.mockReturnValueOnce(new Promise((r) => (slow = r)))
    await type('fri')
    mockGetFriends.mockResolvedValueOnce(page([friend(4)], 1))
    await type('Friend 4')
    await act(async () => slow(page(friends(5), 5)))
    expect(rows()).toHaveLength(1)
  })

  it('an older server that ignores q: the page is filtered here, with no load more', async () => {
    mockGetFriends.mockResolvedValueOnce(page([friend(1), { ...friend(2), name: 'Zed' }], 400, 'c1'))
    await open()
    // The same unfiltered page comes back for q=zed, still with a cursor and the whole count.
    mockGetFriends.mockResolvedValueOnce(page([friend(1), { ...friend(2), name: 'Zed' }], 400, 'c1'))
    await type('zed')
    expect(rows().map((f) => f.name)).toEqual(['Zed'])
    mockGetFriends.mockClear()
    await reachEnd()
    expect(mockGetFriends).not.toHaveBeenCalled()
    expect(screen.queryByTestId('friends-more')).toBeNull()
  })

  it('a search that fails keeps the list on screen', async () => {
    mockGetFriends.mockResolvedValueOnce(page(friends(5), 5))
    await open()
    mockGetFriends.mockResolvedValueOnce({ success: false })
    await type('fri')
    expect(rows()).toHaveLength(5)
    expect(screen.queryByText('Your friends didn’t load')).toBeNull()
  })
})

describe('the requests row', () => {
  it('says how many are waiting, not how many were read: 120 waiting is 99+', async () => {
    mockGetFriends.mockResolvedValue(page([friend(1)], 1))
    mockGetRequests.mockResolvedValue({
      success: true,
      data: {
        incoming: Array.from({ length: 50 }, (_, i) => ({ id: `r${i}`, person: { userId: `p${i}`, name: `P${i}`, photo: null }, createdAt: '2026-09-01T00:00:00Z' })),
        outgoing: [],
        pagination: { incoming: { limit: 50, hasMore: true, nextCursor: 'i1', totalCount: 120 }, outgoing: { totalCount: 0 } },
      },
    })
    await open()
    expect(screen.getByLabelText('120 friend requests')).toBeTruthy()
    expect(screen.getByText('99+', { includeHiddenElements: true })).toBeTruthy()
  })

  it('stays above the empty state when there are requests and no friends', async () => {
    mockGetFriends.mockResolvedValue(page([], 0))
    mockGetRequests.mockResolvedValue({
      success: true,
      data: { incoming: [{ id: 'r1', person: { userId: 'p1', name: 'P1', photo: null }, createdAt: '2026-09-01T00:00:00Z' }], outgoing: [] },
    })
    await open()
    expect(screen.getByLabelText('1 friend request')).toBeTruthy()
    expect(screen.getByText('No friends yet')).toBeTruthy()
  })
})

describe('a failed first read', () => {
  it('is "didn’t load", never "No friends yet", and Try again reads again', async () => {
    mockGetFriends.mockResolvedValueOnce({ success: false })
    await open()
    expect(screen.getByText('Your friends didn’t load')).toBeTruthy()
    expect(screen.queryByText('No friends yet')).toBeNull()
    mockGetFriends.mockResolvedValueOnce(page([friend(1)], 1))
    await act(async () => {
      fireEvent.press(screen.getByText('Try again'))
    })
    expect(screen.getByText('Friend 1')).toBeTruthy()
  })
})

/*
 * Flow 7 1-A, A–Z at any size (admin #998): past a screenful the list is Recently added (the newest page's first five), then the
 * server's name order (`order=name`) a page at a time, drawn as it arrives and never re-sorted here, so a later page only adds
 * names below. The index comes from the whole list's `letters`, and a jump to a head not read yet reads on until it lands.
 * Negative control: the old screen (every page read newest first and sorted on the phone, newest first past 500) fails "draws
 * the first page at once", "12,480 friends" and "a jump to a letter not read yet".
 */
describe('A–Z (Flow 7 1-A)', () => {
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  // 64 friends over every Latin letter, two in Devanagari and one that starts with a digit: the walk's seeded account.
  const latin = () => Array.from({ length: 61 }, (_, i) => ({ ...friend(i), name: `${LETTERS[i % 26]}${'aeiou'[i % 5]}rav ${i}` }))
  const sixtyFour = () => [...latin(), { ...friend(61), name: 'प्रियंका शर्मा' }, { ...friend(62), name: 'पूजा' }, { ...friend(63), name: '9lives' }]
  // The same 64 in the server's order: A–Z, then प, then #.
  const sixtyFourByName = () => [
    ...latin().sort((x, y) => x.name.localeCompare(y.name)),
    { ...friend(62), name: 'पूजा' },
    { ...friend(61), name: 'प्रियंका शर्मा' },
    { ...friend(63), name: '9lives' },
  ]
  const heads = () => (list().props.data as FriendItem[]).flatMap((i) => (i.kind === 'head' ? [i.title] : []))
  const scrubber = () => screen.getByTestId('friends-scrubber', { includeHiddenElements: true })

  it('64 friends: Recently added (the newest five), then the server’s A–Z, then प after Z, then #; and the index down the edge', async () => {
    await atScale(1)
    mockGetFriends.mockResolvedValueOnce(page(sixtyFour(), 64))
    mockByName.mockResolvedValueOnce(named(sixtyFourByName(), 64))
    await open()
    expect(mockByName).toHaveBeenCalledWith(null, null, 'name')
    expect(heads()).toEqual(['Recently added', ...LETTERS, 'प', '#'])
    const data = list().props.data as FriendItem[]
    expect(data.filter((i) => i.key.startsWith('r:')).map((i) => (i as { friend: Friend }).friend.userId)).toEqual(['u0', 'u1', 'u2', 'u3', 'u4'])
    const under = (title: string) => data.slice(data.findIndex((i) => i.kind === 'head' && i.title === title) + 1).find((i) => i.kind === 'friend') as { friend: Friend }
    expect(under('प').friend.name).toBe('पूजा')
    expect(under('#').friend.name).toBe('9lives')
    const letters = within(scrubber()).getAllByText(/./, { includeHiddenElements: true })
    expect(letters.map((n) => n.props.children)).toEqual(['★', ...LETTERS, 'प', '#'])
  })

  it('the index jumps the list to a letter, and to the next letter that has names when one has none', async () => {
    await atScale(1)
    const scroll = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => {})
    const noB = sixtyFourByName().map((f) => (f.name.startsWith('B') ? { ...f, name: `C${f.name.slice(1)}` } : f))
    mockGetFriends.mockResolvedValueOnce(page(sixtyFour(), 64))
    mockByName.mockResolvedValueOnce(named(noB, 64))
    await open()
    const data = list().props.data as FriendItem[]
    const headAt = (t: string) => data.findIndex((i) => i.kind === 'head' && i.title === t)
    // Rows of 14 (13 + 1): ★ at 0, A at 14, B at 28.
    await act(async () => fireEvent(scrubber(), 'responderGrant', { nativeEvent: { pageY: 14 + 3 } }))
    expect(scroll).toHaveBeenLastCalledWith({ index: headAt('A'), animated: false })
    await act(async () => fireEvent(scrubber(), 'responderMove', { nativeEvent: { pageY: 28 + 3 } }))
    expect(scroll).toHaveBeenLastCalledWith({ index: headAt('C'), animated: false })
    scroll.mockRestore()
  })

  // Seen on the iPhone (SCRUM-1099): E landed 128 short of the top, under the rows of D. The list scrolls to exactly the offset it is
  // given, so what stands above the first row (the group, and the list's own padding) is in it. Control: offsets from 0 fail this.
  it('a row’s offset counts what stands above the first row, so a jump lands on its head', async () => {
    await atScale(1)
    mockGetFriends.mockResolvedValueOnce(page(sixtyFour(), 64))
    mockByName.mockResolvedValueOnce(named(sixtyFourByName(), 64))
    await open()
    const at = () => list().props.getItemLayout(null, 0).offset
    expect(at()).toBe(SPACE.sm)
    await act(async () => fireEvent(screen.getByTestId('friends-above'), 'layout', { nativeEvent: { layout: { x: 0, y: 8, width: 342, height: 120 } } }))
    expect(at()).toBe(SPACE.sm + 120)
  })

  it('a jump to a letter not read yet reads on, a page at a time, then lands on it', async () => {
    await atScale(1)
    const scroll = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => {})
    const all = sixtyFourByName()
    const cut = all.findIndex((f) => f.name.startsWith('N'))
    mockGetFriends.mockResolvedValueOnce(page(sixtyFour(), 64))
    mockByName.mockResolvedValueOnce(named(all.slice(0, cut), 64, 'c1', all)).mockResolvedValueOnce(named(all.slice(cut), 64, null, all))
    await open()
    // Only A–M is read, yet the index already has every letter (the server's `letters`).
    expect(heads()).not.toContain('Z')
    expect(within(scrubber()).getAllByText(/./, { includeHiddenElements: true }).at(-1)?.props.children).toBe('#')
    // Z is row 26 of 29: 26 × 14 + 3.
    await act(async () => fireEvent(scrubber(), 'responderGrant', { nativeEvent: { pageY: 26 * 14 + 3 } }))
    expect(mockByName).toHaveBeenLastCalledWith('c1', null, 'name')
    const data = list().props.data as FriendItem[]
    const z = data.findIndex((i) => i.kind === 'head' && i.title === 'Z')
    expect(scroll).toHaveBeenLastCalledWith({ index: z, animated: false })
    // Seen on the sim (SCRUM-1099): that first scroll runs before iOS has the new rows' height, which clamps it short of Z. The
    // jump lands again once the list grows, and only that once. Control: without the second scroll this fails.
    scroll.mockClear()
    await act(async () => fireEvent(list(), 'contentSizeChange', 402, 40000))
    expect(scroll).toHaveBeenCalledWith({ index: z, animated: false })
    await act(async () => fireEvent(list(), 'contentSizeChange', 402, 41000))
    expect(scroll).toHaveBeenCalledTimes(1)
    scroll.mockRestore()
  })

  // Seen on the Android emulator (SCRUM-1099): a letter there rounds to whole pixels and stands ~14.3 apart, not 14, so a touch low
  // on Y picked Z. The touch is read against the column's own measured pitch. Control: the fixed 14 picks प here.
  it('a touch picks the letter drawn under it, at the pitch the column was laid out at', async () => {
    await atScale(1)
    const scroll = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => {})
    mockGetFriends.mockResolvedValueOnce(page(sixtyFour(), 64))
    mockByName.mockResolvedValueOnce(named(sixtyFourByName(), 64))
    await open()
    const data = list().props.data as FriendItem[]
    // 29 letters at 15 apart (13 + 1 + 1 of rounding): Y is the 26th, from 375 to 390.
    await act(async () => fireEvent(scrubber(), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 24, height: 29 * 15 - 1 } } }))
    await act(async () => fireEvent(scrubber(), 'responderGrant', { nativeEvent: { pageY: 25 * 15 + 12 } }))
    expect(scroll).toHaveBeenLastCalledWith({ index: data.findIndex((i) => i.kind === 'head' && i.title === 'Y'), animated: false })
    scroll.mockRestore()
  })

  it('a jump within what is read does not land again when a later page grows the list', async () => {
    await atScale(1)
    const scroll = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => {})
    mockGetFriends.mockResolvedValueOnce(page(sixtyFour(), 64))
    mockByName.mockResolvedValueOnce(named(sixtyFourByName(), 64))
    await open()
    await act(async () => fireEvent(scrubber(), 'responderGrant', { nativeEvent: { pageY: 14 + 3 } }))
    expect(scroll).toHaveBeenCalledTimes(1)
    await act(async () => fireEvent(list(), 'contentSizeChange', 402, 40000))
    expect(scroll).toHaveBeenCalledTimes(1)
    scroll.mockRestore()
  })

  it('draws the first page at once and reads more as you scroll; until the A–Z’s first page lands, the skeleton', async () => {
    await atScale(1)
    let first: (v: unknown) => void = () => {}
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 350, 'n1'))
    mockByName.mockReturnValueOnce(new Promise((r) => (first = r)))
    await open()
    expect(screen.queryByTestId('friends-list')).toBeNull()
    expect(screen.getByTestId('person-skeleton')).toBeTruthy()
    await act(async () => first(named(friends(100), 350, 'c1')))
    expect(rows()).toHaveLength(100)
    expect(heads()[0]).toBe('Recently added')
    expect(mockByName).toHaveBeenCalledTimes(1)
    mockByName.mockResolvedValueOnce(named(friends(100, 100), 350, 'c2'))
    await reachEnd()
    expect(rows()).toHaveLength(200)
  })

  it('an A–Z that fails to read says so, never "No friends yet", and Try again reads both again', async () => {
    await atScale(1)
    mockGetFriends.mockResolvedValue(page(friends(100), 150, 'n1'))
    mockByName.mockResolvedValueOnce({ success: false })
    await open()
    expect(screen.getByText('Your friends didn’t load')).toBeTruthy()
    expect(screen.queryByText('No friends yet')).toBeNull()
    mockByName.mockResolvedValueOnce(named(friends(100), 150, 'c1'))
    await act(async () => fireEvent.press(screen.getByText('Try again')))
    expect(mockByName).toHaveBeenLastCalledWith(null, null, 'name')
    expect(rows()).toHaveLength(100)
  })

  it('12,480 friends: still A–Z with heads and the index, never newest first', async () => {
    await atScale(1)
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 12480, 'n1'))
    mockByName.mockResolvedValueOnce(named(sixtyFourByName(), 12480, 'c1'))
    await open()
    expect(heads()).toContain('A')
    expect(scrubber()).toBeTruthy()
    expect(screen.getByText('12,480 friends')).toBeTruthy()
  })

  it('a search is the plain list again, newest first from the server, with no A–Z read', async () => {
    jest.useFakeTimers()
    try {
      mockGetFriends.mockResolvedValueOnce(page(sixtyFour(), 64))
      mockByName.mockResolvedValueOnce(named(sixtyFourByName(), 64))
      await open()
      mockGetFriends.mockResolvedValueOnce(page([friend(7)], 1))
      await act(async () => fireEvent.changeText(screen.getByTestId('friends-search'), 'friend 7'))
      await act(async () => jest.advanceTimersByTime(300))
      expect(heads()).toEqual([])
      expect(mockByName).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it('no index under 13 letter heads, nor at a larger text size (the heads stay headers for a screen reader)', async () => {
    await atScale(1)
    mockGetFriends.mockResolvedValueOnce(page(friends(40), 40))
    mockByName.mockResolvedValueOnce(named(friends(40), 40))
    await open()
    expect(heads()).toEqual(['Recently added', 'F'])
    expect(screen.queryByTestId('friends-scrubber', { includeHiddenElements: true })).toBeNull()
    await screen.unmount()
    await atScale(2)
    mockGetFriends.mockResolvedValueOnce(page(sixtyFour(), 64))
    mockByName.mockResolvedValueOnce(named(sixtyFourByName(), 64))
    await open()
    expect(screen.queryByTestId('friends-scrubber', { includeHiddenElements: true })).toBeNull()
    expect(heads()).toContain('प')
  })

  it('a short list never reads the A–Z', async () => {
    mockGetFriends.mockResolvedValueOnce(page(friends(11), 11))
    await open()
    expect(rows()).toHaveLength(11)
    expect(heads()).toEqual([])
    expect(mockByName).not.toHaveBeenCalled()
    expect(friendItems(friends(3), 'az')[0]).toEqual({ kind: 'head', key: 'h:recent', title: 'Recently added' })
  })
})

// Flow 7 1-A: Message on every row opens the DM; the row itself still opens the profile.
describe('Message on a row', () => {
  it('opens the conversation with that friend, and says so when it does not open', async () => {
    mockGetFriends.mockResolvedValue(page([{ ...friend(1), name: 'प्रियंका शर्मा' }], 1))
    mockOpenChat.mockResolvedValueOnce({ success: true, data: { conversationId: 'dm1' } })
    await open()
    await act(async () => fireEvent.press(screen.getByLabelText('Message प्रियंका शर्मा')))
    expect(mockOpenChat).toHaveBeenCalledWith('u1')
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/private-chat/[conversationId]', params: { conversationId: 'dm1', otherUserName: 'प्रियंका शर्मा', otherUserId: 'u1' } })
    mockOpenChat.mockResolvedValueOnce({ success: false })
    await act(async () => fireEvent.press(screen.getByLabelText('Message प्रियंका शर्मा')))
    expect(mockToast).toHaveBeenLastCalledWith('The conversation didn’t open. Try again.', 'error', { haptic: 'error' })
    await act(async () => fireEvent.press(screen.getByText('प्रियंका शर्मा')))
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/friends/[userId]', params: { userId: 'u1' } })
  })
})

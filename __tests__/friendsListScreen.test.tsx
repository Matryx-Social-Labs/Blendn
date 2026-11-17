/**
 * Friends, at every size (owner's large-data rule, 2026-10-22): 0, 1, 100, 101 and 1,000.
 *
 * The list is read a page at a time by the server's cursor, windowed (fixed 64 pt rows, an exact `getItemLayout`),
 * and its counts are the server's: the badge on Requests and the number under the title say how many there ARE, not
 * how many have been read. A failed later page keeps every row and offers Try again; it is never drawn as the end.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'

import FriendsScreen from '../app/friends'
import { friendItems, type FriendItem } from '../lib/friendsIndex'
import type { Friend } from '../lib/friends'
import { FlatList, StyleSheet } from 'react-native'
import { COLOR, SIZE } from '../lib/design/tokens'
import { noteFriendGone, takeFriendsGone } from '../lib/friendsGone'
import { PERSON_ROW_HEIGHT } from '../components/friends/PersonRow'
import { atScale, resetScale } from './helpers/ax'

// React Native's jest preset reads fontScale 2; a test that windows by index sets the default size itself.
afterEach(resetScale)

const mockPush = jest.fn()
const mockGetFriends = jest.fn()
const mockGetRequests = jest.fn()
const mockOpenChat = jest.fn()
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getFriends: (...a: unknown[]) => mockGetFriends(...a),
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
const noRequests = { success: true, data: { incoming: [], outgoing: [], pagination: { incoming: { totalCount: 0 }, outgoing: { totalCount: 0 } } } }

beforeEach(() => {
  jest.clearAllMocks()
  mockGetRequests.mockResolvedValue(noRequests)
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
    await open()
    expect(mockGetFriends).toHaveBeenCalledTimes(1)
    await reachEnd()
    expect(mockGetFriends).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('friends-more')).toBeNull()
    expect(screen.queryByText('100')).toBeNull()
  })
})

// Past ALL_AT_ONCE the list stays newest first and pages as you scroll (Flow 7 1-A): these are the paging rules there.
describe('1,001 friends', () => {
  it('the second page is asked for by cursor when the end comes near, once, and the count is the whole list', async () => {
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 1001, 'c1')).mockResolvedValueOnce(page(friends(1, 100), 1001))
    await open()
    expect(screen.getByText('1,001 friends')).toBeTruthy()
    expect(rows()).toHaveLength(100)
    await reachEnd()
    expect(mockGetFriends).toHaveBeenLastCalledWith('c1', null)
    expect(rows()).toHaveLength(101)
    await reachEnd()
    expect(mockGetFriends).toHaveBeenCalledTimes(2)
  })

  it('a second ask while the first is on its way is not sent', async () => {
    let release: (v: unknown) => void = () => {}
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 1001, 'c1')).mockReturnValueOnce(new Promise((r) => (release = r)))
    await open()
    await reachEnd()
    await reachEnd()
    expect(mockGetFriends).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText('Loading more')).toBeTruthy()
    await act(async () => release(page(friends(1, 100), 1001)))
    expect(screen.queryByLabelText('Loading more')).toBeNull()
  })

  it('a failed second page keeps all 100 rows and offers Try again; it is not the end of the list', async () => {
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 1001, 'c1')).mockResolvedValueOnce({ success: false })
    await open()
    await reachEnd()
    expect(rows()).toHaveLength(100)
    expect(screen.getByText('Couldn’t load more.')).toBeTruthy()
    mockGetFriends.mockResolvedValueOnce(page(friends(1, 100), 1001))
    await act(async () => {
      fireEvent.press(screen.getByText('Try again'))
    })
    expect(mockGetFriends).toHaveBeenLastCalledWith('c1', null)
    expect(rows()).toHaveLength(101)
    expect(screen.queryByText('Couldn’t load more.')).toBeNull()
  })
})

describe('1,000 friends', () => {
  it('ten pages by cursor, each row exactly one fixed height, and the whole count under the title', async () => {
    await atScale(1)
    for (let p = 0; p < 10; p++) mockGetFriends.mockResolvedValueOnce(page(friends(100, p * 100), 1000, p < 9 ? `c${p + 1}` : null))
    await open()
    expect(screen.getByText('1,000')).toBeTruthy()
    for (let p = 1; p < 10; p++) await reachEnd()
    expect(rows()).toHaveLength(1000)
    expect(mockGetFriends.mock.calls.map((c) => c[0])).toEqual([null, 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'])
    // Every row one fixed height, every head one fixed height: the last item's offset is their sum, so the list stays windowed.
    const data = list().props.data as FriendItem[]
    const last = data.length - 1
    const heads = data.filter((i) => i.kind === 'head').length
    expect(list().props.getItemLayout(null, last)).toEqual({ length: PERSON_ROW_HEIGHT, offset: PERSON_ROW_HEIGHT * (last - heads) + SIZE.tag * heads, index: last })
  })

  it('is a windowed FlatList: a small first render and a window of seven screens, never every row', async () => {
    await atScale(1)
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 1000, 'c1'))
    await open()
    expect(list().props.initialNumToRender).toBeLessThanOrEqual(12)
    expect(list().props.windowSize).toBeLessThanOrEqual(7)
    expect(list().props.getItemLayout).toEqual(expect.any(Function))
    expect(list().props.onEndReached).toEqual(expect.any(Function))
  })

  // DS-05: past the default size a row grows, so indexing by 64 would misplace every row below a tall one. Negative
  // control: an ungated getItemLayout fails this.
  it('windows by index only at the default text size; at a larger size the list measures its rows', async () => {
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 1000, 'c1'))
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
    await atScale(1)
    await open()
    expect(flat('friends-head-recently-added-bar')).toMatchObject({ height: SIZE.tag, backgroundColor: COLOR.ink })
    await screen.unmount()
    mockGetFriends.mockResolvedValueOnce(page(friends(64), 64))
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
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 1000, 'c1')).mockResolvedValueOnce(page(friends(100, 99), 1000, 'c2'))
    await open()
    await reachEnd()
    expect(rows()).toHaveLength(199)
  })
})

describe('coming back to the list', () => {
  const twoPages = async () => {
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 1250, 'c1')).mockResolvedValueOnce(page(friends(100, 100), 1250, 'c2'))
    await open()
    await reachEnd()
    expect(rows()).toHaveLength(200)
  }
  beforeEach(() => void takeFriendsGone())

  it('reads the head again and keeps the pages read further down: the list does not jump to the top', async () => {
    await twoPages()
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 1250, 'c1'))
    await act(async () => mockFocus())
    // The head is read with no cursor.
    expect(mockGetFriends.mock.calls.at(-1)).toEqual([null, null])
    expect(rows()).toHaveLength(200)
    // And the next page is still the one after what was read, not the second page over again.
    mockGetFriends.mockResolvedValueOnce(page(friends(50, 200), 1250))
    await reachEnd()
    expect(mockGetFriends).toHaveBeenLastCalledWith('c2', null)
    expect(rows()).toHaveLength(250)
  })

  it('somebody removed on their profile leaves with it, from a page read earlier', async () => {
    await twoPages()
    noteFriendGone('u150')
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 1249, 'c1'))
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
 * Flow 7 1-A, A–Z that never reshuffles: up to ALL_AT_ONCE (500) every page is read before the A–Z is drawn, with an index down the
 * edge past 12 letter heads; past it the list stays newest first, with no heads and no index. Heads are script-aware: प्रियंका
 * files under "प" after Z, not under "#". Negative control: the old builder (A–Z from the pages loaded so far, Devanagari under
 * "#") fails the first three.
 */
describe('A–Z (Flow 7 1-A)', () => {
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  // 64 friends over every Latin letter, two in Devanagari and one that starts with a digit: the walk's seeded account.
  const sixtyFour = () => [
    ...Array.from({ length: 61 }, (_, i) => ({ ...friend(i), name: `${LETTERS[i % 26]}${'aeiou'[i % 5]}rav ${i}` })),
    { ...friend(61), name: 'प्रियंका शर्मा' },
    { ...friend(62), name: 'पूजा' },
    { ...friend(63), name: '9lives' },
  ]
  const heads = () => (list().props.data as FriendItem[]).flatMap((i) => (i.kind === 'head' ? [i.title] : []))

  it('64 friends: Recently added, then A–Z, then प after Z, then #; and the index down the edge', async () => {
    await atScale(1)
    mockGetFriends.mockResolvedValueOnce(page(sixtyFour(), 64))
    await open()
    expect(heads()).toEqual(['Recently added', ...LETTERS, 'प', '#'])
    const data = list().props.data as FriendItem[]
    const under = (title: string) => data.slice(data.findIndex((i) => i.kind === 'head' && i.title === title) + 1).find((i) => i.kind === 'friend') as { friend: Friend }
    expect(under('प').friend.name).toBe('पूजा')
    expect(under('#').friend.name).toBe('9lives')
    expect(screen.getByTestId('friends-scrubber', { includeHiddenElements: true })).toBeTruthy()
    const letters = within(screen.getByTestId('friends-scrubber', { includeHiddenElements: true })).getAllByText(/./, { includeHiddenElements: true })
    expect(letters.map((n) => n.props.children)).toEqual(['★', ...LETTERS, 'प', '#'])
  })

  it('the index jumps the list to a letter, and to the next letter that has names when one has none', async () => {
    await atScale(1)
    const scroll = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => {})
    const noB = sixtyFour().map((f) => (f.name.startsWith('B') ? { ...f, name: `C${f.name.slice(1)}` } : f))
    mockGetFriends.mockResolvedValueOnce(page(noB, 64))
    await open()
    const scrubber = screen.getByTestId('friends-scrubber', { includeHiddenElements: true })
    const data = list().props.data as FriendItem[]
    const headAt = (t: string) => data.findIndex((i) => i.kind === 'head' && i.title === t)
    // Rows of 14 (13 + 1): ★ at 0, A at 14, B at 28.
    await act(async () => fireEvent(scrubber, 'responderGrant', { nativeEvent: { pageY: 14 + 3 } }))
    expect(scroll).toHaveBeenLastCalledWith({ index: headAt('A'), animated: false })
    await act(async () => fireEvent(scrubber, 'responderMove', { nativeEvent: { pageY: 28 + 3 } }))
    expect(scroll).toHaveBeenLastCalledWith({ index: headAt('C'), animated: false })
    scroll.mockRestore()
  })

  it('350 friends: every page is read before the list is drawn, with no scroll to the end; until then, the skeleton', async () => {
    await atScale(1)
    let last: (v: unknown) => void = () => {}
    mockGetFriends
      .mockResolvedValueOnce(page(friends(100), 350, 'c1'))
      .mockResolvedValueOnce(page(friends(100, 100), 350, 'c2'))
      .mockResolvedValueOnce(page(friends(100, 200), 350, 'c3'))
      .mockReturnValueOnce(new Promise((r) => (last = r)))
    await open()
    expect(mockGetFriends.mock.calls.map((c) => c[0])).toEqual([null, 'c1', 'c2', 'c3'])
    expect(screen.queryByTestId('friends-list')).toBeNull()
    expect(screen.getByTestId('person-skeleton')).toBeTruthy()
    await act(async () => last(page(friends(50, 300), 350)))
    expect(rows()).toHaveLength(350)
    expect(heads()[0]).toBe('Recently added')
  })

  it('a page that fails on the way to the whole list says so and tries again from where it stopped', async () => {
    await atScale(1)
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 150, 'c1')).mockResolvedValueOnce({ success: false })
    await open()
    expect(screen.getByText('Couldn’t load more.')).toBeTruthy()
    mockGetFriends.mockResolvedValueOnce(page(friends(50, 100), 150))
    await act(async () => fireEvent.press(screen.getByText('Try again')))
    expect(mockGetFriends).toHaveBeenLastCalledWith('c1', null)
    expect(rows()).toHaveLength(150)
  })

  it('1,002 friends: newest first as the server sends them, no heads and no index; more as you scroll', async () => {
    await atScale(1)
    const named = ['Zain', 'arnav', 'प्रियंका', 'Kai', '9lives', 'Fay', 'Aarav'].map((name, i) => ({ ...friend(i), name }))
    mockGetFriends.mockResolvedValueOnce(page(named, 1002, 'c1'))
    await open()
    expect(heads()).toEqual([])
    expect(rows().map((f) => f.name)).toEqual(['Zain', 'arnav', 'प्रियंका', 'Kai', '9lives', 'Fay', 'Aarav'])
    expect(screen.queryByTestId('friends-scrubber', { includeHiddenElements: true })).toBeNull()
    expect(mockGetFriends).toHaveBeenCalledTimes(1)
  })

  it('no index under 13 letter heads, nor at a larger text size (the heads stay headers for a screen reader)', async () => {
    await atScale(1)
    mockGetFriends.mockResolvedValueOnce(page(friends(40), 40))
    await open()
    expect(heads()).toEqual(['Recently added', 'F'])
    expect(screen.queryByTestId('friends-scrubber', { includeHiddenElements: true })).toBeNull()
    await screen.unmount()
    await atScale(2)
    mockGetFriends.mockResolvedValueOnce(page(sixtyFour(), 64))
    await open()
    expect(screen.queryByTestId('friends-scrubber', { includeHiddenElements: true })).toBeNull()
    expect(heads()).toContain('प')
  })

  it('friendItems: a short list or a search is one plain run, with no heads', () => {
    const few = friends(3)
    expect(friendItems(few, 'plain').every((i) => i.kind === 'friend')).toBe(true)
    expect(friendItems(few, 'az')[0]).toEqual({ kind: 'head', key: 'h:recent', title: 'Recently added' })
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

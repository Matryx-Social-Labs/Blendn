/**
 * Friends, at every size (owner's large-data rule, 2026-10-22): 0, 1, 100, 101 and 1,000.
 *
 * The list is read a page at a time by the server's cursor, windowed (fixed 64 pt rows, an exact `getItemLayout`),
 * and its counts are the server's: the badge on Requests and the number under the title say how many there ARE, not
 * how many have been read. A failed later page keeps every row and offers Try again; it is never drawn as the end.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'

import FriendsScreen, { friendItems, type FriendItem } from '../app/friends'
import type { Friend } from '../lib/friends'
import { StyleSheet } from 'react-native'
import { COLOR, SIZE } from '../lib/design/tokens'
import { noteFriendGone, takeFriendsGone } from '../lib/friendsGone'
import { PERSON_ROW_HEIGHT } from '../components/friends/PersonRow'
import { atScale, resetScale } from './helpers/ax'

// React Native's jest preset reads fontScale 2; a test that windows by index sets the default size itself.
afterEach(resetScale)

const mockPush = jest.fn()
const mockGetFriends = jest.fn()
const mockGetRequests = jest.fn()
jest.mock('../lib/apiClient', () => ({
  apiClient: { getFriends: (...a: unknown[]) => mockGetFriends(...a), getFriendRequests: (...a: unknown[]) => mockGetRequests(...a) },
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
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
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

describe('101 friends', () => {
  it('the second page is asked for by cursor when the end comes near, once, and the count is the whole list', async () => {
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 101, 'c1')).mockResolvedValueOnce(page(friends(1, 100), 101))
    await open()
    expect(screen.getByText('101')).toBeTruthy()
    expect(rows()).toHaveLength(100)
    await reachEnd()
    expect(mockGetFriends).toHaveBeenLastCalledWith('c1', null)
    expect(rows()).toHaveLength(101)
    await reachEnd()
    expect(mockGetFriends).toHaveBeenCalledTimes(2)
  })

  it('a second ask while the first is on its way is not sent', async () => {
    let release: (v: unknown) => void = () => {}
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 101, 'c1')).mockReturnValueOnce(new Promise((r) => (release = r)))
    await open()
    await reachEnd()
    await reachEnd()
    expect(mockGetFriends).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText('Loading more')).toBeTruthy()
    await act(async () => release(page(friends(1, 100), 101)))
    expect(screen.queryByLabelText('Loading more')).toBeNull()
  })

  it('a failed second page keeps all 100 rows and offers Try again; it is not the end of the list', async () => {
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 101, 'c1')).mockResolvedValueOnce({ success: false })
    await open()
    await reachEnd()
    expect(rows()).toHaveLength(100)
    expect(screen.getByText('Couldn’t load more.')).toBeTruthy()
    mockGetFriends.mockResolvedValueOnce(page(friends(1, 100), 101))
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
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 1000, 'c1'))
    await atScale(1)
    await open()
    expect(flat('friends-head-recently-added-bar')).toMatchObject({ height: SIZE.tag, backgroundColor: COLOR.ink })
    await screen.unmount()
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 1000, 'c1'))
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
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 250, 'c1')).mockResolvedValueOnce(page(friends(100, 100), 250, 'c2'))
    await open()
    await reachEnd()
    expect(rows()).toHaveLength(200)
  }
  beforeEach(() => void takeFriendsGone())

  it('reads the head again and keeps the pages read further down: the list does not jump to the top', async () => {
    await twoPages()
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 250, 'c1'))
    await act(async () => mockFocus())
    // The head is read with no cursor.
    expect(mockGetFriends.mock.calls.at(-1)).toEqual([null, null])
    expect(rows()).toHaveLength(200)
    // And the next page is still the one after what was read, not the second page over again.
    mockGetFriends.mockResolvedValueOnce(page(friends(50, 200), 250))
    await reachEnd()
    expect(mockGetFriends).toHaveBeenLastCalledWith('c2', null)
    expect(rows()).toHaveLength(250)
  })

  it('somebody removed on their profile leaves with it, from a page read earlier', async () => {
    await twoPages()
    noteFriendGone('u150')
    mockGetFriends.mockResolvedValueOnce(page(friends(100), 249, 'c1'))
    await act(async () => mockFocus())
    const ids = rows().map((f) => f.userId)
    expect(ids).toHaveLength(199)
    expect(ids).not.toContain('u150')
    expect(screen.getByText('249')).toBeTruthy()
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
 * D7 (D-LM1): past a screenful the list is "Recently added" (the server's newest five) then A–Z under sticky heads, still one
 * windowed FlatList with an exact `getItemLayout`. A search, or a short list, is one plain run.
 * Negative control: the flat list as it was (no heads) fails the first two.
 */
describe('sections', () => {
  it('1,002 friends: Recently added first, then A–Z heads that stick, from the loaded pages', async () => {
    const named = ['Zain', 'arnav', 'Ábhi', 'Kai', '9lives', 'Fay', 'Aarav'].map((name, i) => ({ ...friend(i), name }))
    mockGetFriends.mockResolvedValueOnce(page(named, 1002, 'c1'))
    await open()
    const data = list().props.data as FriendItem[]
    const heads = data.filter((i) => i.kind === 'head').map((i) => (i as { title: string }).title)
    expect(heads).toEqual(['Recently added', 'A', 'F', 'K', 'Z', '#'])
    // The server's newest five, in its order, under Recently added.
    expect(data.slice(1, 6).map((i) => (i as { friend: Friend }).friend.name)).toEqual(['Zain', 'arnav', 'Ábhi', 'Kai', '9lives'])
    expect(rows().map((f) => f.name)).toEqual(['Aarav', 'Ábhi', 'arnav', 'Fay', 'Kai', 'Zain', '9lives'])
    // Each drawn head sticks (the list passes on the ones in its window): its index, shifted by one for the Make a crew row above.
    const sticky = list().props.stickyHeaderIndices as number[]
    expect(sticky.length).toBeGreaterThan(1)
    expect(sticky.every((n) => data[n - 1]?.kind === 'head')).toBe(true)
  })

  it('friendItems: a short list or a search is one plain run, with no heads', () => {
    const few = friends(3)
    expect(friendItems(few, false).every((i) => i.kind === 'friend')).toBe(true)
    expect(friendItems(few, true)[0]).toEqual({ kind: 'head', key: 'h:recent', title: 'Recently added' })
  })
})

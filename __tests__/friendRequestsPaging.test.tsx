/**
 * Friend requests at every size (large data, 2026-10-22): Requests pages the incoming side by cursor
 * (`?list=incoming&cursor=`), Add friends shows only the first few and the rest of what is waiting is one row away, and
 * Sent pages its own side. Answering a request takes it off the list AND off the count.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'

import AddFriendsScreen from '../app/friends/add'
import FriendRequestsScreen from '../app/friends/requests'

const mockPush = jest.fn()
const mockGet = jest.fn()
const mockRespond = jest.fn()
const mockToast = jest.fn()
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getFriendRequests: (...a: unknown[]) => mockGet(...a),
    respondToFriendRequest: (...a: unknown[]) => mockRespond(...a),
    withdrawFriendRequest: jest.fn(),
    getFriendInvite: jest.fn(async () => ({ success: true, data: { token: 'tok', url: 'https://www.blendn.app/f/tok' } })),
    resetFriendInvite: jest.fn(),
  },
}))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../lib/friendsSeeMeAsk', () => ({ askFriendsSeeMe: jest.fn(), useStillHere: () => () => true }))
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: (...a: unknown[]) => mockPush(...a) },
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = require('react')
    useEffect(effect, [effect])
  },
}))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: (...a: unknown[]) => mockToast(...a) }) }))
jest.mock('../components/ds/Orbs', () => ({ Orbs: () => null }))
jest.mock('../lib/useAuth', () => {
  const auth = { user: { id: 'u_me', name: 'Sam' } }
  return { useAuth: () => auth }
})
jest.mock('../components/OptimizedImage', () => {
  const { View } = require('react-native')
  return { OptimizedImage: () => <View /> }
})
jest.mock('../components/profile/OfflineStrip', () => ({ OfflineStrip: () => null, useOffline: () => false }))

const req = (i: number) => ({ id: `r${i}`, person: { userId: `u${i}`, name: `Person ${i}`, photo: null }, createdAt: '2026-09-27T20:00:00Z' })
const reqs = (n: number, from = 0) => Array.from({ length: n }, (_, i) => req(from + i))
const meta = (total: number, next: string | null) => ({ limit: 50, hasMore: next !== null, nextCursor: next, totalCount: total })

beforeEach(() => {
  jest.clearAllMocks()
  mockRespond.mockResolvedValue({ success: true, data: { state: 'friends' } })
})

describe('Requests (incoming)', () => {
  const open = async () => {
    await render(<FriendRequestsScreen />)
    await act(async () => {})
  }
  const list = () => screen.getByTestId('requests-list')
  const reachEnd = async () => {
    await act(async () => {
      fireEvent(list(), 'endReached')
    })
  }

  it('0 waiting: "No requests"', async () => {
    mockGet.mockResolvedValue({ success: true, data: { incoming: [], outgoing: [], pagination: { incoming: meta(0, null), outgoing: meta(0, null) } } })
    await open()
    expect(screen.getByText('No requests')).toBeTruthy()
  })

  it('1 waiting: one card, no foot, and a second look at the end asks for nothing', async () => {
    mockGet.mockResolvedValue({ success: true, data: { incoming: reqs(1), outgoing: [], pagination: { incoming: meta(1, null), outgoing: meta(0, null) } } })
    await open()
    expect(list().props.data).toHaveLength(1)
    await reachEnd()
    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('requests-more')).toBeNull()
  })

  it('100 waiting: two pages of 50, and after the second the end asks for nothing more', async () => {
    mockGet
      .mockResolvedValueOnce({ success: true, data: { incoming: reqs(50), outgoing: [], pagination: { incoming: meta(100, 'i1'), outgoing: meta(0, null) } } })
      .mockResolvedValueOnce({ success: true, data: { incoming: reqs(50, 50), pagination: { incoming: meta(100, null) } } })
    await open()
    await reachEnd()
    expect(list().props.data).toHaveLength(100)
    await reachEnd()
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  it('51 waiting: the first 50, then the 51st by `?list=incoming&cursor=`', async () => {
    mockGet
      .mockResolvedValueOnce({ success: true, data: { incoming: reqs(50), outgoing: [], pagination: { incoming: meta(51, 'i1'), outgoing: meta(0, null) } } })
      .mockResolvedValueOnce({ success: true, data: { incoming: reqs(1, 50), pagination: { incoming: meta(51, null) } } })
    await open()
    expect(list().props.data).toHaveLength(50)
    await reachEnd()
    expect(mockGet).toHaveBeenLastCalledWith({ side: 'incoming', cursor: 'i1' })
    expect(list().props.data).toHaveLength(51)
    await reachEnd()
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  it('a failed page keeps the cards and offers Try again', async () => {
    mockGet
      .mockResolvedValueOnce({ success: true, data: { incoming: reqs(50), outgoing: [], pagination: { incoming: meta(120, 'i1'), outgoing: meta(0, null) } } })
      .mockResolvedValueOnce({ success: false })
    await open()
    await reachEnd()
    expect(list().props.data).toHaveLength(50)
    expect(screen.getByText('Couldn’t load more.')).toBeTruthy()
  })

  it('1,000 waiting: twenty pages, the list windowed', async () => {
    for (let p = 0; p < 20; p++) {
      const data = { incoming: reqs(50, p * 50), pagination: { incoming: meta(1000, p < 19 ? `i${p + 1}` : null) } }
      mockGet.mockResolvedValueOnce({ success: true, data: p === 0 ? { ...data, outgoing: [], pagination: { ...data.pagination, outgoing: meta(0, null) } } : data })
    }
    await open()
    for (let p = 1; p < 20; p++) await reachEnd()
    expect(list().props.data).toHaveLength(1000)
    expect(list().props.windowSize).toBeLessThanOrEqual(7)
  })

  it('an accepted request leaves the list; an unfinished profile says so instead of "That didn’t go through"', async () => {
    mockGet.mockResolvedValue({ success: true, data: { incoming: [req(1), req(2)], outgoing: [], pagination: { incoming: meta(2, null), outgoing: meta(0, null) } } })
    await open()
    mockRespond.mockResolvedValueOnce({ success: false, errorCode: 'FORBIDDEN', reasonCode: 'PROFILE_INCOMPLETE' })
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Accept Person 1'))
    })
    expect(mockToast).toHaveBeenLastCalledWith('Finish your profile to add friends', 'error', { haptic: 'error' })
    expect(list().props.data).toHaveLength(2)
    mockRespond.mockResolvedValueOnce({ success: false, errorCode: 'RATE_LIMITED', reasonCode: 'RATE_LIMITED', retryAfter: 48 })
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Accept Person 1'))
    })
    expect(mockToast).toHaveBeenLastCalledWith('Slow down — try again in a minute', 'error', { haptic: 'error' })
    mockRespond.mockResolvedValueOnce({ success: false, errorCode: 'SERVER_ERROR' })
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Accept Person 1'))
    })
    expect(mockToast).toHaveBeenLastCalledWith('That didn’t go through. Try again.', 'error', { haptic: 'error' })
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Accept Person 1'))
    })
    expect(list().props.data).toHaveLength(1)
  })
})

describe('Add friends', () => {
  const open = async () => {
    await render(<AddFriendsScreen />)
    await act(async () => {})
  }

  it('shows the first three requests and one row to the rest, with the true count', async () => {
    mockGet.mockResolvedValue({ success: true, data: { incoming: reqs(50), outgoing: [], pagination: { incoming: meta(120, 'i1'), outgoing: meta(0, null) } } })
    await open()
    expect(screen.getByLabelText('Accept Person 0')).toBeTruthy()
    expect(screen.getByLabelText('Accept Person 2')).toBeTruthy()
    expect(screen.queryByLabelText('Accept Person 3')).toBeNull()
    expect(screen.getByLabelText('120 friend requests')).toBeTruthy()
    await act(async () => {
      fireEvent.press(screen.getByLabelText('120 friend requests'))
    })
    expect(mockPush).toHaveBeenCalledWith('/friends/requests')
  })

  it('three or fewer: no row to more, because there is no more', async () => {
    mockGet.mockResolvedValue({ success: true, data: { incoming: reqs(3), outgoing: [], pagination: { incoming: meta(3, null), outgoing: meta(0, null) } } })
    await open()
    expect(screen.queryByTestId('requests-row')).toBeNull()
  })

  it('Sent is a windowed list that pages its own side', async () => {
    mockGet
      .mockResolvedValueOnce({ success: true, data: { incoming: [], outgoing: reqs(50), pagination: { incoming: meta(0, null), outgoing: meta(60, 'o1') } } })
      .mockResolvedValueOnce({ success: true, data: { outgoing: reqs(10, 50), pagination: { outgoing: meta(60, null) } } })
    await open()
    const list = screen.getByTestId('add-friends-list')
    expect(list.props.data).toHaveLength(50)
    expect(list.props.windowSize).toBeLessThanOrEqual(7)
    await act(async () => {
      fireEvent(list, 'endReached')
    })
    expect(mockGet).toHaveBeenLastCalledWith({ side: 'outgoing', cursor: 'o1' })
    expect(screen.getByTestId('add-friends-list').props.data).toHaveLength(60)
  })
})

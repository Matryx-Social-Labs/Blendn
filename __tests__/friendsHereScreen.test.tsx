/*
 * See all friends here (plans/friends-in-room.md C2): a pushed screen, A to Z with
 * sticky letters, search, fixed-height rows and pages of 50. The list is a FlatList
 * with an exact `getItemLayout`, never a ScrollView, so 300 friends stay light.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'

import FriendsHereScreen from '../app/room/friends-here'
import { FRIEND_ROW_HEIGHT, LETTER_HEIGHT, SEARCH_DEBOUNCE_MS } from '../lib/friendsHereList'

const mockGet = jest.fn()
const mockOpen = jest.fn()
const mockBack = jest.fn()
const mockPush = jest.fn()
let mockParams: Record<string, string | undefined> = { eventId: 'e1' }
jest.mock('../lib/apiClient', () => ({
  apiClient: { getFriendsHere: (...a: unknown[]) => mockGet(...a), openFriendConversation: (...a: unknown[]) => mockOpen(...a) },
}))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../lib/socketClient', () => ({}))
jest.mock('expo-router', () => ({
  router: { back: (...a: unknown[]) => mockBack(...a), push: (...a: unknown[]) => mockPush(...a), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
}))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
const mockToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }))

const friend = (name: string, i: number) => ({ userId: `u${i}`, name, photo: null })
const page = (friends: ReturnType<typeof friend>[], total: number, nextCursor: string | null = null) => ({ success: true, data: { friends, total, nextCursor } })
const HIDDEN = { includeHiddenElements: true }

beforeEach(() => {
  jest.useFakeTimers()
  mockGet.mockReset()
  mockOpen.mockReset()
  mockBack.mockReset()
  mockPush.mockReset()
  mockToast.mockReset()
  mockParams = { eventId: 'e1' }
})
afterEach(() => jest.useRealTimers())

const open = async () => {
  await render(<FriendsHereScreen />)
  await act(async () => {})
}

describe('See all friends here', () => {
  it('lists the friends A to Z under their letters, with the count and a search', async () => {
    mockGet.mockResolvedValue(page([friend('Aarav Gupta', 1), friend('Asha Menon', 2), friend('Dev Malhotra', 3)], 60))
    await open()
    expect(mockGet).toHaveBeenCalledWith('e1', { order: 'name', limit: 50, q: undefined })
    expect(screen.getByText('Friends here')).toBeTruthy()
    expect(screen.getByText('60')).toBeTruthy()
    expect(screen.getByPlaceholderText('Search friends here')).toBeTruthy()
    expect(screen.getByText('Aarav Gupta')).toBeTruthy()
    expect(screen.getByLabelText('A')).toBeTruthy()
    expect(screen.getByLabelText('D')).toBeTruthy()
  })

  it('is one virtualised list with sticky letters and exact row heights', async () => {
    mockGet.mockResolvedValue(page([friend('Aarav', 1), friend('Dev', 2)], 2))
    await open()
    const list = screen.getByTestId('friends-here-list')
    expect(list.props.stickyHeaderIndices).toEqual([0, 2])
    expect(list.props.getItemLayout(null, 1)).toEqual({ length: FRIEND_ROW_HEIGHT, offset: LETTER_HEIGHT, index: 1 })
    expect(list.props.getItemLayout(null, 2)).toEqual({ length: LETTER_HEIGHT, offset: LETTER_HEIGHT + FRIEND_ROW_HEIGHT, index: 2 })
  })

  it('opens the friend chat from a row, by real id', async () => {
    mockGet.mockResolvedValue(page([friend('Asha Menon', 7)], 3))
    mockOpen.mockResolvedValue({ success: true, data: { conversationId: 'c9' } })
    await open()
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Message Asha Menon' }))
    })
    expect(mockOpen).toHaveBeenCalledWith('u7')
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/private-chat/[conversationId]',
      params: { conversationId: 'c9', otherUserName: 'Asha Menon', otherUserId: 'u7' },
    })
  })

  it('a chat that will not open says so, with the first name', async () => {
    mockGet.mockResolvedValue(page([friend('Asha Menon', 7)], 3))
    mockOpen.mockResolvedValue({ success: false })
    await open()
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Message Asha Menon' }))
    })
    expect(mockToast).toHaveBeenCalledWith("Couldn’t open your chat with Asha. Try again.", 'error')
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('search with no match says so', async () => {
    mockGet.mockResolvedValueOnce(page([friend('Asha Menon', 1)], 4))
    await open()
    mockGet.mockResolvedValue(page([], 0))
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Search friends here'), 'zzz')
    })
    await act(async () => {
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
    })
    expect(screen.getByText('No friend here by that name.')).toBeTruthy()
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('clearing a search that matched nobody stays; it does not leave as if the room were empty', async () => {
    mockGet.mockResolvedValueOnce(page([friend('Asha Menon', 1)], 4))
    await open()
    mockGet.mockResolvedValue(page([], 0))
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Search friends here'), 'zzz')
    })
    await act(async () => {
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
    })
    expect(screen.getByText('No friend here by that name.')).toBeTruthy()
    mockGet.mockResolvedValue(page([friend('Asha Menon', 1)], 4))
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Search friends here'), '')
    })
    expect(mockBack).not.toHaveBeenCalled()
    await act(async () => {
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
    })
    expect(mockBack).not.toHaveBeenCalled()
    expect(screen.getByText('Asha Menon')).toBeTruthy()
  })

  it('a link that names no event says it does not work, with Back, never skeleton rows for ever (drive 4 D-11)', async () => {
    mockParams = {}
    await open()
    expect(screen.getByText('This link doesn’t work')).toBeTruthy()
    expect(mockGet).not.toHaveBeenCalled()
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }))
    expect(mockBack).toHaveBeenCalled()
  })

  it('a failed read offers Try again', async () => {
    mockGet.mockResolvedValueOnce({ success: false })
    await open()
    expect(screen.getByText('Your friends didn’t load')).toBeTruthy()
    mockGet.mockResolvedValue(page([friend('Asha Menon', 1)], 4))
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    })
    await act(async () => {})
    expect(screen.getByText('Asha Menon')).toBeTruthy()
  })

  it('everyone gone while it was open: back to the Room, with no new copy', async () => {
    mockGet.mockResolvedValue(page([], 0))
    await open()
    expect(mockBack).toHaveBeenCalled()
    expect(screen.queryByText('No friend here by that name.', HIDDEN)).toBeNull()
  })

  it('the search stops at 40 characters, as the server does', async () => {
    mockGet.mockResolvedValue(page([friend('Asha Menon', 1)], 4))
    await open()
    expect(screen.getByPlaceholderText('Search friends here').props.maxLength).toBe(40)
  })

  it('a count in thousands is grouped under the title', async () => {
    mockGet.mockResolvedValue(page([friend('Asha Menon', 1)], 1204))
    await open()
    expect(screen.getByText('1,204')).toBeTruthy()
  })

  it('a long name takes at most two lines (the row has no line under it) next to its Message', async () => {
    mockGet.mockResolvedValue(page([friend('Karthik Subramaniam Venkataraman', 1)], 1))
    await open()
    expect(screen.getByText('Karthik Subramaniam Venkataraman').props.numberOfLines).toBe(2)
    expect(screen.getByRole('button', { name: 'Message Karthik Subramaniam Venkataraman' })).toBeTruthy()
  })
})

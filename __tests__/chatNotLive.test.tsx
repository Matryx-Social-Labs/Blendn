import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react-native'

/**
 * A place's room, rendered (step 5 review: M3, M4, L2, X2, X3). The window
 * ends → the not-live state; going live again (a check-in change) → the room
 * is back and its socket rejoined; "Go live again" goes back to the place it
 * was opened from, or opens the place from the room's own row.
 */
const mockEnded: Array<(d: { eventId: string; reason: string }) => void> = []
const mockChanged = new Set<() => void>()
const mockRejoin = jest.fn()
let mockParams: Record<string, string> = { id: 'g1' }

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
}))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }))
jest.mock('../lib/perf', () => ({ ScreenProfiler: ({ children }: { children: React.ReactNode }) => children }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn(), journey: jest.fn() } }))
// One user object: the room adjusts state in render when the user changes identity.
const mockAuth = { user: { id: 'u1', name: 'Sneha' }, loading: false }
jest.mock('../lib/useAuth', () => ({ useAuth: () => mockAuth }))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getChatMessages: jest.fn(),
    getChatGroups: jest.fn(),
    sendChatMessage: jest.fn(),
    reactToChatMessage: jest.fn(),
    rejoinChatGroup: jest.fn(),
  },
}))
jest.mock('../lib/socketClient', () => {
  const noop = () => () => {}
  return {
    subscribeToLiveEnded: (cb: never) => {
      mockEnded.push(cb)
      return () => {}
    },
    subscribeToChatMessage: noop,
    subscribeToChatTyping: noop,
    subscribeToChatReaction: noop,
    subscribeToChatMessageDeleted: noop,
    subscribeToChatMemberBanned: noop,
    subscribeToChatMemberLeft: noop,
    rejoinChatSocket: (...a: unknown[]) => mockRejoin(...a),
    startTyping: jest.fn(),
    stopTyping: jest.fn(),
  }
})
jest.mock('../lib/checkIn', () => ({
  subscribeCheckInChanged: (f: () => void) => {
    mockChanged.add(f)
    return () => mockChanged.delete(f)
  },
}))
jest.mock('../lib/useLiveSync', () => ({ useLiveSync: () => ({ state: 'connected', connected: true }) }))
jest.mock('../components/RealtimeStatusBanner', () => ({ __esModule: true, default: () => null }))
jest.mock('../components/chat/RoomGuidelinesBanner', () => ({ RoomGuidelinesBanner: () => null }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../components/ActionTray', () => ({ __esModule: true, default: () => null }))
jest.mock('../lib/notifications', () => ({ useActiveThread: jest.fn() }))

/* eslint-disable import/first */
import { router } from 'expo-router'
import GroupChat from '../app/chat/[id]'
import { apiClient } from '../lib/apiClient'
/* eslint-enable import/first */

const refused = { success: false, errorCode: 'NOT_LIVE', error: "You're not live here any more. Go live at the venue to join today's room." }
const served = { success: true, data: { messages: [], pagination: { hasMore: false, nextCursor: null } } }
const placeRow = { id: 'g1', name: 'Cubbon Park Bandstand', memberCount: null, event: { id: 'day-1', kind: 'venue_day', venueId: 'v1', title: 'Venue day · Cubbon Park Bandstand · 2026-10-09' } }

const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve()
  })
}

beforeEach(() => {
  mockEnded.length = 0
  mockChanged.clear()
  mockParams = { id: 'g1' }
  ;(apiClient.getChatGroups as jest.Mock).mockResolvedValue({ success: true, data: { groups: [placeRow] } })
})

it('the window ends: the room becomes "not live", and comes back — socket rejoined — once you are live again (M3, X2, X3)', async () => {
  ;(apiClient.getChatMessages as jest.Mock).mockResolvedValue(served)
  await render(<GroupChat />)
  await flush()
  expect(screen.queryByText("You're not live here any more")).toBeNull()

  ;(apiClient.getChatMessages as jest.Mock).mockResolvedValue(refused)
  await act(async () => mockEnded.forEach((f) => f({ eventId: 'day-1', reason: 'expired' })))
  await flush()
  expect(screen.getByText("You're not live here any more")).toBeTruthy()

  ;(apiClient.getChatMessages as jest.Mock).mockResolvedValue(served)
  await act(async () => mockChanged.forEach((f) => f()))
  await flush()
  expect(screen.queryByText("You're not live here any more")).toBeNull()
  expect(mockRejoin).toHaveBeenCalledWith('g1')
})

it("another place's window ending leaves this room alone (L2)", async () => {
  ;(apiClient.getChatMessages as jest.Mock).mockResolvedValue(served)
  await render(<GroupChat />)
  await flush()
  const reads = (apiClient.getChatMessages as jest.Mock).mock.calls.length
  await act(async () => mockEnded.forEach((f) => f({ eventId: 'another-day', reason: 'expired' })))
  await flush()
  expect((apiClient.getChatMessages as jest.Mock).mock.calls.length).toBe(reads)
})

it('"Go live again" opens the place from the room\'s own row when the place did not open it (M4)', async () => {
  ;(apiClient.getChatMessages as jest.Mock).mockResolvedValue(refused)
  await render(<GroupChat />)
  await flush()
  await act(async () => fireEvent.press(screen.getByLabelText('Go live again')))
  expect(router.push).toHaveBeenCalledWith('/venue/v1')
})

it('"Go live again" goes back to the place that opened the room', async () => {
  mockParams = { id: 'g1', venueId: 'v1' }
  ;(apiClient.getChatMessages as jest.Mock).mockResolvedValue(refused)
  await render(<GroupChat />)
  await flush()
  await act(async () => fireEvent.press(screen.getByLabelText('Go live again')))
  expect(router.back).toHaveBeenCalled()
  expect(router.push).not.toHaveBeenCalled()
})

it('never shows an exact count in a place room\'s header (H5)', async () => {
  ;(apiClient.getChatGroups as jest.Mock).mockResolvedValue({ success: true, data: { groups: [{ ...placeRow, memberCount: 3 }] } })
  ;(apiClient.getChatMessages as jest.Mock).mockResolvedValue(served)
  await render(<GroupChat />)
  await flush()
  expect(screen.queryByText(/in the room/)).toBeNull()
  expect(screen.getAllByText('Cubbon Park Bandstand').length).toBeGreaterThan(0)
})

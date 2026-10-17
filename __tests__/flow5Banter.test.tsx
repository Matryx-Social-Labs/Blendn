import React from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'

/**
 * The Banter (Flow 5 Banter frames, #27, R2-D2, R3-D5), rendered: its
 * sections, a request's note verbatim, a room's state as a chip, an
 * account's draft and unsent message as line 2 (and never another
 * account's), what opening a DM passes, and the empty, failed and
 * no-match states.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-router', () => {
  const React = require('react')
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
    useScrollToTop: () => {},
    // The screen is focused once, on mount.
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, [effect]),
  }
})
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn(), journey: jest.fn() } }))
jest.mock('../lib/perf', () => ({ ScreenProfiler: ({ children }: { children: React.ReactNode }) => children }))
const mockAuth: { user: { id: string }; loading: boolean } = { user: { id: 'u-a' }, loading: false }
jest.mock('../lib/useAuth', () => ({ useAuth: () => mockAuth }))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getChatGroups: jest.fn(),
    getConversations: jest.fn(),
    getMessageRequests: jest.fn(),
    markAllConversationsRead: jest.fn(),
    respondToMessageRequest: jest.fn(),
    getConversationMessages: jest.fn(),
  },
}))
jest.mock('../lib/crewsApi', () => ({ crewsApi: { myCrews: jest.fn(async () => ({ success: true, data: { crews: [], invites: [] } })) } }))
jest.mock('../lib/useBlends', () => ({ useBlends: () => ({ blends: [] }) }))
const mockDm: Array<(d: { conversationId: string; message: Record<string, unknown> }) => void> = []
const mockSync: { onSync?: () => unknown } = {}
jest.mock('../lib/socketClient', () => ({
  subscribeToChatMessage: () => () => {},
  subscribeToUserNotifications: (_user: string, cb: never) => {
    mockDm.push(cb)
    return () => {}
  },
}))
jest.mock('../lib/useLiveSync', () => ({
  useLiveSync: (o: { onSync: () => unknown }) => {
    mockSync.onSync = o.onSync
    return { state: 'connected', connected: true }
  },
}))
jest.mock('../lib/board', () => ({ ...jest.requireActual('../lib/board'), BOARD_ENABLED: false }))
jest.mock('../components/pulse/NotificationBell', () => ({ NotificationBell: () => null }))
jest.mock('../components/RealtimeStatusBanner', () => ({ __esModule: true, default: () => null }))
jest.mock('../components/board/BoardRequestsSection', () => ({ BoardRequestsSection: () => null }))
jest.mock('../components/OptimizedImage', () => ({ preloadImages: jest.fn() }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))

/* eslint-disable import/first */
import { router } from 'expo-router'
import Banter from '../app/(tabs)/chat'
import { apiClient } from '../lib/apiClient'
import { clearOutbox, dmThread, keepFailed, roomThread, setDraft } from '../lib/chatOutbox'
import { markDomainsDirty } from '../lib/liveSyncState'
import { queryCache } from '../lib/queryCache'
import { resetRoomMembership } from '../lib/roomMembership'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const at = '2026-10-15T19:00:00.000Z'
const liveRoom = { id: 'g-live', name: 'Vinyl Night', memberCount: 40, isCheckedIn: true, event: { id: 'e1', title: 'Vinyl Night' }, lastMessage: { content: 'Stage is open', createdAt: at, user: { id: 'u-c', name: 'Cosmic Panda' } } }
const pastRoom = { id: 'g-past', name: 'Jazz Brunch', memberCount: 12, isCheckedIn: false, status: 'locked', event: { id: 'e2', title: 'Jazz Brunch' }, lastMessage: { content: 'Thanks all', createdAt: at, user: { id: 'u-c', name: 'Cosmic Panda' } } }
const dm = { id: 'c1', otherUser: { id: 'u-m', name: 'Amber Fox', image: 'https://cdn.blendn.app/u/m.jpg' }, lastMessage: { content: 'See you there', createdAt: at, senderId: 'u-m' }, unreadCount: 1, theyRevealed: false }
const request = { id: 'r1', senderId: 'u-q', sender: { id: 'u-q', name: 'Quiet Otter' }, message: 'Loved your take on the set — coffee next week?', createdAt: at }

const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve()
  })
}
const open = async () => {
  await render(<Banter />)
  await flush()
}
const serve = ({ rooms = [liveRoom, pastRoom] as object[], dms = [dm], requests = [request] } = {}) => {
  api.getChatGroups.mockResolvedValue({ success: true, data: { groups: rooms } } as never)
  api.getConversations.mockResolvedValue({ success: true, data: dms } as never)
  api.getMessageRequests.mockResolvedValue({ success: true, data: { requests } } as never)
}

beforeEach(() => {
  jest.clearAllMocks()
  clearOutbox()
  resetRoomMembership()
  queryCache.invalidate('')
  mockAuth.user = { id: 'u-a' }
  serve()
})

it('draws Live now, Requests, People and Past rooms, with a request’s note verbatim', async () => {
  await open()
  for (const heading of ['Live now', 'Requests', 'People', 'Past rooms']) expect(screen.getAllByText(heading).length).toBeGreaterThan(0)
  expect(screen.getAllByText('Vinyl Night').length).toBeGreaterThan(0)
  expect(screen.getByText('Loved your take on the set — coffee next week?')).toBeTruthy()
  expect(screen.getByLabelText('Accept the request from Quiet Otter')).toBeTruthy()
  expect(screen.getByLabelText('Decline the request from Quiet Otter')).toBeTruthy()
})

it('says a locked room’s state as a chip, not as its last message', async () => {
  await open()
  expect(screen.getByText(/Locked by the organiser/)).toBeTruthy()
  expect(screen.queryByText(/Thanks all/)).toBeNull()
})

it('line 2 is your unsent message, then your draft — never another account’s', async () => {
  // An open room: a locked one says its state before anything of yours.
  serve({ rooms: [liveRoom, { ...pastRoom, status: 'open' }] })
  keepFailed(dmThread('c1', 'u-a'), [{ id: 'local-1' }])
  setDraft(roomThread('g-past', 'u-a'), 'see you at   ten')
  // The account before, on this phone: none of it is B's — or A's to see as B.
  setDraft(dmThread('c1', 'u-z'), 'somebody else’s draft')
  await open()
  expect(screen.getByText('Not sent · Tap to retry')).toBeTruthy()
  expect(screen.getByText(/see you at ten/)).toBeTruthy()
  expect(screen.queryByText(/somebody else’s draft/)).toBeNull()
})

it('shows B none of A’s drafts or unsent messages', async () => {
  keepFailed(dmThread('c1', 'u-a'), [{ id: 'local-1' }])
  setDraft(roomThread('g-past', 'u-a'), 'A’s draft')
  mockAuth.user = { id: 'u-b' }
  await open()
  expect(screen.queryByText('Not sent · Tap to retry')).toBeNull()
  expect(screen.queryByText(/A’s draft/)).toBeNull()
})

it('opens a DM by its ids and name only: no photo URL rides in the route', async () => {
  await open()
  await act(async () => fireEvent.press(screen.getByTestId('banter-row-p:c1')))
  const pushed = (router.push as jest.Mock).mock.calls.at(-1)?.[0]
  expect(pushed.pathname).toBe('/private-chat/[conversationId]')
  expect(pushed.params).toEqual({ conversationId: 'c1', otherUserName: 'Amber Fox', otherUserId: 'u-m' })
})

it('empty: no conversations yet, and a way to find some', async () => {
  serve({ rooms: [], dms: [], requests: [] })
  await open()
  expect(screen.getByText('No conversations yet')).toBeTruthy()
  expect(screen.getByLabelText('Explore events')).toBeTruthy()
})

it('failed: says so and offers to try again', async () => {
  api.getChatGroups.mockResolvedValue({ success: false, error: 'Network request failed' } as never)
  api.getConversations.mockResolvedValue({ success: false, error: 'Network request failed' } as never)
  await open()
  expect(screen.getByText('Couldn’t load your chats')).toBeTruthy()
})

it('a search with nothing says what it searched for, and clears', async () => {
  await open()
  await act(async () => fireEvent.press(screen.getByLabelText('Search conversations')))
  await act(async () => fireEvent.changeText(screen.getByTestId('banter-search'), 'zzz'))
  expect(screen.getByText('No chats match “zzz”')).toBeTruthy()
  // The state's action, not the field's own clear button.
  await act(async () => fireEvent.press(within(screen.getByTestId('banter-no-match')).getByLabelText('Clear search')))
  expect(screen.queryByText('No chats match “zzz”')).toBeNull()
})

describe('a DM that lands while the Banter is open', () => {
  it('shows at once, and a dirty sync never puts the stale list back', async () => {
    // Arrange: the list is loaded (and cached); then a message lands on the socket.
    await open()
    const fresh = { ...dm, lastMessage: { content: 'On my way up', createdAt: '2026-10-15T19:30:00.000Z', senderId: 'u-m' }, unreadCount: 2 }
    // The SWR copy still holds the old list; only a forced fetch has the new one.
    api.getConversations.mockImplementation((async (o?: { force?: boolean }) => ({ success: true, data: o?.force ? [fresh] : [dm] })) as never)
    // Act
    await act(async () => {
      mockDm.forEach((cb) => cb({ conversationId: 'c1', message: { id: 'm2', senderId: 'u-m', text: 'On my way up', createdAt: '2026-10-15T19:30:00.000Z' } }))
    })
    expect(screen.getByText(/On my way up/)).toBeTruthy()
    markDomainsDirty(['chat'])
    await act(async () => {
      await mockSync.onSync?.()
    })
    await flush()
    // Assert
    expect(screen.getByText(/On my way up/)).toBeTruthy()
    expect(api.getConversations).toHaveBeenLastCalledWith({ force: true })
  })
})

describe('a lift after a hold opens nothing (drive 2, Android)', () => {
  it('a rested finger coming up does not open the row; a tap still does', async () => {
    await open()
    const list = screen.getByTestId('banter-list')
    const now = jest.spyOn(Date, 'now')
    // A hold: the finger rests 600 ms, then comes up on the row.
    now.mockReturnValue(1_000)
    await act(async () => fireEvent(list, 'touchStart'))
    now.mockReturnValue(1_600)
    await act(async () => fireEvent.press(screen.getByTestId('banter-row-p:c1')))
    expect(router.push).not.toHaveBeenCalled()
    // A tap: down and up within a moment.
    await act(async () => fireEvent(list, 'touchEnd'))
    await act(async () => fireEvent(list, 'touchStart'))
    now.mockReturnValue(1_700)
    await act(async () => fireEvent.press(screen.getByTestId('banter-row-p:c1')))
    expect(router.push).toHaveBeenCalled()
    now.mockRestore()
  })
})

describe('a finger resting on the Live now card holds the order (drive 5, Android)', () => {
  it('a DM 5 s into the hold raises "↑ New" without moving a row, and the lift opens nothing', async () => {
    const { Platform } = require('react-native')
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
    jest.useFakeTimers({ now: 1_000 })
    const sneha = { ...dm, id: 'c2', otherUser: { id: 'u-s', name: 'Sneha Pillai', image: 'https://cdn.blendn.app/u/s.jpg' }, lastMessage: { content: 'hi', createdAt: '2026-10-15T18:00:00.000Z', senderId: 'u-s' }, unreadCount: 0 }
    serve({ dms: [dm, sneha] })
    await open()
    const rows = () => screen.getAllByTestId(/^banter-row-p:/).map((r) => r.props.testID)
    expect(rows()).toEqual(['banter-row-p:c1', 'banter-row-p:c2'])
    // Android's order: the finger comes down on the Live now card (the list hears it) and rests; no drag, no lift.
    await act(async () => fireEvent(screen.getAllByText('Vinyl Night')[0], 'touchStart'))
    await act(async () => jest.advanceTimersByTime(5_000))
    // Sneha writes: her row would move up.
    await act(async () => {
      mockDm.forEach((cb) => cb({ conversationId: 'c2', message: { id: 'm9', senderId: 'u-s', text: 'drive5 android held', createdAt: '2026-10-15T19:45:00.000Z' } }))
    })
    await flush()
    expect(rows()).toEqual(['banter-row-p:c1', 'banter-row-p:c2'])
    expect(screen.getByRole('button', { name: 'New messages above' })).toBeTruthy()
    // The finger comes up on Sneha's row: a release after a hold opens nothing.
    await act(async () => fireEvent.press(screen.getByTestId('banter-row-p:c2')))
    await act(async () => fireEvent(screen.getByTestId('banter-list'), 'touchEnd'))
    expect(router.push).not.toHaveBeenCalled()
    // And on lift the rows settle.
    await act(async () => jest.advanceTimersByTime(300))
    expect(rows()).toEqual(['banter-row-p:c2', 'banter-row-p:c1'])
    jest.useRealTimers()
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
  })
})

describe('one press guard for everything in the list (drive 6: the Live now card opened its room after a hold)', () => {
  it('a hold on the Live now card, then the lift, opens nothing; a tap opens it', async () => {
    await open()
    const list = screen.getByTestId('banter-list')
    const card = screen.getByTestId('banter-live-g-live')
    const now = jest.spyOn(Date, 'now')
    // A hold: the finger rests 600 ms on the card, then comes up on it.
    now.mockReturnValue(10_000)
    await act(async () => fireEvent(card, 'touchStart'))
    now.mockReturnValue(10_600)
    await act(async () => fireEvent.press(card))
    expect(router.push).not.toHaveBeenCalled()
    await act(async () => fireEvent(list, 'touchEnd'))
    // A tap: down and up within a moment.
    await act(async () => fireEvent(card, 'touchStart'))
    now.mockReturnValue(10_700)
    await act(async () => fireEvent.press(card))
    expect(router.push).toHaveBeenCalled()
    now.mockRestore()
  })
})

/**
 * The Message requests page (M3, SCRUM-760): every message request waiting, in one windowed list, a page at a time as the end
 * comes near, and where they are answered. None of the Banter's chats load, and no crew invites: since requests placement A
 * (owner 2026-11-15) those are answered in Notifications and on Crews.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('expo-router', () => {
  const React = require('react')
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
    useScrollToTop: () => {},
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, [effect]),
  }
})
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
const mockInvites: { crewId: string; name: string; invitedBy: string; invitedAt: string; emblemSeed: string }[] = []
jest.mock('../lib/crewsApi', () => ({
  crewMessage: () => 'failed',
  crewsApi: {
    myCrews: jest.fn(async () => ({ success: true, data: { crews: [], invites: mockInvites } })),
    blends: jest.fn(async () => ({ success: true, data: { blends: [] } })),
    decline: jest.fn(),
  },
}))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn(), journey: jest.fn() } }))
// One user object: the inbox reloads when the user changes identity.
const mockAuth = { user: { id: 'u-a' }, loading: false }
jest.mock('../lib/useAuth', () => ({ useAuth: () => mockAuth }))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getChatGroups: jest.fn(),
    getConversations: jest.fn(),
    getMessageRequests: jest.fn(),
    respondToMessageRequest: jest.fn(),
    queuedRequest: jest.fn(),
  },
}))
jest.mock('../lib/socketClient', () => ({ subscribeToChatMessage: () => () => {}, subscribeToUserNotifications: () => () => {} }))
jest.mock('../lib/useLiveSync', () => ({ useLiveSync: () => ({ state: 'connected', connected: true }) }))
jest.mock('../components/OptimizedImage', () => ({ preloadImages: jest.fn() }))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))

/* eslint-disable import/first */
import MessageRequests from '../app/message-requests'
import { BanterRequestsRow } from '../components/banter/BanterRequestsRow'
import { apiClient } from '../lib/apiClient'
import { queryCache } from '../lib/queryCache'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const rs = (from: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `r${from + i}`, senderId: `s${from + i}`, sender: { id: `s${from + i}`, name: `Asker ${from + i}` }, message: `hello ${from + i}`, createdAt: '2026-10-15T19:00:00.000Z' }))
const flush = async () =>
  act(async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve()
  })

beforeEach(() => {
  jest.clearAllMocks()
  queryCache.invalidate('')
})

it('draws the requests the first page brought, windowed, and says the true total', async () => {
  api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: rs(0, 20), totalCount: 140 } } as never)
  await render(<MessageRequests />)
  await flush()
  expect(screen.getByText('140 waiting')).toBeTruthy()
  const drawn = screen.getAllByLabelText(/^Accept the request from/).length
  expect(drawn).toBeGreaterThan(0)
  expect(drawn).toBeLessThan(20)
})

// SCRUM-1059 A: at the largest text "Message requests" and "12,480 waiting" grow the bar past its fixed height; the list
// starts 8 under the bar as it is drawn, and its indicator below it.
it('starts the list 8 under the bar as tall as it draws; a bar no taller than the fixed one changes nothing (control)', async () => {
  api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: rs(0, 2), totalCount: 12480 } } as never)
  const view = await render(<MessageRequests />)
  await flush()
  const list = () => view.getByTestId('requests-list').props
  const top = () => StyleSheet.flatten(list().contentContainerStyle).paddingTop as number
  const fixed = top()
  const layout = (height: number) => fireEvent(view.getByTestId('requests-top'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 402, height } } })
  await layout(40)
  expect(top()).toBe(fixed)
  await layout(160)
  expect(top()).toBe(160 + 8)
  expect(list().scrollIndicatorInsets.top).toBe(160)
})

it('asks for the next page by offset as the end comes near, appended once, and stops at the total', async () => {
  api.getMessageRequests.mockResolvedValueOnce({ success: true, data: { requests: rs(0, 20), totalCount: 30 } } as never)
  await render(<MessageRequests />)
  await flush()
  api.getMessageRequests.mockResolvedValueOnce({ success: true, data: { requests: rs(20, 10), totalCount: 30 } } as never)
  await act(async () => fireEvent(screen.getByTestId('requests-list'), 'endReached'))
  await flush()
  expect(api.getMessageRequests).toHaveBeenLastCalledWith({ status: 'pending', offset: 20 }, { force: true })
  api.getMessageRequests.mockClear()
  await act(async () => fireEvent(screen.getByTestId('requests-list'), 'endReached'))
  expect(api.getMessageRequests).not.toHaveBeenCalled()
})

it('loads nothing of the Banter but the requests', async () => {
  api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: rs(0, 2), totalCount: 2 } } as never)
  await render(<MessageRequests />)
  await flush()
  expect(api.getChatGroups).not.toHaveBeenCalled()
  expect(api.getConversations).not.toHaveBeenCalled()
})

it('an empty screen says so, in the board’s words (04 · A)', async () => {
  api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: [], totalCount: 0 } } as never)
  await render(<MessageRequests />)
  await flush()
  expect(screen.getByText('No message requests')).toBeTruthy()
  expect(screen.getByText('Somebody you met who asks to message you shows up here.')).toBeTruthy()
})

// Requests placement A: Banter's count is message requests only. Today's page added the crew invites (72 = 60 + 12).
it('holds message requests only: crew invites waiting are neither drawn nor counted, nor read', async () => {
  const { crewsApi } = jest.requireMock('../lib/crewsApi')
  mockInvites.splice(0, mockInvites.length, { crewId: 'c1', name: 'Run Club', invitedBy: 'Asha', invitedAt: '2026-01-01T00:00:00Z', emblemSeed: 's' })
  try {
    api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: rs(0, 2), totalCount: 2 } } as never)
    await render(<MessageRequests />)
    await flush()
    expect(screen.getByText('Message requests')).toBeTruthy()
    expect(screen.getByText('2 waiting')).toBeTruthy()
    expect(screen.queryByText('Asha invited you to the crew')).toBeNull()
    expect(crewsApi.myCrews).not.toHaveBeenCalled()
  } finally {
    mockInvites.splice(0, mockInvites.length)
  }
})

it('the Banter row says Message requests and the message requests’ count', async () => {
  await render(<BanterRequestsRow requests={[]} total={60} />)
  expect(screen.getByLabelText('Message requests, 60')).toBeTruthy()
  expect(screen.getByText('Message requests')).toBeTruthy()
  expect(screen.queryByText('Requests')).toBeNull()
  expect(screen.queryByLabelText('0 people here')).toBeNull()
})

it('draws a request with its note verbatim, and both answers', async () => {
  api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: rs(0, 1), totalCount: 1 } } as never)
  await render(<MessageRequests />)
  await flush()
  expect(screen.getByText('hello 0')).toBeTruthy()
  expect(screen.getByLabelText('Accept the request from Asker 0')).toBeTruthy()
  expect(screen.getByLabelText('Decline the request from Asker 0')).toBeTruthy()
})

it('says where you met on its own line when the server knows, and nothing when it does not (Flow 5 · B-A rq, admin #935)', async () => {
  const [met, unknown] = rs(0, 2)
  // An earlier test's unconsumed once-answers would arrive first: start from none.
  api.getMessageRequests.mockReset()
  mockInvites.length = 0
  api.getMessageRequests.mockResolvedValue({
    success: true,
    data: { requests: [{ ...met, metIn: { kind: 'event', name: 'Bengaluru Design Festival 2026' } }, { ...unknown, metIn: null }], totalCount: 2 },
  } as never)
  await render(<MessageRequests />)
  await flush()
  expect(screen.getByText('Met in the room at Bengaluru Design Festival 2026')).toBeTruthy()
  expect(screen.getAllByText(/^Met in the room at/)).toHaveLength(1)
  // A screen reader hears it between the name and the note.
  expect(screen.getByLabelText('Asker 0. Met in the room at Bengaluru Design Festival 2026. hello 0')).toBeTruthy()
  expect(screen.getByLabelText('Asker 1. hello 1')).toBeTruthy()
})

it('a failed requests read offers a retry, never "No message requests"', async () => {
  api.getMessageRequests.mockResolvedValue({ success: false, error: 'offline' } as never)
  await render(<MessageRequests />)
  await flush()
  expect(screen.queryByText('No message requests')).toBeNull()
  expect(screen.getByTestId('requests-failed')).toBeTruthy()
  api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: rs(0, 1), totalCount: 1 } } as never)
  await act(async () => fireEvent.press(screen.getByLabelText('Try again')))
  await flush()
  expect(screen.getByText('hello 0')).toBeTruthy()
  expect(screen.queryByTestId('requests-failed')).toBeNull()
})

it('answering keeps the older pages: the list does not start over', async () => {
  api.getMessageRequests.mockResolvedValueOnce({ success: true, data: { requests: rs(0, 20), totalCount: 30 } } as never)
  await render(<MessageRequests />)
  await flush()
  api.getMessageRequests.mockResolvedValueOnce({ success: true, data: { requests: rs(20, 10), totalCount: 30 } } as never)
  await act(async () => fireEvent(screen.getByTestId('requests-list'), 'endReached'))
  await flush()
  expect(screen.queryByTestId('requests-more')).toBeNull()
  api.respondToMessageRequest.mockResolvedValue({ success: true, data: {} } as never)
  api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: rs(1, 20), totalCount: 29 } } as never)
  await act(async () => fireEvent.press(screen.getByLabelText('Decline the request from Asker 0')))
  await flush()
  // A reset would hold the 20 of 29 again and offer the rest as more.
  expect(screen.queryByTestId('requests-more')).toBeNull()
})

it('a repaint from the cache brings the true total with it, so the count cannot outlive an answer', async () => {
  api.getMessageRequests.mockResolvedValueOnce({ success: true, data: { requests: rs(0, 2), totalCount: 7 } } as never)
  const first = await render(<MessageRequests />)
  await flush()
  first.unmount()
  api.getMessageRequests.mockImplementation(() => new Promise(() => {}) as never)
  await render(<MessageRequests />)
  await flush()
  expect(screen.getByText('7 waiting')).toBeTruthy()
})

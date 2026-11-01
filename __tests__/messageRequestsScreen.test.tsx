/**
 * "See all" requests (M3, SCRUM-760): every message request waiting, in a windowed list, a page at a time by offset as the
 * end comes near, with the same cards and answers as the Banter's strip. Nothing else of the Banter loads.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'

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
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))

/* eslint-disable import/first */
import MessageRequests from '../app/message-requests'
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

it('an empty screen says so', async () => {
  api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: [], totalCount: 0 } } as never)
  await render(<MessageRequests />)
  await flush()
  expect(screen.getByText('No requests waiting')).toBeTruthy()
})

it('a crew invite is answered here too, since the Banter now only counts it', async () => {
  mockInvites.splice(0, mockInvites.length, { crewId: 'c1', name: 'Run Club', invitedBy: 'Asha', invitedAt: '2026-01-01T00:00:00Z', emblemSeed: 's' })
  try {
    api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: [], totalCount: 0 } } as never)
    await render(<MessageRequests />)
    await flush()
    expect(screen.getByText('Asha invited you to the crew')).toBeTruthy()
    expect(screen.queryByText('No requests waiting')).toBeNull()
  } finally {
    mockInvites.splice(0, mockInvites.length)
  }
})

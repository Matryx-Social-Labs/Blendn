/**
 * The Requests page (M3, SCRUM-760): every message request and crew invite waiting, in one windowed list, a page at a time as
 * the end comes near, and where they are answered. None of the Banter's chats load.
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

const invitesOf = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ crewId: `c${i}`, name: `Crew ${i}`, invitedBy: 'Asha', invitedAt: '2026-01-01T00:00:00Z', emblemSeed: 's' }))

it('54 crew invites are windowed with the requests, not all drawn in a header', async () => {
  mockInvites.splice(0, mockInvites.length, ...invitesOf(54))
  try {
    api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: [], totalCount: 0 } } as never)
    await render(<MessageRequests />)
    await flush()
    expect(screen.getByText('54 waiting')).toBeTruthy()
    const drawn = screen.getAllByText('Asha invited you to the crew').length
    expect(drawn).toBeGreaterThan(0)
    expect(drawn).toBeLessThan(54)
  } finally {
    mockInvites.splice(0, mockInvites.length)
  }
})

it('says nothing is waiting only once the invites have answered too', async () => {
  const { crewsApi } = jest.requireMock('../lib/crewsApi')
  let answer: (v: unknown) => void = () => {}
  crewsApi.myCrews.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
  api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: [], totalCount: 0 } } as never)
  await render(<MessageRequests />)
  await flush()
  expect(screen.queryByText('No requests waiting')).toBeNull()
  await act(async () => answer({ success: true, data: { crews: [], invites: [] } }))
  await flush()
  expect(screen.getByText('No requests waiting')).toBeTruthy()
})

it('the Banter row with invites only draws no empty face stack', async () => {
  await render(<BanterRequestsRow requests={[]} total={54} />)
  expect(screen.getByLabelText('Requests, 54')).toBeTruthy()
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

it('declining an invite asks first, then it leaves and the count follows', async () => {
  const { crewsApi } = jest.requireMock('../lib/crewsApi')
  const { showSheet } = jest.requireMock('../lib/sheet')
  mockInvites.splice(0, mockInvites.length, ...invitesOf(2))
  try {
    crewsApi.decline.mockResolvedValue({ success: true })
    api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: [], totalCount: 0 } } as never)
    await render(<MessageRequests />)
    await flush()
    await act(async () => fireEvent.press(screen.getAllByLabelText(/^Decline/)[0]))
    const sheet = showSheet.mock.calls[0][0]
    expect(crewsApi.decline).not.toHaveBeenCalled()
    await act(async () => sheet.actions[0].then())
    await flush()
    expect(crewsApi.decline).toHaveBeenCalledWith('c0')
    expect(screen.getByText('1 waiting')).toBeTruthy()
  } finally {
    mockInvites.splice(0, mockInvites.length)
  }
})

it('a failed requests read offers a retry, never "No requests waiting"', async () => {
  api.getMessageRequests.mockResolvedValue({ success: false, error: 'offline' } as never)
  await render(<MessageRequests />)
  await flush()
  expect(screen.queryByText('No requests waiting')).toBeNull()
  expect(screen.getByTestId('requests-failed')).toBeTruthy()
  api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: rs(0, 1), totalCount: 1 } } as never)
  await act(async () => fireEvent.press(screen.getByLabelText('Try again')))
  await flush()
  expect(screen.getByText('hello 0')).toBeTruthy()
  expect(screen.queryByTestId('requests-failed')).toBeNull()
})

it('a failed invites read with requests drawn says the list is partial', async () => {
  const { crewsApi } = jest.requireMock('../lib/crewsApi')
  crewsApi.myCrews.mockResolvedValueOnce({ success: false, error: 'offline' })
  api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: rs(0, 1), totalCount: 1 } } as never)
  await render(<MessageRequests />)
  await flush()
  expect(screen.getByText('hello 0')).toBeTruthy()
  expect(screen.getByTestId('requests-failed')).toBeTruthy()
})

it('pages the invites by cursor before the requests, and counts from the server total', async () => {
  const { crewsApi } = jest.requireMock('../lib/crewsApi')
  crewsApi.myCrews.mockResolvedValueOnce({ success: true, data: { crews: [], invites: invitesOf(2), invitesPagination: { limit: 2, hasMore: true, nextCursor: 'next', totalCount: 120 } } })
  api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: rs(0, 1), totalCount: 1 } } as never)
  await render(<MessageRequests />)
  await flush()
  expect(screen.getByText('121 waiting')).toBeTruthy()
  api.getMessageRequests.mockClear()
  crewsApi.myCrews.mockResolvedValueOnce({ success: true, data: { crews: [], invites: [{ ...invitesOf(1)[0], crewId: 'c9' }], invitesPagination: { limit: 2, hasMore: false, nextCursor: null, totalCount: 3 } } })
  await act(async () => fireEvent(screen.getByTestId('requests-list'), 'endReached'))
  await flush()
  expect(crewsApi.myCrews).toHaveBeenLastCalledWith('next')
  expect(api.getMessageRequests).not.toHaveBeenCalled()
  expect(screen.getByText('4 waiting')).toBeTruthy()
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

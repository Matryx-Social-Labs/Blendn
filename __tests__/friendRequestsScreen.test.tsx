/**
 * The Requests list the Me tab and Friends open, against a mocked API.
 *
 * Accept answers this request and takes it off the list; a list that did not
 * load says so and can be tried again, rather than claiming there are none.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockAsk = jest.fn()
jest.mock('../lib/friendsSeeMeAsk', () => ({ askFriendsSeeMe: (...a: unknown[]) => mockAsk(...a), useStillHere: () => () => true }))
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = require('react')
    useEffect(effect, [effect])
  },
}))
jest.mock('react-native-safe-area-context', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    SafeAreaView: (p: object) => React.createElement(View, p),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }
})
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getFriendRequests: jest.fn(),
    respondToFriendRequest: jest.fn(),
    withdrawFriendRequest: jest.fn(),
  },
}))
// The bell's socket event: a row landed in your notifications (`notification:new`, with its kind).
let mockBell: ((data: { kind: string }) => void) | null = null
jest.mock('../lib/socketClient', () => ({
  subscribeToBell: (cb: (data: { kind: string }) => void) => {
    mockBell = cb
    return () => {
      if (mockBell === cb) mockBell = null
    }
  },
}))
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
jest.mock('../components/OptimizedImage', () => {
  const React = require('react')
  const { View } = require('react-native')
  return { OptimizedImage: () => React.createElement(View) }
})

import { apiClient } from '../lib/apiClient'
import FriendRequestsScreen, { requestsWaiting } from '../app/friends/requests'
import { resetFriendRequests, useFriendRequestsState } from '../lib/friendRequests'
import { RequestsRow } from '../components/friends/RequestsRow'

const api = apiClient as jest.Mocked<typeof apiClient>
const BEN = { id: 'req-ben', person: { userId: 'u_ben', name: 'Ben', photo: null }, createdAt: '2026-09-27T20:00:00Z' }

beforeEach(() => {
  jest.clearAllMocks()
  // The list is one store for every surface (requests placement A): each test starts from nothing.
  resetFriendRequests()
})

it('accepts from the list', async () => {
  api.getFriendRequests.mockResolvedValue({ success: true, data: { incoming: [BEN], outgoing: [] } })
  api.respondToFriendRequest.mockResolvedValue({ success: true, data: { state: 'friends' } })
  await render(<FriendRequestsScreen />)

  fireEvent.press(await screen.findByLabelText('Accept Ben'))

  await waitFor(() => expect(api.respondToFriendRequest).toHaveBeenCalledWith('req-ben', 'accept'))
  expect(await screen.findByText('No friend requests')).toBeTruthy()
  expect(mockShowToast).toHaveBeenCalledWith('You and Ben are friends', 'success', { haptic: 'success' })
  expect(mockAsk).toHaveBeenCalledWith({ stillHere: expect.any(Function) })
})

/*
 * An answer clears everywhere (#554, one shared list): the Friends list's requests row and the Me Friends row read the same store
 * as this screen, so the faces and the count drop the person the moment they are answered, with no reload. Negative control: a
 * screen-local list (the answer removed only from this screen's rows) leaves the probe at 2.
 */
it('an answer here clears the person from the row on Friends and Me, with no reload', async () => {
  const ANA = { id: 'req-ana', person: { userId: 'u_ana', name: 'Ana', photo: null }, createdAt: '2026-09-27T21:00:00Z' }
  api.getFriendRequests.mockResolvedValue({ success: true, data: { incoming: [BEN, ANA], outgoing: [], pagination: { incoming: { totalCount: 2 }, outgoing: { totalCount: 0 } } } } as never)
  api.respondToFriendRequest.mockResolvedValue({ success: true, data: { state: 'friends' } })
  function Elsewhere() {
    const { incoming } = useFriendRequestsState()
    return <RequestsRow count={incoming.total} faces={incoming.items.map((r) => r.person)} />
  }
  await render(
    <>
      <Elsewhere />
      <FriendRequestsScreen />
    </>
  )
  await waitFor(() => expect(screen.getByLabelText('2 friend requests')).toBeTruthy())
  fireEvent.press(await screen.findByLabelText('Accept Ben'))
  await waitFor(() => expect(screen.getByLabelText('1 friend request')).toBeTruthy())
  api.getFriendRequests.mockClear()
  fireEvent.press(screen.getByLabelText('Not now, Ana'))
  await waitFor(() => expect(screen.queryByTestId('requests-row')).toBeTruthy())
  await waitFor(() => expect(screen.getByLabelText('0 friend requests')).toBeTruthy())
  expect(api.getFriendRequests).not.toHaveBeenCalled()
})

// SCRUM-754: an answer that throws (the queue cleared under it, a client bug) ends the spinner with the line and can be sent again.
// Control: without the catch in `once`, no toast is shown and the rejection is unhandled.
it('says so when an answer throws, and the request can be answered again', async () => {
  api.getFriendRequests.mockResolvedValue({ success: true, data: { incoming: [BEN], outgoing: [] } })
  api.respondToFriendRequest.mockRejectedValueOnce(new Error('Request queue cleared'))
  await render(<FriendRequestsScreen />)

  fireEvent.press(await screen.findByLabelText('Not now, Ben'))

  await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('That didn’t go through. Try again.', 'error', { haptic: 'error' }))
  api.respondToFriendRequest.mockResolvedValueOnce({ success: true, data: { dismissed: true } })
  fireEvent.press(screen.getByLabelText('Not now, Ben'))
  await waitFor(() => expect(api.respondToFriendRequest).toHaveBeenCalledTimes(2))
  expect(await screen.findByText('No friend requests')).toBeTruthy()
})

it('does not call a failed load "No friend requests"', async () => {
  api.getFriendRequests.mockResolvedValueOnce({ success: false, error: 'No internet connection.' })
  await render(<FriendRequestsScreen />)

  expect(await screen.findByText("Your requests didn’t load")).toBeTruthy()
  expect(screen.queryByText('No friend requests')).toBeNull()

  api.getFriendRequests.mockResolvedValueOnce({ success: true, data: { incoming: [BEN], outgoing: [] } })
  fireEvent.press(screen.getByText('Try again'))
  expect(await screen.findByLabelText('Accept Ben')).toBeTruthy()
})

// D-LM2: the title says how many are waiting, the server's count, not the rows loaded. Negative control: no `sub` fails it.
it('says how many are waiting under the title: the server’s count, not the page', async () => {
  api.getFriendRequests.mockResolvedValue({
    success: true,
    data: { incoming: [BEN], outgoing: [], pagination: { incoming: { totalCount: 60, hasMore: true, nextCursor: 'c1' }, outgoing: { totalCount: 0 } } },
  } as never)
  await render(<FriendRequestsScreen />)
  expect(await screen.findByText('60 waiting')).toBeTruthy()
  expect(requestsWaiting(1204)).toBe('1,204 waiting')
})

/*
 * SCRUM-1036: the list was read on focus only, so a request that arrived while it was open showed "No friend requests" until it
 * was opened again. A new request lands in your bell (the same socket event the Notifications feed reads): read again.
 */
describe('a request that arrives while the list is open (SCRUM-1036)', () => {
  it('shows up without leaving the screen', async () => {
    api.getFriendRequests.mockResolvedValueOnce({ success: true, data: { incoming: [], outgoing: [] } })
    await render(<FriendRequestsScreen />)
    expect(await screen.findByText('No friend requests')).toBeTruthy()

    api.getFriendRequests.mockResolvedValueOnce({ success: true, data: { incoming: [BEN], outgoing: [] } })
    await act(async () => mockBell?.({ kind: 'friend_request' }))

    expect(await screen.findByLabelText('Accept Ben')).toBeTruthy()
    expect(screen.queryByText('No friend requests')).toBeNull()
  })

  // Control: a bell row of any other kind is not a request, and is not a reason to read the list again.
  it('does not read the list again for a row of another kind', async () => {
    api.getFriendRequests.mockResolvedValue({ success: true, data: { incoming: [], outgoing: [] } })
    await render(<FriendRequestsScreen />)
    expect(await screen.findByText('No friend requests')).toBeTruthy()
    await act(async () => mockBell?.({ kind: 'match' }))
    expect(api.getFriendRequests).toHaveBeenCalledTimes(1)
  })

  it('stops listening when the screen goes', async () => {
    api.getFriendRequests.mockResolvedValue({ success: true, data: { incoming: [], outgoing: [] } })
    await render(<FriendRequestsScreen />)
    expect(mockBell).not.toBeNull()
    await screen.unmount()
    expect(mockBell).toBeNull()
  })
})

/**
 * The Requests list the Me tab and Friends open, against a mocked API.
 *
 * Accept answers this request and takes it off the list; a list that did not
 * load says so and can be tried again, rather than claiming there are none.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

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
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
jest.mock('../components/OptimizedImage', () => {
  const React = require('react')
  const { View } = require('react-native')
  return { OptimizedImage: () => React.createElement(View) }
})

import { apiClient } from '../lib/apiClient'
import FriendRequestsScreen from '../app/friends/requests'

const api = apiClient as jest.Mocked<typeof apiClient>
const BEN = { id: 'req-ben', person: { userId: 'u_ben', name: 'Ben', photo: null }, createdAt: '2026-09-27T20:00:00Z' }

beforeEach(() => jest.clearAllMocks())

it('accepts from the list', async () => {
  api.getFriendRequests.mockResolvedValue({ success: true, data: { incoming: [BEN], outgoing: [] } })
  api.respondToFriendRequest.mockResolvedValue({ success: true, data: { state: 'friends' } })
  await render(<FriendRequestsScreen />)

  fireEvent.press(await screen.findByLabelText('Accept Ben'))

  await waitFor(() => expect(api.respondToFriendRequest).toHaveBeenCalledWith('req-ben', 'accept'))
  expect(await screen.findByText('No requests')).toBeTruthy()
  expect(mockShowToast).toHaveBeenCalledWith('You and Ben are friends', 'success')
})

it('does not call a failed load "No requests"', async () => {
  api.getFriendRequests.mockResolvedValueOnce({ success: false, error: 'No internet connection.' })
  await render(<FriendRequestsScreen />)

  expect(await screen.findByText("Your requests didn't load")).toBeTruthy()
  expect(screen.queryByText('No requests')).toBeNull()

  api.getFriendRequests.mockResolvedValueOnce({ success: true, data: { incoming: [BEN], outgoing: [] } })
  fireEvent.press(screen.getByText('Try again'))
  expect(await screen.findByLabelText('Accept Ben')).toBeTruthy()
})

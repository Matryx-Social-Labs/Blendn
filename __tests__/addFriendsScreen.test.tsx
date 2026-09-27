/**
 * Add friends — the requests either way, against a mocked API.
 *
 * Behavioural, because every button here is a decision about which request
 * and which verb: Accept and Not now must answer THIS request with the right
 * action and take only it off the list; Withdraw must take back only yours;
 * a failure must leave the row where it was; and a second tap while the first
 * is in flight must not send a second answer.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

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
    getFriendInvite: jest.fn(),
    resetFriendInvite: jest.fn(),
    getFriendRequests: jest.fn(),
    respondToFriendRequest: jest.fn(),
    withdrawFriendRequest: jest.fn(),
  },
}))
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
// ProfileSections pulls expo-video in through the hero; only the heading is used here.
jest.mock('../components/profile/ProfileSections', () => {
  const React = require('react')
  const { Text } = require('react-native')
  return { ProfileHeading: (p: { title: string }) => React.createElement(Text, null, p.title) }
})
jest.mock('../components/OptimizedImage', () => {
  const React = require('react')
  const { View } = require('react-native')
  return { OptimizedImage: () => React.createElement(View) }
})

import { apiClient } from '../lib/apiClient'
import AddFriendsScreen from '../app/friends/add'

const api = apiClient as jest.Mocked<typeof apiClient>
const person = (userId: string, name: string) => ({ userId, name, photo: null })
const BEN = { id: 'req-ben', person: person('u_ben', 'Ben'), createdAt: '2026-09-27T20:00:00Z' }
const CAM = { id: 'req-cam', person: person('u_cam', 'Cam'), createdAt: '2026-09-27T20:00:00Z' }
const DEE = { id: 'req-dee', person: person('u_dee', 'Dee'), createdAt: '2026-09-27T20:00:00Z' }

beforeEach(() => {
  jest.clearAllMocks()
  api.getFriendInvite.mockResolvedValue({
    success: true,
    data: { token: 'abcdefghijklmnopqrstuv', url: 'https://www.blendn.app/f/abcdefghijklmnopqrstuv' },
  })
  api.getFriendRequests.mockResolvedValue({ success: true, data: { incoming: [BEN, CAM], outgoing: [DEE] } })
})

it('accepts exactly the request tapped, and takes only it off the list', async () => {
  api.respondToFriendRequest.mockResolvedValue({ success: true, data: { state: 'friends' } })
  await render(<AddFriendsScreen />)

  fireEvent.press(await screen.findByLabelText('Accept Ben'))

  await waitFor(() => expect(api.respondToFriendRequest).toHaveBeenCalledWith('req-ben', 'accept'))
  await waitFor(() => expect(screen.queryByLabelText('Accept Ben')).toBeNull())
  expect(screen.getByLabelText('Accept Cam')).toBeTruthy()
  expect(mockShowToast).toHaveBeenCalledWith('You and Ben are friends', 'success')
})

it('"Not now" dismisses, quietly', async () => {
  api.respondToFriendRequest.mockResolvedValue({ success: true, data: { dismissed: true } })
  await render(<AddFriendsScreen />)

  fireEvent.press(await screen.findByLabelText('Not now, Cam'))

  await waitFor(() => expect(api.respondToFriendRequest).toHaveBeenCalledWith('req-cam', 'dismiss'))
  await waitFor(() => expect(screen.queryByLabelText('Not now, Cam')).toBeNull())
  expect(mockShowToast).not.toHaveBeenCalled()
})

it('withdraws only your own request', async () => {
  api.withdrawFriendRequest.mockResolvedValue({ success: true, data: { withdrawn: true } })
  await render(<AddFriendsScreen />)

  fireEvent.press(await screen.findByLabelText('Withdraw request to Dee'))

  await waitFor(() => expect(api.withdrawFriendRequest).toHaveBeenCalledWith('req-dee'))
  await waitFor(() => expect(screen.queryByLabelText('Withdraw request to Dee')).toBeNull())
  expect(screen.getByLabelText('Accept Ben')).toBeTruthy()
})

it('keeps the row and says so when the answer fails', async () => {
  api.respondToFriendRequest.mockResolvedValue({ success: false, error: 'nope' })
  await render(<AddFriendsScreen />)

  fireEvent.press(await screen.findByLabelText('Accept Ben'))

  await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith("That didn't go through. Try again.", 'error'))
  expect(screen.getByLabelText('Accept Ben')).toBeTruthy()
})

it('sends one answer however many times it is tapped while in flight', async () => {
  let settle: (v: { success: true; data: { state: 'friends' } }) => void = () => {}
  api.respondToFriendRequest.mockReturnValue(new Promise((resolve) => (settle = resolve)))
  await render(<AddFriendsScreen />)

  const accept = await screen.findByLabelText('Accept Ben')
  fireEvent.press(accept)
  // A tap on another row must not re-enable this one (it used to: one shared id).
  api.withdrawFriendRequest.mockResolvedValue({ success: true, data: { withdrawn: true } })
  fireEvent.press(screen.getByLabelText('Withdraw request to Dee'))
  fireEvent.press(screen.getByLabelText('Accept Ben'))

  await act(async () => settle({ success: true, data: { state: 'friends' } }))
  expect(api.respondToFriendRequest).toHaveBeenCalledTimes(1)
})

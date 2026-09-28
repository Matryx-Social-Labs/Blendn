/**
 * The screen an invite link opens, against a mocked API.
 *
 * Behavioural, because each branch is a decision a structural pin would pass
 * by name alone: what a dead link says (and does not say), what "Send friend
 * request" actually sends, and that the screen moves on to "Requested" only
 * when the server agreed.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({ token: 'abcdefghijklmnopqrstuv' }),
}))
jest.mock('react-native-safe-area-context', () => {
  const React = require('react')
  const { View } = require('react-native')
  return { SafeAreaView: (p: object) => React.createElement(View, p) }
})
jest.mock('../lib/apiClient', () => ({
  apiClient: { openFriendInvite: jest.fn(), sendFriendRequest: jest.fn() },
}))
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
jest.mock('../components/OptimizedImage', () => {
  const React = require('react')
  const { View } = require('react-native')
  return { OptimizedImage: () => React.createElement(View) }
})

import { router } from 'expo-router'
import { apiClient } from '../lib/apiClient'
import InviteScreen from '../app/f/[token]'

const api = apiClient as jest.Mocked<typeof apiClient>
const ANA = { userId: 'u_ana', name: 'Ana', photo: 'https://cdn/ana.jpg' }

beforeEach(() => jest.clearAllMocks())

it('says a dead link does not work, and nothing about why', async () => {
  api.openFriendInvite.mockResolvedValue({
    success: false,
    error: "This invite link doesn't work any more",
    errorCode: 'NOT_FOUND',
  })
  await render(<InviteScreen />)
  await screen.findByText("This link doesn't work")
  expect(screen.getByText('Ask the person who sent it for a new one.')).toBeTruthy()
  // No action to take on a link that does not work.
  expect(screen.queryByText('Send friend request')).toBeNull()
})

it('calls a link that failed to load a failed load, not a dead link, and tries again', async () => {
  api.openFriendInvite.mockResolvedValueOnce({ success: false, error: 'This is taking too long. Check your connection and try again.' })
  await render(<InviteScreen />)
  await screen.findByText("This link didn't open")
  expect(screen.queryByText("This link doesn't work")).toBeNull()

  api.openFriendInvite.mockResolvedValueOnce({ success: true, data: { person: ANA, state: 'none' } })
  fireEvent.press(screen.getByText('Try again'))
  await screen.findByText('Ana')
  expect(screen.getByText('Send friend request')).toBeTruthy()
})

it('shows who sent it and asks with the token, then says Requested', async () => {
  api.openFriendInvite.mockResolvedValue({ success: true, data: { person: ANA, state: 'none' } })
  api.sendFriendRequest.mockResolvedValue({ success: true, data: { state: 'requested' } })
  await render(<InviteScreen />)

  await screen.findByText('Ana')
  fireEvent.press(screen.getByText('Send friend request'))

  await waitFor(() => expect(api.sendFriendRequest).toHaveBeenCalledWith({ token: 'abcdefghijklmnopqrstuv' }))
  await screen.findByText('Requested')
})

it('stays put and says so when the request fails', async () => {
  api.openFriendInvite.mockResolvedValue({ success: true, data: { person: ANA, state: 'none' } })
  api.sendFriendRequest.mockResolvedValue({ success: false, error: 'nope' })
  await render(<InviteScreen />)

  await screen.findByText('Ana')
  fireEvent.press(screen.getByText('Send friend request'))

  await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith("That didn't go through. Try again.", 'error'))
  expect(screen.getByText('Send friend request')).toBeTruthy()
})

it('accepting from the link makes you friends at once', async () => {
  api.openFriendInvite.mockResolvedValue({ success: true, data: { person: ANA, state: 'incoming' } })
  api.sendFriendRequest.mockResolvedValue({ success: true, data: { state: 'friends' } })
  await render(<InviteScreen />)

  fireEvent.press(await screen.findByText('Accept friend request'))
  await screen.findByText('View profile')
  expect(mockShowToast).toHaveBeenCalledWith('You and Ana are friends', 'success')

  fireEvent.press(screen.getByText('View profile'))
  expect(router.replace).toHaveBeenCalledWith({ pathname: '/friends/[userId]', params: { userId: 'u_ana' } })
})

/**
 * A friend's profile — Message and Remove friend, against a mocked API.
 *
 * Message reuses an open DM rather than asking for a new one; Remove friend
 * leaves the screen only when the server agreed. Both are branches a
 * structural pin would pass by name alone.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ userId: 'u_ben' }),
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('../lib/apiClient', () => ({
  apiClient: { getFriend: jest.fn(), openFriendConversation: jest.fn(), removeFriend: jest.fn() },
}))
jest.mock('../lib/safetyUtils', () => ({ showUserSafetyActions: jest.fn() }))
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
jest.mock('../components/PhotoLightbox', () => () => null)
jest.mock('../components/profile/ProfileSections', () => {
  const React = require('react')
  const { Text } = require('react-native')
  const stub = (label: string) => (p: { title?: string }) => React.createElement(Text, null, p.title ?? label)
  return {
    ProfileHero: (p: { title: string }) => React.createElement(Text, null, p.title),
    ProfileBio: stub('bio'),
    ProfileDetail: stub('detail'),
    ProfileGallery: stub('gallery'),
    ProfileHeading: stub('heading'),
    ProfileInterests: stub('interests'),
  }
})

import { router } from 'expo-router'
import { apiClient } from '../lib/apiClient'
import FriendProfileScreen from '../app/friends/[userId]'

const api = apiClient as jest.Mocked<typeof apiClient>
const BEN = {
  userId: 'u_ben',
  name: 'Ben',
  photos: ['https://cdn/ben.jpg'],
  bio: null,
  occupation: null,
  education: null,
  age: 31,
  location: 'Bengaluru',
  interests: [],
  friendsSince: '2026-09-27T20:00:00Z',
  conversationId: null as string | null,
}
const alert = jest.spyOn(Alert, 'alert')

beforeEach(() => jest.clearAllMocks())

it('goes straight to an open DM without asking for a new one', async () => {
  api.getFriend.mockResolvedValue({ success: true, data: { ...BEN, conversationId: 'conv-1' } })
  await render(<FriendProfileScreen />)
  fireEvent.press(await screen.findByText('Message'))
  await waitFor(() =>
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ conversationId: 'conv-1', otherUserName: 'Ben' }) })
    )
  )
  expect(api.openFriendConversation).not.toHaveBeenCalled()
})

it('opens a DM when there is none', async () => {
  api.getFriend.mockResolvedValue({ success: true, data: BEN })
  api.openFriendConversation.mockResolvedValue({ success: true, data: { conversationId: 'conv-2' } })
  await render(<FriendProfileScreen />)
  fireEvent.press(await screen.findByText('Message'))
  await waitFor(() => expect(api.openFriendConversation).toHaveBeenCalledWith('u_ben'))
  await waitFor(() =>
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ conversationId: 'conv-2' }) }))
  )
})

it('stays on the profile and says so when removing fails', async () => {
  api.getFriend.mockResolvedValue({ success: true, data: BEN })
  api.removeFriend.mockResolvedValue({ success: false, error: 'nope' })
  alert.mockImplementation((_t, _m, buttons) => {
    const remove = buttons?.find((b) => b.text === 'Remove')
    void remove?.onPress?.()
  })
  await render(<FriendProfileScreen />)
  fireEvent.press(await screen.findByLabelText('Remove Ben from friends'))
  await waitFor(() => expect(api.removeFriend).toHaveBeenCalledWith('u_ben'))
  await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith("That didn't go through. Try again.", 'error'))
  expect(router.back).not.toHaveBeenCalled()
})

it('says plainly when they are no longer a friend', async () => {
  api.getFriend.mockResolvedValue({ success: false, error: 'Not found' })
  await render(<FriendProfileScreen />)
  expect(await screen.findByText("You're not friends with this person any more.")).toBeTruthy()
})

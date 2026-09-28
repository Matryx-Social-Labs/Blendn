/**
 * A friend's profile — Message and Remove friend, against a mocked API.
 *
 * Message reuses an open DM rather than asking for a new one; Remove friend
 * leaves the screen only when the server agreed. Both are branches a
 * structural pin would pass by name alone.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

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
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
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
    ProfileGallery: (p: { photos: string[] }) => React.createElement(Text, null, `gallery: ${p.photos.join(',')}`),
    ProfileHeading: stub('heading'),
    ProfileInterests: stub('interests'),
  }
})

import { router } from 'expo-router'
import { apiClient } from '../lib/apiClient'
import { showSheet } from '../lib/sheet'
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

/** Runs the confirmation sheet's "Remove friend", as a tap on it would. */
const runRemove = async () => {
  const sheet = (showSheet as jest.Mock).mock.calls[0][0]
  const remove = sheet.actions.find((a: { label: string }) => a.label === 'Remove friend')
  return remove.run()
}

it('asks in the app’s sheet, and stays on the profile saying so when removing fails', async () => {
  api.getFriend.mockResolvedValue({ success: true, data: BEN })
  api.removeFriend.mockResolvedValue({ success: false, error: 'nope' })
  await render(<FriendProfileScreen />)
  fireEvent.press(await screen.findByLabelText('Remove Ben from friends'))
  expect(showSheet).toHaveBeenCalledWith(expect.objectContaining({ title: 'Remove Ben?' }))
  // The sheet keeps the refusal and turns the button into Try again.
  await expect(runRemove()).resolves.toEqual({ ok: false, error: "That didn't go through. Try again." })
  expect(api.removeFriend).toHaveBeenCalledWith('u_ben')
  expect(router.back).not.toHaveBeenCalled()
})

it('leaves once the server agreed', async () => {
  api.getFriend.mockResolvedValue({ success: true, data: BEN })
  api.removeFriend.mockResolvedValue({ success: true, data: {} } as never)
  await render(<FriendProfileScreen />)
  fireEvent.press(await screen.findByLabelText('Remove Ben from friends'))
  await expect(runRemove()).resolves.toMatchObject({ ok: true })
  expect(router.back).toHaveBeenCalled()
})

it('does not repeat the hero’s first photo in the gallery', async () => {
  api.getFriend.mockResolvedValue({ success: true, data: { ...BEN, photos: ['a', 'b', 'c'] } })
  await render(<FriendProfileScreen />)
  // The hero cycles 'a'; the gallery is the rest.
  expect(await screen.findByText('gallery: b,c')).toBeTruthy()
})

it('says plainly when they are no longer a friend', async () => {
  api.getFriend.mockResolvedValue({ success: false, error: 'Not found', errorCode: 'NOT_FOUND' })
  await render(<FriendProfileScreen />)
  expect(await screen.findByText("You're not friends with this person any more.")).toBeTruthy()
})

it('does not call a failed load an unfriending, and tries again', async () => {
  // Offline, a timeout, a 5xx: no NOT_FOUND. This used to read as "not friends any more".
  api.getFriend.mockResolvedValueOnce({ success: false, error: 'No internet connection. Check your network and try again.' })
  await render(<FriendProfileScreen />)
  expect(await screen.findByText("This profile didn't load")).toBeTruthy()
  expect(screen.queryByText("You're not friends with this person any more.")).toBeNull()
  // And the way out is there, since the hero's top bar never drew.
  expect(screen.getByLabelText('Go back')).toBeTruthy()

  api.getFriend.mockResolvedValueOnce({ success: true, data: BEN })
  fireEvent.press(screen.getByText('Try again'))
  expect(await screen.findByText('Ben, 31')).toBeTruthy()
})

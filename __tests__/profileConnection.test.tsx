/**
 * The profile's Connect / Requested / Message, against a mocked API (SCRUM-371).
 *
 * Opened from a room, the route id is an `rh_` handle. The conversation and
 * request lists carry real ids, so matching the handle against them finds
 * nothing: an existing conversation drew "Connect", and Connect then 409'd.
 * The server now says where you stand in `connection`; these pin that the
 * screen takes its word, and still reads the lists when an older server sends
 * none.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'

let mockParams: { id: string; eventId?: string } = { id: 'rh_ben', eventId: 'e1' }
const mockUser = { id: 'u_me' }

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: mockUser }) }))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getPublicProfile: jest.fn(),
    getProfile: jest.fn(),
    getConversations: jest.fn(),
    getMessageRequests: jest.fn(),
    createMessageRequest: jest.fn(),
    likeAtEvent: jest.fn(),
  },
}))
jest.mock('../lib/safetyUtils', () => ({ showUserSafetyActions: jest.fn() }))
jest.mock('../components/PhotoLightbox', () => () => null)
jest.mock('../components/Skeleton', () => ({ SkeletonBlock: () => null, SkeletonLine: () => null }))
jest.mock('../components/grid/ConnectSheet', () => ({ ConnectSheet: () => null }))
jest.mock('../components/profile/ProfileSections', () => {
  const React = require('react')
  const { Pressable, Text, View } = require('react-native')
  const stub = (label: string) => (p: { title?: string }) => React.createElement(Text, null, p.title ?? label)
  return {
    ProfileHero: (p: { title: string }) => React.createElement(Text, null, p.title),
    ProfileBio: stub('bio'),
    ProfileDetail: stub('detail'),
    ProfileGallery: stub('gallery'),
    ProfileHeading: stub('heading'),
    ProfileInterests: stub('interests'),
    ProfileActions: (p: { label: string; hint?: string | null; onPress: () => void; disabled?: boolean }) =>
      React.createElement(
        View,
        null,
        React.createElement(
          Pressable,
          { onPress: p.onPress, disabled: p.disabled },
          React.createElement(Text, null, p.label)
        ),
        p.hint ? React.createElement(Text, null, p.hint) : null
      ),
  }
})

import { router } from 'expo-router'
import { apiClient } from '../lib/apiClient'
import UserProfile from '../app/user/[id]'

const api = apiClient as jest.Mocked<typeof apiClient>
const BEN = { id: 'rh_ben', name: 'Ben', photos: ['https://cdn/ben.jpg'], bio: 'Hi' }

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = { id: 'rh_ben', eventId: 'e1' }
  api.getConversations.mockResolvedValue({ success: true, data: [] })
  api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: [] } } as never)
})

describe('with the server’s `connection`', () => {
  it('opens the conversation it names, for a room handle the lists cannot match', async () => {
    api.getPublicProfile.mockResolvedValue({
      success: true,
      data: { ...BEN, connection: { conversationId: 'conv-9', request: null } },
    })
    await render(<UserProfile />)

    fireEvent.press(await screen.findByText('Message'))

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/private-chat/[conversationId]',
      params: { conversationId: 'conv-9', otherUserName: 'Ben', otherUserId: 'rh_ben' },
    })
    expect(api.getConversations).not.toHaveBeenCalled()
    expect(api.getMessageRequests).not.toHaveBeenCalled()
  })

  it('shows Requested for a request you sent', async () => {
    api.getPublicProfile.mockResolvedValue({
      success: true,
      data: { ...BEN, connection: { conversationId: null, request: 'sent' } },
    })
    await render(<UserProfile />)

    expect(await screen.findByText('Requested')).toBeTruthy()
    expect(screen.getByText('Request pending. You can chat after acceptance.')).toBeTruthy()
    expect(api.getMessageRequests).not.toHaveBeenCalled()
  })

  it('shows Requested for a request they sent, as the lists always did', async () => {
    api.getPublicProfile.mockResolvedValue({
      success: true,
      data: { ...BEN, connection: { conversationId: null, request: 'received' } },
    })
    await render(<UserProfile />)

    expect(await screen.findByText('Requested')).toBeTruthy()
  })

  it('offers Connect when it says there is nothing, without second-guessing it from the lists', async () => {
    api.getPublicProfile.mockResolvedValue({
      success: true,
      data: { ...BEN, connection: { conversationId: null, request: null } },
    })
    await render(<UserProfile />)

    expect(await screen.findByText('Connect')).toBeTruthy()
    expect(screen.getByText('Send a request to start chatting.')).toBeTruthy()
    expect(api.getConversations).not.toHaveBeenCalled()
  })
})

describe('without it — an older server, or somebody still anonymous to you', () => {
  it('falls back to the conversation list', async () => {
    mockParams = { id: 'u_ben' }
    api.getPublicProfile.mockResolvedValue({ success: true, data: { ...BEN, id: 'u_ben' } })
    api.getConversations.mockResolvedValue({
      success: true,
      data: [{ id: 'conv-1', otherUser: { id: 'u_ben', name: 'Ben' } }],
    })
    await render(<UserProfile />)

    fireEvent.press(await screen.findByText('Message'))

    expect(api.getConversations).toHaveBeenCalled()
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ conversationId: 'conv-1' }) })
    )
  })

  it('falls back to the request list', async () => {
    mockParams = { id: 'u_ben' }
    api.getPublicProfile.mockResolvedValue({ success: true, data: { ...BEN, id: 'u_ben' } })
    api.getMessageRequests.mockResolvedValue({
      success: true,
      data: { requests: [{ senderId: 'u_me', recipientId: 'u_ben', status: 'pending' }] },
    } as never)
    await render(<UserProfile />)

    expect(await screen.findByText('Requested')).toBeTruthy()
  })

  it('offers Connect when neither list has them', async () => {
    api.getPublicProfile.mockResolvedValue({ success: true, data: BEN })
    await render(<UserProfile />)

    expect(await screen.findByText('Connect')).toBeTruthy()
    expect(api.getConversations).toHaveBeenCalled()
    expect(api.getMessageRequests).toHaveBeenCalled()
  })
})

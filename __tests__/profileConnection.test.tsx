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
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

let mockParams: { id: string; eventId?: string; pseudonym?: string; roomSeed?: string } = { id: 'rh_ben', eventId: 'e1' }
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
    respondToMessageRequest: jest.fn(),
  },
}))
jest.mock('../lib/safetyUtils', () => ({ showUserSafetyActions: jest.fn() }))
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
jest.mock('../components/profile/PhotoViewer', () => ({ PhotoViewer: () => null }))
jest.mock('../components/Skeleton', () => ({ SkeletonBlock: () => null, SkeletonLine: () => null }))
// Open, it is one button that sends "hi" — enough to drive what the screen does with the answer.
jest.mock('../components/grid/ConnectSheet', () => ({
  ConnectSheet: (p: { visible: boolean; onSend: (m: string) => void }) => {
    const React = require('react')
    const { Pressable, Text } = require('react-native')
    return p.visible
      ? React.createElement(Pressable, { onPress: () => p.onSend('hi') }, React.createElement(Text, null, 'Send request'))
      : null
  },
}))
jest.mock('../components/ds/MomentMatch', () => ({
  MomentMatch: (p: { name: string; onSayHi: () => void }) => {
    const React = require('react')
    const { Pressable, Text } = require('react-native')
    return React.createElement(Pressable, { onPress: p.onSayHi }, React.createElement(Text, null, `You and ${p.name} matched`))
  },
}))
jest.mock('../components/profile/ProfileHeroStage', () => {
  const React = require('react')
  const { Text } = require('react-native')
  return {
    heroHeightFor: (w: number) => Math.round(w * 1.3),
    ProfileHeroStage: (p: { name: string; age?: number | null }) => React.createElement(Text, null, p.age ? `${p.name}, ${p.age}` : p.name),
  }
})
jest.mock('../components/profile/ProfileSections', () => {
  const React = require('react')
  const { Text, View } = require('react-native')
  const stub = (label: string) => (p: { title?: string }) => React.createElement(Text, null, p.title ?? label)
  return {
    SECTION_GAP: 28,
    ProfileSection: (p: { title: string; children: unknown }) => React.createElement(View, null, React.createElement(Text, null, p.title), p.children),
    ProfileBio: stub('bio'),
    ProfileDetail: stub('detail'),
    ProfileGallery: stub('gallery'),
    ProfileInterests: stub('interests'),
  }
})

import { router } from 'expo-router'
import { apiClient } from '../lib/apiClient'
import { showUserSafetyActions } from '../lib/safetyUtils'
import UserProfile, { stillAnonymous } from '../app/user/[id]'

const api = apiClient as jest.Mocked<typeof apiClient>
const BEN = { id: 'rh_ben', name: 'Ben', photos: ['https://cdn/ben.jpg'], bio: 'Hi', identityVisible: true }

beforeEach(() => {
  jest.clearAllMocks()
  api.getPublicProfile.mockReset()
  api.getProfile.mockReset()
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
    expect(screen.getByText('Request sent. You can chat once they accept.')).toBeTruthy()
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
    expect(screen.getByText('Connect sends a request and reveals your name and photo.')).toBeTruthy()
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

describe('Connect', () => {
  const NOTHING = { ...BEN, connection: { conversationId: null, request: null } }

  it('says Requested once the request is sent', async () => {
    api.getPublicProfile.mockResolvedValue({ success: true, data: NOTHING })
    api.createMessageRequest.mockResolvedValue({ success: true, data: {} } as never)
    await render(<UserProfile />)

    fireEvent.press(await screen.findByText('Connect'))
    fireEvent.press(await screen.findByText('Send request'))

    expect(await screen.findByText('Requested')).toBeTruthy()
  })

  it('does not promise a request that failed to send', async () => {
    api.getPublicProfile.mockResolvedValue({ success: true, data: NOTHING })
    api.createMessageRequest.mockResolvedValue({ success: false, error: 'No internet connection.' })
    await render(<UserProfile />)

    fireEvent.press(await screen.findByText('Connect'))
    fireEvent.press(await screen.findByText('Send request'))

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith("Your request didn’t send. Try again.", 'error', { haptic: 'error' }))
    expect(screen.getByText('Connect')).toBeTruthy()
    expect(screen.queryByText('Requested')).toBeNull()
    // The sheet stays open, with the message in it.
    expect(screen.getByText('Send request')).toBeTruthy()
  })

  it('says Requested when the server says one already exists', async () => {
    api.getPublicProfile.mockResolvedValue({ success: true, data: NOTHING })
    api.createMessageRequest.mockResolvedValue({ success: false, error: 'exists', errorCode: 'CONFLICT' })
    await render(<UserProfile />)

    fireEvent.press(await screen.findByText('Connect'))
    fireEvent.press(await screen.findByText('Send request'))

    expect(await screen.findByText('Requested')).toBeTruthy()
    expect(mockShowToast).not.toHaveBeenCalled()
  })

  /*
   * The room card as the server now sends it for somebody still anonymous to
   * you (admin #498): their pseudonym in that room, no `connection`. The lists
   * carry real ids, so a request you already sent cannot be matched to the
   * handle: Connect is offered, and the 409 is what says "Requested".
   */
  it('for somebody still anonymous, a request the lists cannot match turns Requested on the 409', async () => {
    mockParams = { id: 'rh_ben', eventId: 'e1', pseudonym: 'Slow Kite', roomSeed: 'e1:rh_ben' }
    api.getPublicProfile.mockResolvedValue({
      success: true,
      data: { id: 'rh_ben', name: 'Slow Kite', age: 27, identityVisible: false, isOwnProfile: false },
    })
    api.getMessageRequests.mockResolvedValue({
      success: true,
      data: { requests: [{ senderId: 'u_me', recipientId: 'u_ben', status: 'pending' }] },
    } as never)
    api.createMessageRequest.mockResolvedValue({ success: false, error: 'exists', errorCode: 'CONFLICT' })
    await render(<UserProfile />)

    expect(await screen.findByText('Slow Kite, 27')).toBeTruthy()
    fireEvent.press(await screen.findByText('Connect'))
    fireEvent.press(await screen.findByText('Send request'))

    expect(await screen.findByText('Requested')).toBeTruthy()
    expect(api.createMessageRequest).toHaveBeenCalledWith('rh_ben', 'hi')
    expect(mockShowToast).not.toHaveBeenCalled()
  })
})

describe('Like', () => {
  const NOTHING = { ...BEN, connection: { conversationId: null, request: null } }

  it('says why a like did not land', async () => {
    api.getPublicProfile.mockResolvedValue({ success: true, data: NOTHING })
    api.likeAtEvent.mockResolvedValue({ success: false, error: 'Check in before liking anyone here', errorCode: 'FORBIDDEN' })
    await render(<UserProfile />)

    fireEvent.press(await screen.findByText('Like'))

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Check in before liking anyone here', 'info'))
  })

  it('gives a mutual like its match moment, and Say hi opens the chat', async () => {
    api.getPublicProfile.mockResolvedValue({ success: true, data: NOTHING })
    api.likeAtEvent.mockResolvedValue({
      success: true,
      data: { mutual: true, conversationId: 'conv-7', pseudonyms: { you: 'Quiet Fox', them: 'Ben' } },
    })
    await render(<UserProfile />)

    fireEvent.press(await screen.findByText('Like'))
    fireEvent.press(await screen.findByText('You and Ben matched'))

    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ conversationId: 'conv-7' }) })
    )
  })
})

describe('when the profile does not load', () => {
  it('says it did not load, with Try again and a way back, rather than "not found"', async () => {
    api.getPublicProfile.mockResolvedValueOnce({ success: false, error: 'No internet connection.' })
    api.getProfile.mockResolvedValueOnce({ success: false, error: 'No internet connection.' })
    await render(<UserProfile />)

    expect(await screen.findByText('This profile didn’t load')).toBeTruthy()
    api.getPublicProfile.mockResolvedValueOnce({ success: true, data: { ...BEN, connection: { conversationId: null, request: null } } })
    fireEvent.press(screen.getByText('Try again'))
    expect(await screen.findByText('Connect')).toBeTruthy()
  })

  it('keeps a way back, since the top bar over the hero never drew', async () => {
    api.getPublicProfile.mockResolvedValue({ success: false, error: 'No internet connection.' })
    api.getProfile.mockResolvedValue({ success: false, error: 'No internet connection.' })
    await render(<UserProfile />)

    fireEvent.press(await screen.findByLabelText('Back'))
    expect(router.back).toHaveBeenCalled()
  })

  it('says so plainly when the server has no such profile', async () => {
    api.getPublicProfile.mockResolvedValue({ success: false, error: 'User not found', errorCode: 'NOT_FOUND' })
    api.getProfile.mockResolvedValue({ success: false, error: 'User not found', errorCode: 'NOT_FOUND' })
    await render(<UserProfile />)

    expect(await screen.findByText('This profile isn’t available.')).toBeTruthy()
    expect(screen.queryByText('Try again')).toBeNull()
  })
})

describe('identity fails closed (the server’s `identityVisible`, nothing else)', () => {
  it('shows no photo, bio or name when the flag is absent, even if the fields arrived', async () => {
    // An older route, or a server bug: the fields are present, the flag is not.
    mockParams = { id: 'rh_ben', eventId: 'e1', pseudonym: 'Cosmic Panda', roomSeed: 'g1:rh_ben' }
    api.getPublicProfile.mockResolvedValue({
      success: true,
      data: { id: 'rh_ben', name: 'Ben', photos: ['https://cdn/ben.jpg'], bio: 'Hi', occupation: 'Chef' },
    })
    await render(<UserProfile />)

    // Titled by the room's pseudonym, never by the name that leaked through.
    expect(await screen.findByText('Cosmic Panda')).toBeTruthy()
    expect(screen.queryByText('Ben')).toBeNull()
    // Nothing of theirs is drawn: the note says why, in the pseudonym's name.
    expect(screen.queryByText('bio')).toBeNull()
    expect(screen.queryByText('detail')).toBeNull()
    expect(screen.queryByText('gallery')).toBeNull()
    expect(screen.getByText(stillAnonymous('Cosmic Panda'))).toBeTruthy()
  })

  it('treats identityVisible: false the same, and never titles anybody "Attendee"', async () => {
    api.getPublicProfile.mockResolvedValue({
      success: true,
      data: { id: 'rh_ben', name: 'Attendee', identityVisible: false, connection: undefined },
    })
    await render(<UserProfile />)

    expect(await screen.findByText('Someone')).toBeTruthy()
    expect(screen.queryByText('Attendee')).toBeNull()
  })

  it('does not hand "Attendee" to the thread as their name', async () => {
    mockParams = { id: 'u_ben' }
    api.getPublicProfile.mockResolvedValue({ success: true, data: { id: 'u_ben', name: 'Attendee', identityVisible: false } })
    api.getConversations.mockResolvedValue({
      success: true,
      data: [{ id: 'conv-1', otherUser: { id: 'u_ben', name: 'Attendee' } }],
    })
    await render(<UserProfile />)

    fireEvent.press(await screen.findByText('Message'))
    const params = (router.push as jest.Mock).mock.calls[0][0].params
    expect(params.conversationId).toBe('conv-1')
    expect(params.otherUserName).toBeUndefined()
  })

  it('shows identity when the server says so', async () => {
    api.getPublicProfile.mockResolvedValue({ success: true, data: { ...BEN, age: 29, connection: { conversationId: null, request: null } } })
    await render(<UserProfile />)

    expect(await screen.findByText('Ben, 29')).toBeTruthy()
    expect(screen.getByText('bio')).toBeTruthy()
  })
})

it('leaves the profile after blocking from it', async () => {
  api.getPublicProfile.mockResolvedValue({ success: true, data: { ...BEN, connection: { conversationId: null, request: null } } })
  await render(<UserProfile />)

  fireEvent.press(await screen.findByLabelText('Report or block'))
  const onBlock = (showUserSafetyActions as jest.Mock).mock.calls[0][2]
  onBlock()
  expect(router.back).toHaveBeenCalled()
})

describe('a request they sent you, opened from their profile (R4.1 6.2)', () => {
  const RECEIVED = { ...BEN, id: 'u_ben', connection: { conversationId: null, request: 'received' as const } }
  const pending = [{ id: 'req-1', senderId: 'u_ben', message: 'Saw you at Toit. Coffee?', status: 'pending' }]

  beforeEach(() => {
    mockParams = { id: 'u_ben' }
    api.getPublicProfile.mockResolvedValue({ success: true, data: RECEIVED })
    api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: pending } } as never)
  })

  it('shows who asked and their note verbatim, with Decline and Accept in the tray', async () => {
    await render(<UserProfile />)
    expect(await screen.findByText('Ben wants to message you')).toBeTruthy()
    expect(screen.getByText('Saw you at Toit. Coffee?')).toBeTruthy()
    expect(screen.getByLabelText('Accept Ben’s request')).toBeTruthy()
    expect(screen.getByLabelText('Decline Ben’s request')).toBeTruthy()
    // The tray is theirs: no Like and no Connect beside it.
    expect(screen.queryByText('Connect')).toBeNull()
  })

  it('Accept answers that request, says success once, and opens the chat', async () => {
    api.respondToMessageRequest.mockResolvedValue({ success: true, data: { success: true, status: 'accepted', conversationId: 'conv-5', sender: { id: 'u_ben', name: 'Ben', avatar: null } } })
    await render(<UserProfile />)
    await fireEvent.press(await screen.findByLabelText('Accept Ben’s request'))
    await waitFor(() => expect(api.respondToMessageRequest).toHaveBeenCalledWith('req-1', 'accept'))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ conversationId: 'conv-5' }) })))
  })

  it('Decline answers it and leaves nothing to offer, since a pair has one request for all time', async () => {
    api.respondToMessageRequest.mockResolvedValue({ success: true, data: { success: true, status: 'declined', conversationId: null, sender: { id: 'u_ben', name: 'Ben', avatar: null } } })
    await render(<UserProfile />)
    await fireEvent.press(await screen.findByLabelText('Decline Ben’s request'))
    await waitFor(() => expect(api.respondToMessageRequest).toHaveBeenCalledWith('req-1', 'decline'))
    expect(await screen.findByText('Declined')).toBeTruthy()
    expect(screen.queryByText('Ben wants to message you')).toBeNull()
  })

  it('a refused answer says so and keeps the prompt', async () => {
    api.respondToMessageRequest.mockResolvedValue({ success: false, error: 'nope' })
    await render(<UserProfile />)
    await fireEvent.press(await screen.findByLabelText('Accept Ben’s request'))
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith("Couldn’t accept that request. Try again.", 'error', { haptic: 'error' }))
    expect(screen.getByText('Ben wants to message you')).toBeTruthy()
  })

  it('stays Requested when the request cannot be matched (a room handle)', async () => {
    api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: [{ ...pending[0], senderId: 'u_other' }] } } as never)
    await render(<UserProfile />)
    expect(await screen.findByText('Requested')).toBeTruthy()
    expect(screen.queryByText('Ben wants to message you')).toBeNull()
  })
})

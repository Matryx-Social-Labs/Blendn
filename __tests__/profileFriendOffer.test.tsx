/**
 * "Add friend" on a profile (SCRUM-750), rendered: the same states as the match's options, from `GET /profiles/:id`'s
 * `friend` (the page itself is drawn from `GET /users/:id`, which does not carry it). Only for somebody you may see,
 * never for a room handle, and always asked with their real id.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'

let mockParams: { id: string; eventId?: string; pseudonym?: string; roomSeed?: string } = { id: 'u_ben' }
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
    getFriendOffer: jest.fn(),
    sendFriendRequest: jest.fn(),
  },
}))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() } }))
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
const BEN = { id: 'u_ben', name: 'Ben', photos: ['https://cdn/ben.jpg'], bio: 'Hi', identityVisible: true }


const OFFER = (state: string, canAdd: boolean) => ({ state, canAdd }) as never
const open = async (offer: unknown = OFFER('none', true), id = 'u_ben', over: Record<string, unknown> = {}) => {
  mockParams = { id }
  api.getPublicProfile.mockResolvedValue({ success: true, data: { ...BEN, id, ...over } })
  api.getFriendOffer.mockResolvedValue(offer as never)
  await render(<UserProfile />)
  await screen.findByText('Ben')
}
const flush = () => act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve() })

beforeEach(() => {
  api.getFriendOffer.mockReset()
  api.sendFriendRequest.mockReset()
  mockShowToast.mockReset()
})

describe('what the dock draws for each state', () => {
  it('none + canAdd: a lit Add friend, above Message', async () => {
    await open(OFFER('none', true))
    expect(await screen.findByTestId('profile-friend')).toBeTruthy()
    expect(screen.getByLabelText('Add Ben as a friend')).toBeTruthy()
    expect(screen.getByText('Add friend')).toBeTruthy()
    expect(api.getFriendOffer).toHaveBeenCalledWith('u_ben')
  })

  it('incoming: a lit Accept', async () => {
    await open(OFFER('incoming', true))
    expect(await screen.findByLabelText('Accept Ben\'s friend request')).toBeTruthy()
  })

  it('requested: a quiet, disabled Requested', async () => {
    await open(OFFER('requested', false))
    const button = await screen.findByTestId('profile-friend')
    expect(button.props.accessibilityState).toMatchObject({ disabled: true })
    expect(screen.getByText('Requested', { exact: true })).toBeTruthy()
    await act(async () => fireEvent.press(button))
    expect(api.sendFriendRequest).not.toHaveBeenCalled()
  })

  it('friends: a quiet, disabled Friends', async () => {
    await open(OFFER('friends', false))
    const button = await screen.findByTestId('profile-friend')
    expect(button.props.accessibilityState).toMatchObject({ disabled: true })
    expect(screen.getByText('Friends')).toBeTruthy()
  })

  it.each([
    ['a person the server does not offer', OFFER('none', false)],
    ['an older server with no friend field', null],
  ])('%s: nothing, and the dock is as it was', async (_name, offer) => {
    await open(offer)
    await flush()
    expect(screen.queryByTestId('profile-friend')).toBeNull()
    expect(screen.getByTestId('profile-cta')).toBeTruthy()
  })

  it('a friend read that fails draws nothing and the page still opens', async () => {
    mockParams = { id: 'u_ben' }
    api.getPublicProfile.mockResolvedValue({ success: true, data: BEN })
    api.getFriendOffer.mockRejectedValue(new Error('boom'))
    await render(<UserProfile />)
    expect(await screen.findByText('Ben')).toBeTruthy()
    await flush()
    expect(screen.queryByTestId('profile-friend')).toBeNull()
    expect(screen.queryByTestId('profile-failed')).toBeNull()
  })
})

describe('who is asked about at all', () => {
  it('not somebody you cannot see yet', async () => {
    mockParams = { id: 'u_ben' }
    api.getPublicProfile.mockResolvedValue({ success: true, data: { ...BEN, identityVisible: false } })
    api.getFriendOffer.mockResolvedValue(OFFER('none', true))
    await render(<UserProfile />)
    await flush()
    expect(api.getPublicProfile).toHaveBeenCalled()
    expect(api.getFriendOffer).not.toHaveBeenCalled()
    expect(screen.queryByTestId('profile-friend')).toBeNull()
  })

  it('not a room handle: it has no real id to send', async () => {
    await open(OFFER('none', true), 'rh_ben')
    await flush()
    expect(api.getFriendOffer).not.toHaveBeenCalled()
    expect(screen.queryByTestId('profile-friend')).toBeNull()
  })

  it('not yourself', async () => {
    await open(OFFER('none', true), 'u_me')
    await flush()
    expect(api.getFriendOffer).not.toHaveBeenCalled()
  })
})

describe('asking', () => {
  it('sends their real id, then draws Requested', async () => {
    api.sendFriendRequest.mockResolvedValue({ success: true, data: { state: 'requested' } } as never)
    await open(OFFER('none', true))
    await act(async () => fireEvent.press(await screen.findByTestId('profile-friend')))
    await flush()

    expect(api.sendFriendRequest).toHaveBeenCalledTimes(1)
    expect(api.sendFriendRequest).toHaveBeenCalledWith({ userId: 'u_ben' })
    expect(mockShowToast).toHaveBeenCalledWith('Friend request sent to Ben', 'success', { haptic: 'success' })
    expect(screen.getByTestId('profile-friend').props.accessibilityState).toMatchObject({ disabled: true })
    expect(screen.getByText('Requested', { exact: true })).toBeTruthy()
  })

  it('accepting a request they made draws Friends', async () => {
    api.sendFriendRequest.mockResolvedValue({ success: true, data: { state: 'friends' } } as never)
    await open(OFFER('incoming', true))
    await act(async () => fireEvent.press(await screen.findByTestId('profile-friend')))
    await flush()

    expect(api.sendFriendRequest).toHaveBeenCalledWith({ userId: 'u_ben' })
    expect(mockShowToast).toHaveBeenCalledWith('You and Ben are friends', 'success', { haptic: 'success' })
    expect(screen.getByText('Friends')).toBeTruthy()
  })

  it('the button spins while the request is out, and a second press sends nothing more', async () => {
    let finish: (v: unknown) => void = () => {}
    api.sendFriendRequest.mockReturnValue(new Promise((r) => (finish = r)) as never)
    await open(OFFER('none', true))
    const button = await screen.findByTestId('profile-friend')
    await act(async () => fireEvent.press(button))
    await act(async () => fireEvent.press(screen.getByTestId('profile-friend')))
    expect(api.sendFriendRequest).toHaveBeenCalledTimes(1)
    await act(async () => finish({ success: true, data: { state: 'requested' } }))
    await flush()
  })
})

describe('when it does not go through', () => {
  it('NOT_A_REVEALED_MATCH: "Reveal yourself first", and the button stays', async () => {
    api.sendFriendRequest.mockResolvedValue({ success: false, errorCode: 'NOT_FOUND', reasonCode: 'NOT_A_REVEALED_MATCH', error: 'Not found' } as never)
    await open(OFFER('none', true))
    await act(async () => fireEvent.press(await screen.findByTestId('profile-friend')))
    await flush()
    expect(mockShowToast).toHaveBeenCalledWith('Reveal yourself first', 'info')
    expect(screen.getByText('Add friend')).toBeTruthy()
  })

  it('any other failure: the standard error toast, and the button stays', async () => {
    api.sendFriendRequest.mockResolvedValue({ success: false, errorCode: 'NOT_FOUND', error: 'Not found' } as never)
    await open(OFFER('none', true))
    await act(async () => fireEvent.press(await screen.findByTestId('profile-friend')))
    await flush()
    expect(mockShowToast).toHaveBeenCalledWith("That didn't go through. Try again.", 'error', { haptic: 'error' })
    expect(screen.getByText('Add friend')).toBeTruthy()
  })
})

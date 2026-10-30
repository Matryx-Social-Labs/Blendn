/**
 * A profile opened from a room knows what the room knows (SCRUM-953): a person you already liked reads "Liked", not "Like",
 * and one you matched with reads "Message", not "Connect" — the roster and the card said so, the profile asked nobody.
 */
import { render, screen } from '@testing-library/react-native'
import { Dimensions, StyleSheet } from 'react-native'

let mockParams: Record<string, string> = { id: 'u_ben' }
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
    ProfileHeroStage: function HeroStub(p: { name: string; age?: number | null }) {
      return React.createElement(Text, null, p.age ? `${p.name}, ${p.age}` : p.name)
    },
  }
})
jest.mock('../components/profile/ProfileSections', () => {
  const React = require('react')
  const { Text, View } = require('react-native')
  // eslint-disable-next-line react/display-name
  const stub = (label: string) => (p: { title?: string }) => React.createElement(Text, null, p.title ?? label)
  // The real `ProfileBody` (the one body both profile pages draw, D26) over the stubbed pieces is not possible across a module
  // boundary, so the real module is kept and only its leaf pieces below stand in where a test reads them.
  return {
    ...jest.requireActual('../components/profile/ProfileSections'),
    SECTION_GAP: 28,
    ProfileSection: (p: { title: string; children: unknown }) => React.createElement(View, null, React.createElement(Text, null, p.title), p.children),
    ProfileBio: stub('bio'),
    ProfileDetail: stub('detail'),
    ProfileGallery: stub('gallery'),
    ProfileInterests: stub('interests'),
  }
})

import { apiClient } from '../lib/apiClient'
import UserProfile from '../app/user/[id]'

const api = apiClient as jest.Mocked<typeof apiClient>
const BEN = { id: 'u_ben', name: 'Ben', photos: ['https://cdn/ben.jpg'], bio: 'Hi', identityVisible: false }

const open = async (params: Record<string, string>) => {
  mockParams = { id: 'rh_ben', eventId: 'e1', pseudonym: 'Dancing Gecko', roomSeed: 'e1:rh_ben', ...params }
  api.getPublicProfile.mockResolvedValue({ success: true, data: BEN })
  api.getConversations.mockResolvedValue({ success: true, data: [] } as never)
  api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: [] } } as never)
  await render(<UserProfile />)
  await screen.findByText('Dancing Gecko')
}

it('offers Like to somebody you have not liked', async () => {
  await open({})
  expect(screen.getByText('Like')).toBeTruthy()
})

it('reads Liked when the room says you liked them', async () => {
  await open({ liked: '1' })
  expect(screen.getByText('Liked')).toBeTruthy()
  expect(screen.queryByText('Like')).toBeNull()
})

it('offers Message, not Connect, when the room says you matched', async () => {
  await open({ liked: '1', conversationId: 'c1' })
  expect(screen.getByText('Message')).toBeTruthy()
  expect(screen.queryByText('Connect')).toBeNull()
})

it('the Room card hands what it knows to the profile it opens', () => {
  const fs = require('fs')
  const screenSrc: string = fs.readFileSync(require('path').join(__dirname, '../components/blendn/BlendnScreen.tsx'), 'utf8')
  const openProfile = screenSrc.slice(screenSrc.indexOf('const openProfile'), screenSrc.indexOf('const sayHi'))
  expect(openProfile).toContain("{ liked: '1' }")
  expect(openProfile).toContain('conversationId: seen.conversationId')
  expect(screenSrc).toContain('openProfile(card, cardPerson ?? undefined)')
})

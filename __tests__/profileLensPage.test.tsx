/**
 * Flow 5 C3b (P-A, `pA-page` / `pA-page-named`): a profile opened from a room is the person through the room’s lens.
 * The lead pills and In common are the room’s own card (handed in memory); the Tonight card is the server’s.
 */
import { AccessibilityInfo, StyleSheet } from 'react-native'
import { act, fireEvent, render, screen } from '@testing-library/react-native'


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
    sendWave: jest.fn(),
  },
}))
let mockMatchHandler: ((d: { eventId: string; otherUserId: string; conversationId: string; name: string }) => void) | null = null
jest.mock('../lib/socketClient', () => ({
  ...jest.requireActual('../lib/socketClient'),
  subscribeToRoomMatch: (cb: typeof mockMatchHandler) => {
    mockMatchHandler = cb
    return () => { mockMatchHandler = null }
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
import { handRoomPerson } from '../lib/roomPersonHandoff'
import UserProfile from '../app/user/[id]'

const api = apiClient as jest.Mocked<typeof apiClient>
const WORK = { key: 'work', question: 'What are you working on?' }
const ANON = { id: 'rh_bison', name: 'Gentle Bison', age: 31, location: 'Toronto', identityVisible: false, tonight: { lens: WORK, answer: 'A map of every quiet café in Toronto', workIntent: 'hire' } }
const card = (over: object = {}) => ({
  person: { workField: 'Product design', sharedIntents: ['networking'], interests: ['Cycling', 'Board games'], overlaps: [], badges: [], age: 31, tonightAnswer: 'stale answer', workIntent: null, ...over },
  lens: WORK,
})

const open = async (data: object, params: Record<string, string> = {}, ready = 'Gentle Bison') => {
  mockParams = { id: 'rh_bison', eventId: 'e1', pseudonym: 'Gentle Bison', roomSeed: 'e1:rh_bison', ...params }
  api.getPublicProfile.mockResolvedValue({ success: true, data } as never)
  api.getConversations.mockResolvedValue({ success: true, data: [] } as never)
  api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: [] } } as never)
  api.sendWave.mockResolvedValue({ success: true, data: { sent: true } } as never)
  await render(<UserProfile />)
  await screen.findAllByText(ready)
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}
const tree = () => JSON.stringify(screen.toJSON())

beforeEach(() => {
  jest.clearAllMocks()
  handRoomPerson('nobody', card())
})

it('anonymous: the centred hero says Anonymous · 31, then the lens blocks in order, and the dock is Wave and Message', async () => {
  handRoomPerson('rh_bison', card())
  await open(ANON)
  expect(screen.getByTestId('profile-lens-hero')).toBeTruthy()
  expect(screen.getByText('Anonymous · 31')).toBeTruthy()
  const t = tree()
  const seq = ['Gentle Bison', 'Anonymous · 31', 'Product design', 'Here to hire', 'What are you working on?', 'A map of every quiet café in Toronto', 'In common', 'Cycling', 'Wave', 'Message']
  const idx = seq.map((x) => t.indexOf(x))
  expect(idx.every((i) => i >= 0)).toBe(true)
  expect([...idx].sort((a, b) => a - b)).toEqual(idx)
  // The server's answer and pick, fresher than the card's.
  expect(t).not.toContain('stale answer')
  expect(screen.queryByTestId('avatar-photo')).toBeNull()
  expect(screen.queryByText('Like')).toBeNull()
})

it('the page starts under the bar, not beneath it, and its dock is the glass line with no Connect note (drive, iOS)', async () => {
  handRoomPerson('rh_bison', card())
  await open(ANON)
  // insets 0: the bar's buttons end at 2 + 44, and the hero starts 14 under them (`pA-page` 116 against 102).
  expect(StyleSheet.flatten(screen.getByTestId('profile-lens-page').props.style).paddingTop).toBe(60)
  expect(screen.queryByText(/Connect sends a request/)).toBeNull()
  expect(StyleSheet.flatten(screen.getByTestId('profile-lens-dock-row').props.style).flexDirection).toBe('row')
  expect(tree()).toContain('Sends a request and shows them your name and photo')
})

it('named: their face and name, “Shown to you · 31”, and the same lens blocks', async () => {
  handRoomPerson('rh_bison', card())
  await open({ ...ANON, name: 'Marc-André', identityVisible: true, photos: ['https://cdn/marc.jpg'] }, { pseudonym: 'Gentle Bison' }, 'Marc-André')
  expect(await screen.findByText('Shown to you · 31')).toBeTruthy()
  expect(screen.getAllByText('Marc-André').length).toBeGreaterThan(0)
  expect(screen.getByText('Here to hire')).toBeTruthy()
})

it('named: their bio follows as one card in the In-common voice, About, Interests, Work (owner pick r1 C), not the old profile body', async () => {
  handRoomPerson('rh_bison', card())
  await open({ ...ANON, name: 'Marc-André', identityVisible: true, photos: ['https://cdn/marc.jpg'], bio: 'Architect by day, zine-maker by night.', interests: ['Printmaking', 'Sketching'], occupation: 'Studio lead' }, { pseudonym: 'Gentle Bison' }, 'Marc-André')
  const bio = await screen.findByTestId('profile-lens-bio')
  const t = JSON.stringify(bio)
  const seq = ['About', 'Architect by day, zine-maker by night.', 'Interests', 'Printmaking', 'Sketching', 'Work', 'Studio lead']
  const idx = seq.map((x) => t.indexOf(x))
  expect(idx.every((i) => i >= 0)).toBe(true)
  expect([...idx].sort((a, b) => a - b)).toEqual(idx)
  expect(tree()).not.toContain('OCCUPATION')
  expect(screen.queryByTestId('profile-lens-empty')).toBeNull()
})

it('anonymous: no bio card, whatever arrives', async () => {
  handRoomPerson('rh_bison', card())
  await open({ ...ANON, bio: 'leaked bio' })
  expect(screen.queryByTestId('profile-lens-bio')).toBeNull()
  expect(tree()).not.toContain('leaked bio')
})

it('a venue night with nothing in common says so quietly (owner pick r2 A); a page with blocks does not (control: the first test)', async () => {
  handRoomPerson('rh_bison', card({ workField: null, sharedIntents: [], interests: [] }))
  await open({ ...ANON, tonight: { lens: { key: 'venue_night', question: null }, answer: null, workIntent: null } })
  expect(screen.getByTestId('profile-lens-empty')).toBeTruthy()
  expect(screen.getByText('Nothing on your profiles in common yet.')).toBeTruthy()
})

it('a card handed for somebody else is never drawn on this page: the Tonight card alone (the control is the first test)', async () => {
  handRoomPerson('rh_someone_else', card({ workField: 'Someone else’s field' }))
  await open(ANON)
  expect(screen.getByTestId('profile-lens-hero')).toBeTruthy()
  expect(tree()).not.toContain('Someone else’s field')
  expect(screen.queryByText('In common')).toBeNull()
  expect(screen.getByText('A map of every quiet café in Toronto')).toBeTruthy()
  // The pick is the server's, so it still leads.
  expect(screen.getByText('Here to hire')).toBeTruthy()
})

it('while the wave sends, the hand waves as the sheet’s does (owner pick r3 A), not a spinner', async () => {
  handRoomPerson('rh_bison', card())
  await open(ANON)
  let land: (v: unknown) => void = () => {}
  api.sendWave.mockReturnValue(new Promise((r) => { land = r }) as never)
  await fireEvent.press(screen.getByTestId('profile-wave'))
  expect(screen.getByTestId('profile-wave-hand')).toBeTruthy()
  // The waving hand is the resting glyph's 18, so nothing jumps in size as it starts (drive, C3b).
  expect(JSON.stringify(screen.getByTestId('profile-wave-hand'), (k, v) => (k === 'parent' ? undefined : v))).toMatch(/"width":18\b/)
  expect(screen.getByTestId('profile-wave').props.accessibilityState).toMatchObject({ disabled: true })
  await act(async () => { land({ success: true, data: { sent: true } }) })
  expect(screen.queryByTestId('profile-wave-hand')).toBeNull()
  expect(await screen.findByText('Waved')).toBeTruthy()
})

it('at rest the page’s Wave hand is the board’s 18 (`ic(\'hand\',18)`, the dock glyph), not the sheet’s 20 (drive, C3b)', async () => {
  handRoomPerson('rh_bison', card())
  await open(ANON)
  type J = { props?: Record<string, unknown>; children?: unknown[] | null }
  const find = (n: J, id: string): J | null => n?.props?.testID === id ? n : (n?.children ?? []).reduce<J | null>((f, c) => f ?? (typeof c === 'object' ? find(c as J, id) : null), null)
  const widths = (n: J): number[] => [...(n?.props?.width != null ? [Number(n.props.width)] : []), ...(n?.children ?? []).flatMap((c) => (typeof c === 'object' ? widths(c as J) : []))]
  const root = screen.toJSON() as J | J[]
  const wave = (Array.isArray(root) ? root : [root]).reduce<J | null>((f, r) => f ?? find(r, 'profile-wave'), null)
  const sizes = widths(wave as J)
  expect(sizes).toContain(18)
  expect(sizes).not.toContain(20)
})

it('Wave waves at them in this room, and then reads Waved', async () => {
  handRoomPerson('rh_bison', card())
  await open(ANON)
  await fireEvent.press(screen.getByTestId('profile-wave'))
  await act(async () => {})
  expect(api.sendWave).toHaveBeenCalledWith('e1', 'rh_bison')
  expect(await screen.findByText('Waved')).toBeTruthy()
})

it('Waved is said when it lands: announced on iOS, the dock a polite live region on Android (drive, TalkBack)', async () => {
  const say = jest.spyOn(AccessibilityInfo, 'announceForAccessibility')
  handRoomPerson('rh_bison', card())
  await open(ANON)
  expect(screen.getByTestId('profile-lens-dock-row').props.accessibilityLiveRegion).toBe('polite')
  expect(say).not.toHaveBeenCalled()
  await fireEvent.press(screen.getByTestId('profile-wave'))
  await act(async () => {})
  expect(say).toHaveBeenCalledWith('Waved at Gentle Bison')
  say.mockRestore()
})

it('outside a room, or with no lens anywhere, it is the profile page it always was', async () => {
  await open({ ...ANON, tonight: undefined }, {}, 'Gentle Bison, 31')
  expect(screen.queryByTestId('profile-lens-hero')).toBeNull()
  expect(screen.getByText('Gentle Bison, 31')).toBeTruthy()
})

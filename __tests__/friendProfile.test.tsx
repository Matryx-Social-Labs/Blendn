/**
 * A friend's profile — Message and Remove friend, against a mocked API.
 *
 * Message reuses an open DM rather than asking for a new one; Remove friend
 * leaves the screen only when the server agreed. Both are branches a
 * structural pin would pass by name alone.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ userId: 'u_ben' }),
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('../lib/apiClient', () => ({
  apiClient: { getFriend: jest.fn(), openFriendConversation: jest.fn(), removeFriend: jest.fn(), getWorkFields: jest.fn() },
}))
jest.mock('../lib/safetyUtils', () => ({ showUserSafetyActions: jest.fn() }))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
jest.mock('../components/profile/PhotoViewer', () => ({ PhotoViewer: () => null }))
jest.mock('../components/profile/ProfileHeroStage', () => {
  const React = require('react')
  const { Text } = require('react-native')
  return {
    heroHeightFor: (w: number) => Math.round(w * 1.3),
    ProfileHeroStage: (p: { name: string; age?: number | null; subtitle?: string | null }) =>
      React.createElement(React.Fragment, null, React.createElement(Text, null, p.age ? `${p.name}, ${p.age}` : p.name), p.subtitle ? React.createElement(Text, { testID: 'hero-subtitle' }, p.subtitle) : null),
  }
})
jest.mock('../components/profile/ProfileSections', () => {
  const React = require('react')
  const { Text, View } = require('react-native')
  const stub = (label: string) => (p: { title?: string }) => React.createElement(Text, null, p.title ?? label)
  // The real `ProfileBody` (the one body both profile pages draw, D26) over the stubbed pieces is not possible across a module
  // boundary, so the real module is kept and only its leaf pieces below stand in where a test reads them.
  return {
    ...jest.requireActual('../components/profile/ProfileSections'),
    SECTION_GAP: 28,
    ProfileSection: (p: { title: string; children: unknown }) => React.createElement(View, null, React.createElement(Text, null, p.title), p.children),
    ProfileBio: stub('bio'),
    ProfileDetail: stub('detail'),
    ProfileGallery: (p: { photos: string[] }) => React.createElement(Text, null, `gallery: ${p.photos.join(',')}`),
    ProfileInterests: stub('interests'),
  }
})

import { router } from 'expo-router'
import { apiClient } from '../lib/apiClient'
import { showSheet } from '../lib/sheet'
import FriendProfileScreen from '../app/friends/[userId]'
import { PROFILE_EMPTY } from '../components/profile/ProfileSections'
import { SELECTION } from '../components/ds/shared'

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

/** The corner menu's sheet, its "Remove friend" step, and that step's confirmation, as taps on them would. */
const menu = () => (showSheet as jest.Mock).mock.calls[0][0]
const confirmSheet = () => menu().actions.find((a: { label: string }) => a.label === 'Remove friend').next()
const runRemove = async () => confirmSheet().actions.find((a: { label: string }) => a.label === 'Remove friend').run()

it('asks in the app’s sheet, and stays on the profile saying so when removing fails', async () => {
  api.getFriend.mockResolvedValue({ success: true, data: BEN })
  api.removeFriend.mockResolvedValue({ success: false, error: 'nope' })
  await render(<FriendProfileScreen />)
  fireEvent.press(await screen.findByLabelText('More'))
  expect(showSheet).toHaveBeenCalledWith(expect.objectContaining({ title: 'Ben' }))
  expect(confirmSheet()).toMatchObject({ title: 'Remove Ben?' })
  // The sheet keeps the refusal and turns the button into Try again.
  await expect(runRemove()).resolves.toEqual({ ok: false, error: "That didn’t go through. Try again." })
  expect(api.removeFriend).toHaveBeenCalledWith('u_ben')
  expect(router.back).not.toHaveBeenCalled()
})

it('leaves once the server agreed', async () => {
  api.getFriend.mockResolvedValue({ success: true, data: BEN })
  api.removeFriend.mockResolvedValue({ success: true, data: {} } as never)
  await render(<FriendProfileScreen />)
  fireEvent.press(await screen.findByLabelText('More'))
  await expect(runRemove()).resolves.toMatchObject({ ok: true })
  expect(router.back).toHaveBeenCalled()
})

it('does not repeat the hero’s first photo in the gallery', async () => {
  api.getFriend.mockResolvedValue({ success: true, data: { ...BEN, photos: ['a', 'b', 'c'] } })
  await render(<FriendProfileScreen />)
  // The hero cycles 'a'; the gallery is the rest.
  expect(await screen.findByLabelText('Photo 1 of 2')).toBeTruthy()
  expect(screen.getByLabelText('Photo 2 of 2')).toBeTruthy()
  expect(screen.queryByLabelText(/of 3$/)).toBeNull()
})

it('says plainly when they are no longer a friend', async () => {
  api.getFriend.mockResolvedValue({ success: false, error: 'Not found', errorCode: 'NOT_FOUND' })
  await render(<FriendProfileScreen />)
  expect(await screen.findByText('You’re not friends with this person any more.')).toBeTruthy()
})

it('does not call a failed load an unfriending, and tries again', async () => {
  // Offline, a timeout, a 5xx: no NOT_FOUND. This used to read as "not friends any more".
  api.getFriend.mockResolvedValueOnce({ success: false, error: 'No internet connection. Check your network and try again.' })
  await render(<FriendProfileScreen />)
  expect(await screen.findByText('This profile didn’t load')).toBeTruthy()
  expect(screen.queryByText('You’re not friends with this person any more.')).toBeNull()
  // And the way out is there, since the hero's top bar never drew.
  expect(screen.getByLabelText('Back')).toBeTruthy()

  api.getFriend.mockResolvedValueOnce({ success: true, data: BEN })
  fireEvent.press(screen.getByText('Try again'))
  expect(await screen.findByText('Ben, 31')).toBeTruthy()
})

/*
 * D26 / D1 (D-M13, D-M15, D-L31): one friend, one page. Message is the rose-lit action `/user/[id]` draws, Remove friend is in the
 * corner's menu with Block and Report (it floated under the sections and peeked under the dock at AX), and a friend with nothing
 * filled in says so rather than leaving a void. Negative control: the gradient Message, or the floating Remove, fails this.
 */
it('Message is lit, Remove friend is in the corner menu, and an empty profile says so', async () => {
  api.getFriend.mockResolvedValue({ success: true, data: BEN })
  await render(<FriendProfileScreen />)
  await screen.findByTestId('friend-message')
  expect(StyleSheet.flatten(screen.getByTestId('friend-message').props.style).backgroundColor).toBe(SELECTION.rose.fill)
  expect(screen.queryByText('Remove friend')).toBeNull()
  expect(screen.getByText(PROFILE_EMPTY)).toBeTruthy()
  fireEvent.press(screen.getByLabelText('More'))
  expect(menu().actions.map((a: { label: string }) => a.label)).toEqual(['Remove friend', 'Block', 'Report', 'Cancel'])
})

describe('the about line and the badges (YOU-04): what GET /friends/:id sends, as /user/[id] draws it', () => {
  const FRIEND = {
    ...BEN,
    work_field: 'Design',
    languages: ['Tamil', 'English'],
    homeState: 'Tamil Nadu',
    sign: 'Leo ♌',
    badges: [{ kind: 'shows_up', label: 'Shows up' }],
  }

  it('draws the about line and the badges', async () => {
    api.getFriend.mockResolvedValue({ success: true, data: FRIEND })
    await render(<FriendProfileScreen />)
    expect(await screen.findByLabelText('Badge: Shows up')).toBeTruthy()
    expect(screen.getByLabelText(/Speaks Tamil, English · From Tamil Nadu · Leo/)).toBeTruthy()
  })

  it('an older server that sends none draws neither, and the page stands', async () => {
    api.getFriend.mockResolvedValue({ success: true, data: BEN })
    await render(<FriendProfileScreen />)
    await screen.findByText('Message')
    expect(screen.queryByLabelText(/^Badge:/)).toBeNull()
    expect(screen.queryByLabelText(/Speaks/)).toBeNull()
  })

  it('badges turned off (key absent) draw no Badges section', async () => {
    api.getFriend.mockResolvedValue({ success: true, data: { ...FRIEND, badges: undefined } })
    await render(<FriendProfileScreen />)
    await screen.findByText('Message')
    expect(screen.queryByText('Badges')).toBeNull()
  })
})

describe('the work field is a label, never the stored code (MED-1)', () => {
  beforeEach(() => api.getWorkFields.mockResolvedValue({ success: true, data: { workFields: [{ slug: 'data_ai', label: 'Data & AI' }] } } as never))

  it('maps data_ai to “Data & AI” in the hero line', async () => {
    api.getFriend.mockResolvedValue({ success: true, data: { ...BEN, work_field: 'data_ai' } })
    await render(<FriendProfileScreen />)
    expect(await screen.findByText('Data & AI · Bengaluru')).toBeTruthy()
    expect(screen.queryByText(/data_ai/)).toBeNull()
  })

  it('a code it cannot map is left out, never shown raw', async () => {
    api.getFriend.mockResolvedValue({ success: true, data: { ...BEN, work_field: 'mystery_code' } })
    await render(<FriendProfileScreen />)
    await screen.findByText('Message')
    expect(screen.queryByText(/mystery_code/)).toBeNull()
  })
})

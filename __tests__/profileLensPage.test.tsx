/**
 * Flow 5 C3b (P-A, `pA-page` / `pA-page-named`): a profile opened from a room is the person through the room’s lens.
 * The lead pills and In common are the room’s own card (handed in memory); the Tonight card is the server’s.
 */
import { AccessibilityInfo, StyleSheet } from 'react-native'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'


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
    respondToMessageRequest: jest.fn(),
    sendFriendRequest: jest.fn(),
    sendWave: jest.fn(),
    getSharedEvents: jest.fn(),
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
  ConnectSheet: (p: { visible: boolean; draft?: string; onSend: (m: string) => void }) => {
    const React = require('react')
    const { Pressable, Text } = require('react-native')
    return p.visible
      ? React.createElement(Pressable, { onPress: () => p.onSend('hi') }, React.createElement(Text, null, 'Send request'), p.draft ? React.createElement(Text, null, `draft: ${p.draft}`) : null)
      : null
  },
}))
jest.mock('../components/ds/MomentMatch', () => ({
  MomentMatch: (p: { name: string; onSayHi: () => void; testID?: string }) => {
    const React = require('react')
    const { Pressable, Text } = require('react-native')
    return React.createElement(Pressable, { onPress: p.onSayHi, testID: p.testID }, React.createElement(Text, null, `You and ${p.name} both waved`))
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
  api.getSharedEvents.mockResolvedValue({ success: true, data: { events: [], pagination: { limit: 5, hasMore: false, nextCursor: null, totalCount: 0 } } } as never)
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

it('a venue night with nothing in common: the openers now stand in for r2 A’s quiet line (owner pick state 1 A, SCRUM-1042)', async () => {
  handRoomPerson('rh_bison', card({ workField: null, sharedIntents: [], interests: [] }))
  await open({ ...ANON, tonight: { lens: { key: 'venue_night', question: null }, answer: null, workIntent: null } })
  expect(screen.getByTestId('profile-lens-openers')).toBeTruthy()
  expect(screen.getByText('Nothing on your profiles in common yet.')).toBeTruthy()
  expect(screen.queryByTestId('profile-lens-empty')).toBeNull()
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
  // 07-motion: the hand keeps swinging until ✓ Waved settles at 800 ms, then it is still.
  expect(await screen.findByText('Waved', {}, { timeout: 3000 })).toBeTruthy()
  expect(screen.queryByTestId('profile-wave-hand')).toBeNull()
})

it('the lens page is lit from the top in the room’s rose, as the board’s `.xwash` (drive, C3b)', async () => {
  handRoomPerson('rh_bison', card())
  await open(ANON)
  const wash = screen.getByTestId('profile-lens-wash', { includeHiddenElements: true })
  expect(wash.props.pointerEvents).toBe('none')
  expect(JSON.stringify(screen.toJSON())).toMatch(/#BE5C71|rgba\(190, ?92, ?113/i)
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
  expect(await screen.findByText('Waved', {}, { timeout: 3000 })).toBeTruthy()
})

it('Waved is said when it lands: announced on iOS, the dock a polite live region on Android (drive, TalkBack)', async () => {
  const say = jest.spyOn(AccessibilityInfo, 'announceForAccessibility')
  handRoomPerson('rh_bison', card())
  await open(ANON)
  expect(screen.getByTestId('profile-lens-dock-row').props.accessibilityLiveRegion).toBe('polite')
  expect(say).not.toHaveBeenCalled()
  await fireEvent.press(screen.getByTestId('profile-wave'))
  await waitFor(() => expect(say).toHaveBeenCalledWith('Waved at Gentle Bison'), { timeout: 3000 })
  say.mockRestore()
})

describe('Wave dock A on the page, from the room (SCRUM-1042)', () => {
  it('they waved at you: the chip “Waved at you”, and Wave back is the filled one', async () => {
    handRoomPerson('rh_bison', card({ wave: 'wavedAtYou' }))
    await open(ANON)
    expect(screen.getByText('Waved at you')).toBeTruthy()
    expect(screen.getByText('Wave back')).toBeTruthy()
    expect(screen.getByLabelText('Wave back at Gentle Bison')).toBeTruthy()
  })

  it('a wave back that makes it mutual plays the moment, and the dock is Say hi only', async () => {
    handRoomPerson('rh_bison', card({ wave: 'wavedAtYou' }))
    await open(ANON)
    api.sendWave.mockResolvedValue({ success: true, data: { sent: true, mutual: true, conversationId: 'c7', pseudonyms: { you: 'Swift Gecko', them: 'Gentle Bison' } } } as never)
    await fireEvent.press(screen.getByTestId('profile-wave'))
    expect(await screen.findByTestId('profile-match', {}, { timeout: 3000 })).toBeTruthy()
    // The label swaps on the dock's own transition (#45).
    expect(await screen.findByText('Say hi', {}, { timeout: 2000 })).toBeTruthy()
    expect(screen.queryByTestId('profile-wave')).toBeNull()
  })

  it('after a restart the room has no conversation for them, but the server’s wave.conversationId makes the dock Say hi into it', async () => {
    handRoomPerson('rh_bison', card({ wave: 'waved' }))
    await open({ ...ANON, wave: { conversationId: 'c-restart' } })
    const sayHi = await screen.findByText('Say hi')
    expect(screen.queryByTestId('profile-wave')).toBeNull()
    await fireEvent.press(sayHi)
    const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } }
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/private-chat/[conversationId]', params: expect.objectContaining({ conversationId: 'c-restart' }) }))
    expect(api.sendWave).not.toHaveBeenCalled()
  })

  it('control: with no wave from the server the same card stays ✓ Waved, and there is no Say hi', async () => {
    handRoomPerson('rh_bison', card({ wave: 'waved' }))
    await open(ANON)
    expect(screen.getByTestId('profile-wave')).toBeTruthy()
    expect(screen.queryByText('Say hi')).toBeNull()
  })

  it('already waved: a still ✓ Waved, never Wave again, and nothing is sent', async () => {
    handRoomPerson('rh_bison', card({ wave: 'waved' }))
    await open(ANON)
    expect(screen.getByText('Waved')).toBeTruthy()
    expect(screen.queryByText('Wave again')).toBeNull()
    await fireEvent.press(screen.getByTestId('profile-wave'))
    expect(api.sendWave).not.toHaveBeenCalled()
  })

  it('a rate-limit refusal shows the server’s sender-only sentence, and Wave is offered again', async () => {
    handRoomPerson('rh_bison', card())
    await open(ANON)
    api.sendWave.mockResolvedValue({ success: false, errorCode: 'RATE_LIMITED', error: 'You’ve waved a lot in this room. Try again in a bit.' } as never)
    await fireEvent.press(screen.getByTestId('profile-wave'))
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('You’ve waved a lot in this room. Try again in a bit.', 'info'), { timeout: 3000 })
    expect(screen.getByText('Wave')).toBeTruthy()
  })

  it('a recipient refusal never names them', async () => {
    handRoomPerson('rh_bison', card())
    await open(ANON)
    api.sendWave.mockResolvedValue({ success: false, errorCode: 'RECIPIENT_NOT_HERE', error: 'They’re not in the room right now' } as never)
    await fireEvent.press(screen.getByTestId('profile-wave'))
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('That didn’t go through.', 'info'), { timeout: 3000 })
  })
})

it('outside a room, or with no lens anywhere, it is the profile page it always was', async () => {
  await open({ ...ANON, tonight: undefined }, {}, 'Gentle Bison, 31')
  expect(screen.queryByTestId('profile-lens-hero')).toBeNull()
  expect(screen.getByText('Gentle Bison, 31')).toBeTruthy()
})

describe('state 1 A (SCRUM-1042): a venue night, anonymous, nothing in common', () => {
  const VENUE = { ...ANON, name: 'Fierce Owl', tonight: { lens: { key: 'venue_night', question: null }, answer: null, workIntent: null } }
  const venueCard = (person: object = {}) => ({
    ...card({ workField: null, sharedIntents: [], interests: [], arrivedAt: new Date(Date.now() - 40 * 60_000).toISOString(), ...person }),
    lens: { key: 'venue_night', question: null },
    context: 'At Counter Kitchen',
  })

  it('under the name, where and how long; then the openers card in place of the quiet line', async () => {
    handRoomPerson('rh_bison', venueCard())
    await open(VENUE, { pseudonym: 'Fierce Owl', roomSeed: 'e1:rh_bison' }, 'Fierce Owl')
    const t = tree()
    const seq = ['Fierce Owl', 'Anonymous · 31', 'At Counter Kitchen', 'Here 40 min', 'Nothing on your profiles in common yet.', 'Start with tonight instead.', 'First time here?', 'What’s good here?', 'Who are you here with?', 'An opener goes into Message.', 'profile-wave']
    const idx = seq.map((x) => t.indexOf(x))
    expect(seq.filter((_, i) => idx[i] < 0)).toEqual([])
    expect([...idx].sort((a, b) => a - b)).toEqual(idx)
    expect(screen.queryByText('A wave is the lightest hello.')).toBeNull()
  })

  it('an opener types itself into the Connect sheet, which still asks before your name is shown', async () => {
    handRoomPerson('rh_bison', venueCard())
    await open(VENUE, { pseudonym: 'Fierce Owl', roomSeed: 'e1:rh_bison' }, 'Fierce Owl')
    await fireEvent.press(screen.getByTestId('profile-lens-opener-2'))
    expect(await screen.findByText('draft: Who are you here with?')).toBeTruthy()
    expect(api.createMessageRequest).not.toHaveBeenCalled()
  })

  it('no time pill for a card with no arrival, and no pills at all without a card (controls)', async () => {
    handRoomPerson('rh_bison', venueCard({ arrivedAt: null }))
    await open(VENUE, { pseudonym: 'Fierce Owl', roomSeed: 'e1:rh_bison' }, 'Fierce Owl')
    expect(screen.getByText('At Counter Kitchen')).toBeTruthy()
    expect(screen.queryByText(/^Here /)).toBeNull()
  })

  it('once they have shown you who they are, state 1 is not drawn: no openers (state 2 is its own)', async () => {
    handRoomPerson('rh_bison', venueCard())
    await open({ ...VENUE, name: 'Divya', identityVisible: true, photos: ['https://cdn/d.jpg'] }, {}, 'Divya')
    expect(screen.queryByTestId('profile-lens-openers')).toBeNull()
  })
})

describe('state 2 (SCRUM-1042, the owner-approved combined board): somebody shown to you, with little on their profile', () => {
  const NAMED = {
    ...ANON,
    name: 'Venkatalakshmi',
    identityVisible: true,
    photos: ['https://cdn/v0.jpg', 'https://cdn/v1.jpg', 'https://cdn/v2.jpg'],
    bio: 'Conservation architect. Ask me about the stepwells.',
    interests: ['Heritage walks in Thiruvananthapuram', 'PBKS'],
    occupation: 'Senior Conservation Architect, Kerala State Heritage Board',
    tonight: { lens: WORK, answer: null, workIntent: null },
  }
  const ev = (i: number) => ({ id: `ev${i}`, title: i === 0 ? 'Kerala Design Festival 2026: Late Night Print Fair, Riso Workshop & Closing Party' : `Night ${i}`, startTime: '2026-10-12T14:00:00Z', timezone: 'Asia/Kolkata', venueName: 'Champaca Bookstore', coverImageUrl: null })
  const sharedPage = (n: number, total = n) => ({ success: true, data: { events: Array.from({ length: n }, (_, i) => ev(i)), pagination: { limit: 5, hasMore: total > n, nextCursor: null, totalCount: total } } })
  const named = async (data: object = {}, shared = sharedPage(2)) => {
    handRoomPerson('rh_bison', { ...card({ workField: null, sharedIntents: [], interests: [], arrivedAt: new Date(Date.now() - 40 * 60_000).toISOString() }), context: 'At Counter Kitchen' })
    api.getSharedEvents.mockResolvedValue(shared as never)
    mockParams = { id: 'rh_bison', eventId: 'e1', pseudonym: 'Gentle Bison', roomSeed: 'e1:rh_bison' }
    api.getPublicProfile.mockResolvedValue({ success: true, data: { ...NAMED, ...data } } as never)
    api.getConversations.mockResolvedValue({ success: true, data: [] } as never)
    api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: [] } } as never)
    await render(<UserProfile />)
    await screen.findAllByText('Venkatalakshmi')
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
  }

  it('reads B first (where, how long, the question to ask), the bio, then A (other photos, say hi), then C', async () => {
    await named()
    const t = tree()
    const seq = ['Shown to you · 31', 'At Counter Kitchen', 'Here 40 min', 'Tonight’s question', 'What are you working on?', 'Not answered yet', 'Ask in a message', 'About', 'Conservation architect.', 'Work', 'profile-lens-photos', 'Say hi · ask Venkatalakshmi about', 'You’ve both been to', 'Kerala Design Festival 2026', 'Night 1']
    const idx = seq.map((x) => t.indexOf(x))
    expect(seq.filter((_, i) => idx[i] < 0)).toEqual([])
    expect([...idx].sort((a, b) => a - b)).toEqual(idx)
    // Asked for this room's handle, five at a time.
    expect(api.getSharedEvents).toHaveBeenCalledWith('rh_bison', 5)
    // Two shared: no See all.
    expect(screen.queryByTestId('profile-lens-shared-all')).toBeNull()
  })

  it('their OTHER photos only: the hero is the first, so three photos make a row of two', async () => {
    await named()
    expect(screen.getByTestId('profile-lens-photos-0')).toBeTruthy()
    expect(screen.getByTestId('profile-lens-photos-1')).toBeTruthy()
    expect(screen.queryByTestId('profile-lens-photos-2')).toBeNull()
  })

  it('the question and a say-hi go into the Connect sheet as typed; nothing sends', async () => {
    await named()
    await fireEvent.press(screen.getByTestId('profile-lens-ask'))
    expect(await screen.findByText('draft: What are you working on?')).toBeTruthy()
    expect(api.createMessageRequest).not.toHaveBeenCalled()
  })

  it('say hi is built from their first interest and their work, in the owner’s words', async () => {
    await named()
    await fireEvent.press(screen.getByTestId('profile-lens-say-hi-1'))
    expect(await screen.findByText('draft: Saw Senior Conservation Architect, Kerala State Heritage Board on your profile. How did you get into it?')).toBeTruthy()
  })

  it('twelve shared: five, then See all 12, which opens the list for this handle', async () => {
    await named({}, sharedPage(5, 12))
    expect(screen.getByTestId('profile-lens-shared-4')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('profile-lens-shared-all'))
    const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } }
    expect(router.push).toHaveBeenCalledWith({ pathname: '/shared-events/[id]', params: { id: 'rh_bison', name: 'Venkatalakshmi' } })
  })

  it('none shared and one photo: no card and no row at all (controls for the two above)', async () => {
    await named({ photos: ['https://cdn/v0.jpg'] }, sharedPage(0))
    expect(screen.queryByTestId('profile-lens-shared')).toBeNull()
    expect(screen.queryByTestId('profile-lens-photos')).toBeNull()
    expect(screen.queryByText('You’ve both been to')).toBeNull()
  })

  it('anonymous: shared events are never asked for (state 1’s control)', async () => {
    handRoomPerson('rh_bison', card())
    await open(ANON)
    expect(api.getSharedEvents).not.toHaveBeenCalled()
  })
})

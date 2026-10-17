/**
 * The Blend (Flow 10 · 10.9) against a mocked API: both sides, yours first;
 * names only for whoever revealed in this Blend; the reveal asked for first;
 * the T-60 line; the one plain line when it is closed; and the safety door
 * (block by the Blend's handle, leave) the chat does not offer yet.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'

const mockParams: Record<string, string> = {}
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = require('react')
    useEffect(effect, [effect])
  },
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('../lib/apiClient', () => ({ apiClient: { blockUser: jest.fn(), leaveChatGroup: jest.fn() } }))
jest.mock('../lib/crewsApi', () => ({ crewsApi: { blends: jest.fn(), reveal: jest.fn() } }))
jest.mock('../lib/roomMembership', () => ({ markRoomLeft: jest.fn() }))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
const mockToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }))
let mockCoachVisible = false
jest.mock('../lib/coachMarks', () => ({
  useCoachMark: () => ({ visible: mockCoachVisible }),
  markCoachUsed: jest.fn(),
}))

import { router } from 'expo-router'
import BlendScreen from '../app/blend/[blendId]'
import { apiClient } from '../lib/apiClient'
import { markCoachUsed } from '../lib/coachMarks'
import type { Blend, BlendSide } from '../lib/crews'
import { crewsApi } from '../lib/crewsApi'
import { markRoomLeft } from '../lib/roomMembership'
import { showSheet, type ActionSheet } from '../lib/sheet'

const api = apiClient as jest.Mocked<typeof apiClient>
const crews = crewsApi as jest.Mocked<typeof crewsApi>
const HOUR = 3600_000

const mineCrew = (over: Partial<BlendSide> = {}): BlendSide => ({
  kind: 'crew',
  crewId: 'c2',
  name: 'Two',
  emblemSeed: 's2',
  mine: true,
  count: 3,
  revealed: null,
  keptPrivate: null,
  people: [{ userId: 'me', pseudonym: 'Cosmic Panda', name: 'Sam', photo: 'sam.jpg' }],
  ...over,
})
const theirCrew = (over: Partial<BlendSide> = {}): BlendSide => ({
  kind: 'crew',
  crewId: 'c5',
  name: 'Five',
  emblemSeed: 's5',
  mine: false,
  count: 2,
  revealed: 1,
  keptPrivate: 1,
  people: [
    { userId: 'rh_p2', pseudonym: 'Velvet Heron', name: null, photo: null },
    { userId: 'rh_v', pseudonym: 'Quiet Otter', name: 'Vikram', photo: 'v.jpg' },
  ],
  ...over,
})
const blend = (over: Partial<Blend> = {}): Blend => ({
  blendId: 'b1',
  chatGroupId: 'g1',
  eventId: 'e1',
  closesAt: new Date(Date.now() + 9 * HOUR).toISOString(),
  sides: [mineCrew(), theirCrew()],
  ...over,
})
const serve = (...blends: Blend[]) => crews.blends.mockResolvedValue({ success: true, data: { blends } })
const sheetOf = () => (showSheet as jest.Mock).mock.calls.at(-1)[0] as ActionSheet
const open = async () => {
  await render(<BlendScreen />)
  await waitFor(() => screen.getByText('Blend with Crew Five'))
}

beforeEach(() => {
  jest.clearAllMocks()
  Object.values(crews).forEach((fn) => (fn as jest.Mock).mockReset())
  Object.values(api).forEach((fn) => (fn as jest.Mock).mockReset())
  for (const k of Object.keys(mockParams)) delete mockParams[k]
  mockParams.blendId = 'b1'
  mockCoachVisible = false
})

describe('an open Blend', () => {
  it('names both sides, yours first, with how many are on tonight’s names', async () => {
    serve(blend({ sides: [mineCrew(), theirCrew({ revealed: 0, keptPrivate: 0, people: [theirCrew().people[0], { ...theirCrew().people[1], name: null, photo: null }] })] }))
    await open()
    expect(screen.getByText('5 people · Closes in 9h')).toBeTruthy()
    expect(screen.getByLabelText('Two, 3 on tonight’s names')).toBeTruthy()
    expect(screen.getByLabelText('Five, 2 on tonight’s names')).toBeTruthy()
    expect(screen.getAllByTestId(/^blend-(mine|theirs)$/).map((n) => n.props.testID)).toEqual(['blend-mine', 'blend-theirs'])
  })

  it('names only whoever revealed in this Blend; the one who kept private stays a creature, counted not named', async () => {
    serve(blend())
    await open()
    expect(screen.getByLabelText('Five, 1 revealed · 1 keeps it private')).toBeTruthy()
    // The private one is a neutral +1 tile, never their pseudonym drawn as a name.
    expect(screen.getByText('+1')).toBeTruthy()
    expect(screen.queryByText('Velvet Heron')).toBeNull()
  })

  it('your own side shows what is known and never which crewmate kept private', async () => {
    serve(blend())
    await open()
    expect(screen.queryByText(/keeps? it private/, { exact: false })).toBeTruthy()
    expect(within(screen.getByTestId('blend-mine')).queryByText(/keeps? it private/)).toBeNull()
    expect(within(screen.getByTestId('blend-mine')).getByText(/3 on tonight’s names/)).toBeTruthy()
  })

  it('uses the whole picture of your side when the server sends it', async () => {
    serve(
      blend({
        sides: [
          mineCrew({
            count: 2,
            revealed: 1,
            keptPrivate: 1,
            people: [
              { userId: 'me', pseudonym: 'Cosmic Panda', name: 'Sam', photo: 'sam.jpg' },
              { userId: 'rh_x', pseudonym: 'Brave Turtle', name: null, photo: null },
            ],
          }),
          theirCrew(),
        ],
      })
    )
    await open()
    expect(screen.getByLabelText('Two, 1 revealed · 1 keeps it private')).toBeTruthy()
  })
})

describe('revealing', () => {
  it('asks first, naming the crew and how many will see, and sends nothing until it is confirmed', async () => {
    serve(blend())
    crews.reveal.mockResolvedValue({ success: true, data: { revealed: true } })
    await open()
    await fireEvent.press(screen.getByLabelText('Reveal my crew'))
    expect(screen.getByText('Reveal Two to this Blend?')).toBeTruthy()
    expect(screen.getByText(/shown by first name and one photo to the 5 people in this Blend/)).toBeTruthy()
    expect(screen.getByText('You can’t undo a reveal.')).toBeTruthy()
    expect(crews.reveal).not.toHaveBeenCalled()
    await fireEvent.press(screen.getByLabelText('Reveal Two'))
    await waitFor(() => expect(crews.reveal).toHaveBeenCalledWith('b1'))
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Your crew is revealed', 'success'))
    // Revealed: the action is a settled "Revealed", and the line says so.
    await waitFor(() => expect(screen.queryByLabelText('Reveal my crew')).toBeNull())
    expect(screen.getByLabelText('Two, Revealed')).toBeTruthy()
  })

  it('a solo person reveals themselves', async () => {
    serve(
      blend({
        sides: [
          { ...mineCrew(), kind: 'person', crewId: null, name: null, emblemSeed: null, count: 1 },
          theirCrew(),
        ],
      })
    )
    await render(<BlendScreen />)
    // One person facing a crew: "Blend with Five", not "Crew Five" (flow10b.js `blendRoom`, solo).
    await waitFor(() => screen.getByText('Blend with Five'))
    await fireEvent.press(screen.getByLabelText('Reveal me'))
    expect(screen.getByText('Reveal yourself to this Blend?')).toBeTruthy()
  })

  it('two taps on Reveal in the same render send one reveal', async () => {
    serve(blend())
    let finish: (v: unknown) => void = () => {}
    crews.reveal.mockReturnValue(new Promise((r) => (finish = r)) as never)
    await open()
    await fireEvent.press(screen.getByLabelText('Reveal my crew'))
    const confirm = screen.getByLabelText('Reveal Two')
    await act(async () => {
      void fireEvent.press(confirm)
      void fireEvent.press(confirm)
    })
    expect(crews.reveal).toHaveBeenCalledTimes(1)
    await act(async () => finish({ success: true, data: { revealed: true } }))
  })

  it('a reveal the server refuses says so and leaves the action', async () => {
    serve(blend())
    crews.reveal.mockResolvedValue({ success: false, error: 'Blend not found', errorCode: 'CHAT_CLOSED' })
    await open()
    await fireEvent.press(screen.getByLabelText('Reveal my crew'))
    await fireEvent.press(screen.getByLabelText('Reveal Two'))
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('This Blend has closed.', 'error'))
    expect(screen.getByLabelText('Reveal my crew')).toBeTruthy()
  })

  it('a crew the server says has already revealed has no Reveal', async () => {
    serve(blend({ sides: [mineCrew({ crewRevealed: true }), theirCrew()] }))
    await open()
    expect(screen.queryByLabelText('Reveal my crew')).toBeNull()
    expect(screen.getByLabelText('Two, Revealed')).toBeTruthy()
  })
})

describe('closing and closed', () => {
  it('in the last hour it says when it closes, quietly', async () => {
    serve(blend({ closesAt: new Date(Date.now() + 30 * 60_000).toISOString() }))
    await open()
    expect(screen.getByText(/^This Blend closes at \d{1,2}(:\d\d)? (am|pm)$/)).toBeTruthy()
    expect(screen.getByText('5 people · Closes in 30m')).toBeTruthy()
  })

  it('earlier than that it says nothing', async () => {
    serve(blend())
    await open()
    expect(screen.queryByText(/^This Blend closes at/)).toBeNull()
  })

  it('one that is not open reads closed, with no reason, and leads back to the Banter', async () => {
    mockParams.blendId = 'gone'
    serve(blend())
    await render(<BlendScreen />)
    await waitFor(() => screen.getByText('This Blend has closed'))
    await fireEvent.press(screen.getByLabelText('Back to Banter'))
    expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/chat')
  })

  it('one whose clock ran out while you looked reads closed too', async () => {
    serve(blend({ closesAt: new Date(Date.now() - 1000).toISOString() }))
    await render(<BlendScreen />)
    await waitFor(() => screen.getByText('This Blend has closed'))
  })

  it('M6: a failed read is not a closed Blend, and offers the retry', async () => {
    crews.blends.mockResolvedValueOnce({ success: false, error: 'No internet connection.' })
    await render(<BlendScreen />)
    await waitFor(() => screen.getByText('This Blend didn’t load'))
    expect(screen.queryByText('This Blend has closed')).toBeNull()
    serve(blend())
    await fireEvent.press(screen.getByLabelText('Try again'))
    await waitFor(() => screen.getByText('Blend with Crew Five'))
  })

  it('while it loads there is a skeleton, not a closed Blend', async () => {
    crews.blends.mockReturnValue(new Promise(() => {}) as never)
    await render(<BlendScreen />)
    expect(screen.getByLabelText('Loading the Blend')).toBeTruthy()
    expect(screen.queryByText('This Blend has closed')).toBeNull()
  })
})

describe('around the room', () => {
  it('Open the chat goes to its room; opened from the chat, it is not offered (Back is the way)', async () => {
    serve(blend())
    await open()
    await fireEvent.press(screen.getByLabelText('Open the chat'))
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/chat/[id]',
      params: { id: 'g1', roomName: 'Blend with Crew Five', kind: 'blend', blendId: 'b1' },
    })
  })

  it('is not offered when opened from the chat', async () => {
    mockParams.fromChat = '1'
    serve(blend())
    await open()
    expect(screen.queryByLabelText('Open the chat')).toBeNull()
  })

  it('the first time anyone opens a Blend, a card says what it is; Got it spends it', async () => {
    mockCoachVisible = true
    serve(blend())
    await open()
    expect(screen.getByText('Blend with Crew Five · 5 people')).toBeTruthy()
    expect(screen.getByText(/Made tonight · closes \d{1,2}(:\d\d)? (am|pm)\. Everyone here is on tonight’s names until they reveal\./)).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Got it'))
    expect(markCoachUsed).toHaveBeenCalledWith('blend_first_open')
  })

  it('no card once it has been seen', async () => {
    serve(blend())
    await open()
    expect(screen.queryByTestId('blend-first-open')).toBeNull()
  })

  it('leaving marks the room left on this phone, so its chat offers Rejoin rather than "closed"', async () => {
    serve(blend())
    api.leaveChatGroup.mockResolvedValue({ success: true, data: { chatGroupId: 'g1', left: true } })
    await open()
    await fireEvent.press(screen.getByLabelText('More'))
    await fireEvent.press(within(screen.getByTestId('blend-menu')).getByLabelText('Leave this Blend'))
    const sheet = sheetOf()
    expect(sheet.title).toBe('Leave this Blend?')
    await (sheet.actions.find((a) => a.label === 'Leave') as { run: () => Promise<unknown> }).run()
    expect(api.leaveChatGroup).toHaveBeenCalledWith('g1')
    expect(markRoomLeft).toHaveBeenCalledWith('g1')
    expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/chat')
  })

  it('blocks somebody on the other side by their handle in this Blend, picked from a list that has only them', async () => {
    serve(blend())
    api.blockUser.mockResolvedValue({ success: true, data: { blocked: true } })
    await open()
    await fireEvent.press(screen.getByLabelText('More'))
    await fireEvent.press(within(screen.getByTestId('blend-menu')).getByLabelText('Block someone'))
    const pick = sheetOf()
    expect(pick.title).toBe('Block someone')
    // Their side by what the Blend shows of them: a revealed first name, or tonight's name. Not your crew.
    expect(pick.actions.map((a) => a.label)).toEqual(['Velvet Heron', 'Vikram', 'Cancel'])
    const next = (pick.actions.find((a) => a.label === 'Velvet Heron') as { next: () => ActionSheet }).next()
    expect(next.title).toBe('Block Velvet Heron?')
    expect(api.blockUser).not.toHaveBeenCalled()
    expect(await (next.actions.find((a) => a.label === 'Block') as { run: () => Promise<unknown> }).run()).toEqual({
      ok: true,
      toast: 'Velvet Heron is blocked',
    })
    expect(api.blockUser).toHaveBeenCalledWith('rh_p2')
  })

  it('M8: a second block while the first is in flight sends nothing', async () => {
    serve(blend())
    let finish: (v: unknown) => void = () => {}
    api.blockUser.mockReturnValue(new Promise((r) => (finish = r)) as never)
    await open()
    await fireEvent.press(screen.getByLabelText('More'))
    await fireEvent.press(within(screen.getByTestId('blend-menu')).getByLabelText('Block someone'))
    const next = (sheetOf().actions.find((a) => a.label === 'Velvet Heron') as { next: () => ActionSheet }).next()
    const run = (next.actions.find((a) => a.label === 'Block') as { run: () => Promise<unknown> }).run
    const first = run()
    await run()
    expect(api.blockUser).toHaveBeenCalledTimes(1)
    await act(async () => {
      finish({ success: true, data: { blocked: true } })
      await first
    })
  })
})

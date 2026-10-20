/**
 * The Blend room's chrome (Flow 10 · 10.9, inside the room screen) against a mocked
 * API: both sides, yours first; names only for whoever revealed in this Blend; the
 * reveal asked for first, with no head-count in its sentence; the T-60 line; nothing
 * drawn for a Blend that is not open; and the safety door (block, leave) the chat
 * does not offer yet.
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
jest.mock('../lib/apiClient', () => ({
  apiClient: { blockUser: jest.fn(), leaveChatGroup: jest.fn(), getEvent: jest.fn(async () => ({ success: true, data: { venueName: 'Toit' } })) },
}))
jest.mock('../lib/crewsApi', () => ({ crewsApi: { blends: jest.fn(), reveal: jest.fn() } }))
jest.mock('../lib/roomMembership', () => ({ markRoomLeft: jest.fn() }))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
// A new account each test: what a phone remembers of reveals is per account.
let mockUserId = 'me'
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: mockUserId } }) }))
const mockToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }))
let mockCoachVisible = false
jest.mock('../lib/coachMarks', () => ({
  useCoachMark: () => ({ visible: mockCoachVisible }),
  markCoachUsed: jest.fn(),
}))

import { router } from 'expo-router'
import { Text, View } from 'react-native'
import { useBlendRoom } from '../components/crews/BlendRoom'
import { apiClient } from '../lib/apiClient'
import { markCoachUsed } from '../lib/coachMarks'
import type { Blend, BlendSide } from '../lib/crews'
import { crewsApi } from '../lib/crewsApi'
import { markRoomLeft } from '../lib/roomMembership'
import { noteServerDate } from '../lib/serverClock'
import { showSheet, type ActionSheet } from '../lib/sheet'

/** The room screen, reduced to what it takes from the hook. */
function Room({ id = 'b1' }: { id?: string }) {
  const room = useBlendRoom(id, 0)
  return (
    <View>
      {room.title ? <Text>{room.title}</Text> : null}
      {room.leading}
      {room.subtitle}
      {room.bar}
      {room.blend ? (
        <Text accessibilityRole="button" accessibilityLabel="More" onPress={room.openMenu}>
          more
        </Text>
      ) : null}
      {room.overlays}
      {room.gone ? <Text testID="gone">gone</Text> : null}
      <Text testID="space">{String(room.barSpace)}</Text>
    </View>
  )
}

const api = apiClient as jest.Mocked<typeof apiClient>
const crews = crewsApi as jest.Mocked<typeof crewsApi>
const HOUR = 3600_000
let accounts = 0

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
  // The real shape: your own side carries the flag, and it is false until your crew reveals.
  crewRevealed: false,
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
  await render(<Room />)
  await waitFor(() => screen.getByText('Blend with Crew Five'))
}

beforeEach(() => {
  jest.clearAllMocks()
  Object.values(crews).forEach((fn) => (fn as jest.Mock).mockReset())
  Object.values(api).forEach((fn) => (fn as jest.Mock).mockReset())
  for (const k of Object.keys(mockParams)) delete mockParams[k]
  mockParams.blendId = 'b1'
  mockCoachVisible = false
  mockUserId = `me-${++accounts}`
  api.getEvent.mockResolvedValue({ success: true, data: { venueName: 'Toit' } } as never)
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
})

describe('revealing', () => {
  it('asks first, naming the crew, with no head-count (the server leaves out anyone with show-online off), and sends nothing until it is confirmed', async () => {
    serve(blend())
    crews.reveal.mockResolvedValue({ success: true, data: { revealed: true } })
    await open()
    await fireEvent.press(screen.getByLabelText('Reveal my crew'))
    expect(screen.getByText('Reveal Two to this Blend?')).toBeTruthy()
    expect(screen.getByText(/shown by first name and one photo to the people in this Blend — and nobody else/)).toBeTruthy()
    expect(screen.queryByText(/to the \d+ people/)).toBeNull()
    expect(screen.getByText('You can’t undo a reveal.')).toBeTruthy()
    expect(crews.reveal).not.toHaveBeenCalled()
    await fireEvent.press(screen.getByLabelText('Reveal Two'))
    await waitFor(() => expect(crews.reveal).toHaveBeenCalledWith('b1'))
    // No toast: its "N revealed · M keep it private" needs server counts that do not exist yet.
    expect(mockToast).not.toHaveBeenCalled()
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
    await render(<Room />)
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

  it('a reveal made here is not offered again after the room is reopened, even before the server sends the flag', async () => {
    serve(blend())
    crews.reveal.mockResolvedValue({ success: true, data: { revealed: true } })
    await open()
    await fireEvent.press(screen.getByLabelText('Reveal my crew'))
    await fireEvent.press(screen.getByLabelText('Reveal Two'))
    await waitFor(() => expect(screen.queryByLabelText('Reveal my crew')).toBeNull())
    await screen.unmount()
    // The server's side is still unmarked (no `crewRevealed`): the phone remembers.
    serve(blend({ sides: [{ ...mineCrew(), crewRevealed: undefined }, theirCrew()] }))
    await open()
    expect(screen.queryByLabelText('Reveal my crew')).toBeNull()
  })

  it('without the flag, a crew that has not revealed is still offered Reveal', async () => {
    serve(blend({ sides: [{ ...mineCrew(), crewRevealed: undefined }, theirCrew()] }))
    await open()
    expect(screen.getByLabelText('Reveal my crew')).toBeTruthy()
  })

  it('a crew the server says has already revealed has no Reveal', async () => {
    serve(blend({ sides: [mineCrew({ crewRevealed: true }), theirCrew()] }))
    await open()
    expect(screen.queryByLabelText('Reveal my crew')).toBeNull()
    expect(screen.getByLabelText('Two, Revealed')).toBeTruthy()
  })
})

describe('the Blend closes on the server’s clock, not the phone’s', () => {
  afterEach(() => noteServerDate(new Date().toUTCString()))

  it('a phone that runs slow does not keep a closed Blend open', async () => {
    // By the phone it closes in 30 minutes; the server is an hour ahead, so it has closed.
    serve(blend({ closesAt: new Date(Date.now() + 30 * 60_000).toISOString() }))
    noteServerDate(new Date(Date.now() + 60 * 60_000).toUTCString())
    await render(<Room />)
    await waitFor(() => expect(crews.blends).toHaveBeenCalled())
    expect(screen.queryByTestId('blend-mine')).toBeNull()
  })

  it('a phone that runs fast does not close a Blend early', async () => {
    // By the phone it closed a minute ago; the server is two minutes behind, so it is still open.
    serve(blend({ closesAt: new Date(Date.now() - 60_000).toISOString() }))
    noteServerDate(new Date(Date.now() - 120_000).toUTCString())
    await render(<Room />)
    await waitFor(() => screen.getByTestId('blend-mine'))
  })

  it('reads the shared clock hook, not a clock of its own', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../components/crews/BlendRoom.tsx'), 'utf8')
    expect(src).toMatch(/useNow\(/)
    expect(src).not.toMatch(/setInterval/)
  })
})

describe('closing and closed', () => {
  it('in the last hour it says when it closes, quietly', async () => {
    serve(blend({ closesAt: new Date(Date.now() + 30 * 60_000).toISOString() }))
    await open()
    expect(screen.getByText(/^This Blend closes at \d{1,2}(:\d\d)? (am|pm)$/)).toBeTruthy()
    expect(screen.getByText('Closes in 30m')).toBeTruthy()
  })

  it('earlier than that it says nothing', async () => {
    serve(blend())
    await open()
    expect(screen.queryByText(/^This Blend closes at/)).toBeNull()
  })

  it('one that is not open draws nothing: the room says it is closed', async () => {
    serve(blend())
    await render(<Room id="gone" />)
    await waitFor(() => expect(crews.blends).toHaveBeenCalled())
    expect(screen.queryByTestId('blend-mine')).toBeNull()
    expect(screen.getByTestId('space').children.join('')).toBe('0')
  })

  it('one whose clock ran out while you looked draws nothing too', async () => {
    serve(blend({ closesAt: new Date(Date.now() - 1000).toISOString() }))
    await render(<Room />)
    await waitFor(() => expect(crews.blends).toHaveBeenCalled())
    expect(screen.queryByTestId('blend-mine')).toBeNull()
  })

  it('a Blend that was listed and then is not (a block across the sides refuses your door) is gone for you, and its chrome goes', async () => {
    serve(blend())
    api.blockUser.mockResolvedValue({ success: true, data: { blocked: true } })
    await open()
    expect(screen.queryByTestId('gone')).toBeNull()
    await fireEvent.press(screen.getByLabelText('More'))
    await fireEvent.press(within(screen.getByTestId('blend-menu')).getByLabelText('Block someone'))
    const next = (sheetOf().actions.find((a) => a.label === 'Velvet Heron') as { next: () => ActionSheet }).next()
    // The server's answer from now on: the blocker's door is refused, so the list no longer has it.
    serve()
    await act(async () => {
      await (next.actions.find((a) => a.label === 'Block') as { run: () => Promise<unknown> }).run()
    })
    await waitFor(() => screen.getByTestId('gone'))
    expect(screen.queryByTestId('blend-mine')).toBeNull()
  })

  it('never listed is not gone: a Blend that never loaded is not a closed one', async () => {
    serve()
    await render(<Room />)
    await waitFor(() => expect(crews.blends).toHaveBeenCalled())
    expect(screen.queryByTestId('gone')).toBeNull()
  })

  it('a failed re-read keeps the Blend: a network error is not a closing', async () => {
    serve(blend())
    api.blockUser.mockResolvedValue({ success: true, data: { blocked: true } })
    await open()
    await fireEvent.press(screen.getByLabelText('More'))
    await fireEvent.press(within(screen.getByTestId('blend-menu')).getByLabelText('Block someone'))
    const next = (sheetOf().actions.find((a) => a.label === 'Velvet Heron') as { next: () => ActionSheet }).next()
    crews.blends.mockResolvedValue({ success: false, error: 'No internet connection.' })
    await act(async () => {
      await (next.actions.find((a) => a.label === 'Block') as { run: () => Promise<unknown> }).run()
    })
    await waitFor(() => expect(crews.blends).toHaveBeenCalledTimes(2))
    expect(screen.queryByTestId('gone')).toBeNull()
    expect(screen.getByTestId('blend-mine')).toBeTruthy()
  })

  it('M6: a failed read is not a closed Blend: nothing is drawn, and nothing claims it closed', async () => {
    crews.blends.mockResolvedValueOnce({ success: false, error: 'No internet connection.' })
    await render(<Room />)
    await waitFor(() => expect(crews.blends).toHaveBeenCalled())
    expect(screen.queryByText(/closed/i)).toBeNull()
  })
})

describe('around the room', () => {
  it('the header takes both emblems and the clock in Geist Mono beside the head-count', async () => {
    serve(blend())
    await open()
    expect(screen.getByText(/^5 people · /)).toBeTruthy()
    expect(screen.getByText('Closes in 9h')).toBeTruthy()
  })

  it('the first time anyone opens a Blend, a card says what it is; Got it spends it', async () => {
    mockCoachVisible = true
    serve(blend())
    await open()
    expect(screen.getByText('Blend with Crew Five · 5 people')).toBeTruthy()
    await waitFor(() => screen.getByText(/Made at Toit · closes \d{1,2}(:\d\d)? (am|pm)\. Everyone here is on tonight’s names until they reveal\./))
    // The buttons are the 48 pt size.
    await fireEvent.press(screen.getByLabelText('Got it'))
    expect(markCoachUsed).toHaveBeenCalledWith('blend_first_open')
  })

  it('the card leaves with a fade rather than a cut (audit L12)', async () => {
    mockCoachVisible = true
    serve(blend())
    await open()
    expect(screen.getByTestId('blend-first-open').props.exiting).toBeDefined()
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

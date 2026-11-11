/**
 * The Room, every state Flow 4 draws (guidelines/flow-4 "Blend’n · Room",
 * R3-0, R2-D1): the hero (Live, the count, the stack, your face in the ring),
 * the visibility line, People | Crews, Meet next and its clock, Everyone here,
 * Show N more, the empty room, the status banners, and the one-row chat dock
 * in each of its states.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Text } from 'react-native'

import { RoomView, type RoomViewProps } from '../components/blendn/RoomView'
import { RoomYouCard } from '../components/blendn/RoomSections'
import type { Visibility } from '../components/ds/Banner'
import type { RoomPerson } from '../lib/useRoom'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}))
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
const mockStage = { scrolled: false, atTop: jest.fn() }
const mockMaterialMounts = { count: 0 }
jest.mock('../components/ui/Material', () => {
  const { useEffect } = jest.requireActual('react')
  const { View } = jest.requireActual('react-native')
  return {
    Material: ({ role: _role, ...rest }: Record<string, unknown>) => {
      useEffect(() => {
        mockMaterialMounts.count += 1
      }, [])
      return <View {...rest} />
    },
  }
})
jest.mock('../components/blendn/RoomStage', () => ({
  useStageScroll: () => ({ onScroll: undefined, native: {}, scrollEventThrottle: 16, scrolled: mockStage.scrolled, atTop: mockStage.atTop }),
}))
let mockNetwork = 'online'
jest.mock('../lib/networkStatus', () => ({ getNetworkState: () => mockNetwork, subscribeNetworkState: () => () => {} }))
const mockMessageListeners: ((d: unknown) => void)[] = []
jest.mock('../lib/socketClient', () => ({
  connect: jest.fn(),
  subscribeToChatMessage: (_id: string, fn: (d: unknown) => void) => {
    mockMessageListeners.push(fn)
    return () => {}
  },
}))
const mockHistory = jest.fn()
jest.mock('../lib/apiClient', () => ({ apiClient: { getChatMessages: (...a: unknown[]) => mockHistory(...a) } }))
let mockLeft = new Set<string>()
jest.mock('../lib/roomMembership', () => ({ useRoomMembership: () => ({ left: mockLeft }) }))

const HIDDEN = { includeHiddenElements: true }
const person = (id: string, o: Partial<RoomPerson> = {}): RoomPerson =>
  ({
    id,
    name: `Person ${id}`,
    photo: null,
    interests: [],
    sharedIntents: [],
    sharedWorkField: false,
    workField: null,
    sharedEvents: 0,
    sharedPlans: 0,
    overlaps: [],
    sign: null,
    badges: [],
    insideNow: true,
    arrivedAt: null,
    liked: false,
    matched: false,
    conversationId: null,
    requested: false,
    pending: false,
    reason: '',
    raw: {} as never,
    ...o,
  }) as RoomPerson

const roomElement = (props: Partial<RoomViewProps> = {}) => (
    <RoomView
      people={Array.from({ length: 13 }, (_, i) => person(`p${i}`))}
      connection={{ state: 'connected' } as never}
      you={<Text>you card</Text>}
      crewsHere={null}
      view="people"
      onView={jest.fn()}
      crewCards={[]}
      renderCrew={() => null}
      picks={[person('p0'), person('p1'), person('p2')]}
      nextShuffleAt={Date.now() + 252_000}
      everyoneTitle="Everyone here"
      everyoneCount={13}
      hasMore={false}
      loadingMore={false}
      moreCount={null}
      onMore={jest.fn()}
      arrivingIds={new Set()}
      waveKeys={{}}
      onOpen={jest.fn()}
      onLike={jest.fn()}
      enter={false}
      topInset={124}
      bottomInset={34}
      {...props}
    />
)
const room = (props: Partial<RoomViewProps> = {}) => render(roomElement(props))

beforeEach(() => {
  mockNetwork = 'online'
  mockLeft = new Set()
  mockMessageListeners.length = 0
  mockHistory.mockResolvedValue({ success: true, data: [] })
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false)
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false)
})

describe('People, top down (Flow 5 R-A: no hero; the bar has the name and the count)', () => {
  it('you first, then Meet next, the friends row, Everyone here', async () => {
    await room({ friendsHere: <Text>friends row</Text> })
    // getAllByText returns in tree order, which is the screen's order top down.
    const order = screen.getAllByText(/^(you card|Meet next|friends row|Everyone here)$/).map((el) => el.props.children)
    expect(order).toEqual(['you card', 'Meet next', 'friends row', 'Everyone here'])
    expect(screen.queryByText('Live')).toBeNull()
  })

  it('just you: the you-card and the empty room (#02), no Meet next', async () => {
    await room({ people: [], picks: [], everyoneCount: 0 })
    expect(screen.getByText('you card')).toBeTruthy()
    expect(screen.getByText('Nobody else is here yet')).toBeTruthy()
    expect(screen.queryByText('Meet next')).toBeNull()
    // "Show more" never offers a page of nobody.
    expect(screen.queryByTestId('room-show-more')).toBeNull()
  })
})

describe('the you-card (R-A youCard merged with the old hero: you, your time in, who is here; Change goes to Room settings)', () => {
  const T0 = Date.parse('2026-11-11T18:00:00Z')
  const others = [
    { kind: 'creature', pseudonym: 'Lunar Fox' },
    { kind: 'photo', uri: 'https://x/p2.jpg' },
  ] as const
  const you = (state: Visibility, extra: Partial<React.ComponentProps<typeof RoomYouCard>> = {}, onChange = jest.fn()) =>
    render(
      <RoomYouCard
        face={{ kind: 'creature', pseudonym: 'Quiet Lynx' }}
        name="Quiet Lynx"
        self={{ name: 'Venkatalakshmi Subramaniam', face: { kind: 'photo', uri: 'https://x/me.jpg' } }}
        checkedInAt={new Date(T0 - 80 * 60_000).toISOString()}
        hereCount={12_480}
        others={[...others]}
        now={T0}
        state={state}
        onChange={onChange}
        {...extra}
      />
    )

  it('your own name and photo lead it, with your time in on the ring and who else is here', async () => {
    await you('anon')
    expect(screen.getByText('Venkatalakshmi Subramaniam')).toBeTruthy()
    // The ring is decoration to a screen reader (its label says the time), so the face is under hidden elements.
    expect(screen.getByTestId('room-you-face', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByLabelText('You, in the room 1h 20m')).toBeTruthy()
    // Compact in the line, exact to a screen reader.
    expect(screen.getByText('You and 12k others here')).toBeTruthy()
    expect(screen.getByLabelText('You and 12,479 others here')).toBeTruthy()
  })

  it('anonymous: says what the others see, your room name, and Change', async () => {
    const onChange = jest.fn()
    await you('anon', {}, onChange)
    expect(screen.getByLabelText('Others here see you as Quiet Lynx. Nobody here sees your name or photo.')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Change your room name and who sees you' }))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('named, and not listed: each says so; not listed offers Turn on', async () => {
    await you('named', { name: 'Venkatalakshmi' })
    expect(screen.getByText('Others here see your name and photo.')).toBeTruthy()
    await you('hidden')
    expect(screen.getByText('Turn on')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Turn on Show online status' })).toBeTruthy()
  })

  it('just you: no pile, and the line says so; no check-in time yet: the ring says In the room', async () => {
    await you('anon', { hereCount: 1, others: [], checkedInAt: null })
    expect(screen.getByText('Just you so far')).toBeTruthy()
    expect(screen.queryByTestId('room-you-pile')).toBeNull()
    expect(screen.getByLabelText('You, in the room')).toBeTruthy()
  })

  it('control: one other is "1 other", not "1 others"', async () => {
    await you('anon', { hereCount: 2, others: [others[0]] })
    expect(screen.getByText('You and 1 other here')).toBeTruthy()
  })
})

describe('the sections', () => {
  it('Meet next: three cards, "New picks in 4:12", the card opens them and the heart likes them', async () => {
    const onOpen = jest.fn()
    const onLike = jest.fn()
    await room({ onOpen, onLike })
    expect(screen.getByText('New picks in 4:12')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('meet-next-1'))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }))
    await fireEvent.press(screen.getByTestId('meet-next-2-like', HIDDEN))
    expect(onLike).toHaveBeenCalledWith(expect.objectContaining({ id: 'p2' }))
  })

  it('Flow 5 P-A: a pick says their answer to tonight’s question, quoted; without one, what the lens leads with', async () => {
    const work = { key: 'work', question: 'What are you working on?' }
    await room({
      lens: work,
      picks: [
        person('p0', { tonightAnswer: 'A map of every quiet café in Toronto' }),
        person('p1', { workField: 'Product design', sharedIntents: ['networking'] }),
        person('p2', { reason: 'Just walked in' }),
      ],
    })
    expect(screen.getByLabelText('Person p0, “A map of every quiet café in Toronto”')).toBeTruthy()
    expect(screen.getByLabelText('Person p1, Product design · Here for work')).toBeTruthy()
    // Nothing through the lens: the room's own reason line, as before.
    expect(screen.getByTestId('meet-next-2').props.accessibilityLabel).not.toContain('·')
  })

  it('a screen reader likes through the card’s Like action', async () => {
    const onLike = jest.fn()
    await room({ onLike })
    await fireEvent(screen.getByTestId('meet-next-0'), 'accessibilityAction', { nativeEvent: { actionName: 'like' } })
    expect(onLike).toHaveBeenCalledWith(expect.objectContaining({ id: 'p0' }))
  })

  it('a like that must ask first: the heart opens their card instead', async () => {
    const onOpen = jest.fn()
    await room({ onOpen, onLike: null })
    await fireEvent.press(screen.getByTestId('meet-next-0-like', HIDDEN))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'p0' }))
  })

  it('liked already: the heart is lit and never likes again (a tap there is the card’s)', async () => {
    const onLike = jest.fn()
    await room({ onLike, picks: [person('p0'), person('p1', { liked: true }), person('p2')] })
    expect(screen.getByTestId('meet-next-1-like', HIDDEN).props.accessibilityState?.disabled ?? true).toBe(true)
    await fireEvent.press(screen.getByTestId('meet-next-1-like', HIDDEN))
    expect(onLike).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/Person p1, .*liked/)).toBeTruthy()
  })

  it('Everyone here says the exact count: 12,480, never 12k (the bar is where it is compact)', async () => {
    await room({ everyoneCount: 12480 })
    expect(screen.getByTestId('everyone-head-count')).toHaveTextContent('12,480')
  })

  it('Everyone here · 13, a face per person, tap opens the card', async () => {
    jest.useFakeTimers()
    const onOpen = jest.fn()
    await room({ onOpen, onLike: null })
    expect(screen.getByTestId('everyone-head-count')).toHaveTextContent('13')
    await fireEvent.press(screen.getByTestId('room-face-4'))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'p4' }))
    jest.useRealTimers()
  })

  it('Show 20 more when the room is bigger than the page (#04)', async () => {
    const onMore = jest.fn()
    await room({ hasMore: true, moreCount: 20, onMore })
    await fireEvent.press(screen.getByRole('button', { name: 'Show 20 more' }))
    expect(onMore).toHaveBeenCalled()
  })

  it('a wave from someone rings their face (#51)', async () => {
    await room({ waveKeys: { p3: Date.now() } })
    expect(screen.getByTestId('room-face-3-wave-ring', HIDDEN)).toBeTruthy()
  })
})

describe('Crews as a row, like friends here (audit A-1: one tab row in the room, never a second switch)', () => {
  it('no second People | Crews switch, ever', async () => {
    await room({ crewsHere: 3 })
    expect(screen.queryByTestId('room-segments')).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Crews' })).toBeNull()
  })

  it('"3 crews here" opens the crews; control: no crew here and none of yours draws no row', async () => {
    const onView = jest.fn()
    await room({ crewsHere: 3, onView })
    await fireEvent.press(screen.getByRole('button', { name: '3 crews here' }))
    expect(onView).toHaveBeenCalledWith('crews')
    await room({ crewsHere: null })
    expect(screen.queryByTestId('room-crews-row')).toBeNull()
  })

  it('one crew is "1 crew here"; only yours (none other here) is "Your crews"', async () => {
    await room({ crewsHere: 1 })
    expect(screen.getByRole('button', { name: '1 crew here' })).toBeTruthy()
    await room({ crewsHere: 0 })
    expect(screen.getByRole('button', { name: 'Your crews' })).toBeTruthy()
  })

  it('the Crews view: its head and cards in place of Meet next, and a way back to everyone', async () => {
    const onView = jest.fn()
    const card = { crewId: 'c1', name: 'Orbit' } as never
    await room({ crewsHere: 1, view: 'crews', onView, crewsHead: <Text>crews head</Text>, crewCards: [card], renderCrew: () => <Text>crew Orbit</Text> })
    expect(screen.getByText('crews head')).toBeTruthy()
    expect(screen.getByText('crew Orbit')).toBeTruthy()
    expect(screen.queryByText('Meet next')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Back to everyone here' }))
    expect(onView).toHaveBeenCalledWith('people')
  })
})

describe('the status banners (#12, #13)', () => {
  it('offline: the destructive line', async () => {
    mockNetwork = 'offline'
    await room()
    expect(screen.getByText('Offline. Some actions won’t work until you’re back.')).toBeTruthy()
  })

  it('a socket down past its grace: "Updates paused." with Try again', async () => {
    jest.useFakeTimers()
    await room({ connection: { state: 'disconnected' } as never })
    expect(screen.queryByText('Updates paused. Trying to reconnect.')).toBeNull()
    await act(async () => jest.advanceTimersByTime(3000))
    expect(screen.getByText('Updates paused. Trying to reconnect.')).toBeTruthy()
    jest.useRealTimers()
  })
})

describe('where the list holds its place (found in SCRUM-502)', () => {
  it('at the top it does not, so a header that grows keeps the title on screen', async () => {
    mockStage.scrolled = false
    await room()
    expect(screen.getByTestId('room').props.maintainVisibleContentPosition).toBeUndefined()
  })
  it('scrolled, it does: nothing moves under a thumb', async () => {
    mockStage.scrolled = true
    await room()
    expect(screen.getByTestId('room').props.maintainVisibleContentPosition).toBeTruthy()
    mockStage.scrolled = false
  })
})

describe('switching People and Crews', () => {
  it('reports the new list at its top, so the old offset does not count as scrolled', async () => {
    const view = await room({ view: 'people' })
    mockStage.atTop.mockClear()
    await view.rerender(roomElement({ view: 'crews' }))
    expect(mockStage.atTop).toHaveBeenCalledTimes(1)
  })
})


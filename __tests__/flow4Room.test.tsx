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

import { ChatDock } from '../components/blendn/ChatDock'
import { RoomView, type RoomViewProps } from '../components/blendn/RoomView'
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
const mockStage = { scrolled: false }
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
  useStageScroll: () => ({ onScroll: undefined, native: {}, scrollEventThrottle: 16, scrolled: mockStage.scrolled }),
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
      title="Vinyl Night"
      hereCount={14}
      checkedInAt={new Date(Date.now() - 72 * 60_000).toISOString()}
      me={{ kind: 'creature', pseudonym: 'Night Cat' }}
      people={Array.from({ length: 13 }, (_, i) => person(`p${i}`))}
      arrivals={[]}
      connection={{ state: 'connected' } as never}
      visibility={<Text>visibility line</Text>}
      segments={false}
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
      chatGroupId={null}
      dockWave={null}
      onOpenChat={jest.fn()}
      onOpenPerson={jest.fn()}
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

describe('the hero (R3-0: the stack and the count, nothing names an arrival)', () => {
  it('Live, the title, the count with "here now", your time in the ring', async () => {
    await room()
    expect(screen.getByText('Live')).toBeTruthy()
    expect(screen.getByText('Vinyl Night')).toBeTruthy()
    expect(screen.getByLabelText('14 people here now')).toBeTruthy()
    expect(screen.getByLabelText('You, in the room 1h 12m')).toBeTruthy()
  })

  it('the stack is six faces and "+N"; no line names who walked in', async () => {
    const p = person('new', { arrivedAt: new Date().toISOString() })
    await room({ arrivals: [p] })
    expect(screen.getByText('+7', HIDDEN)).toBeTruthy()
    expect(screen.queryByText(/walked in/, HIDDEN)).toBeNull()
  })

  it('just you: "here now · just you" and the empty room (#02)', async () => {
    await room({ hereCount: 1, people: [], picks: [], everyoneCount: 0 })
    expect(screen.getByText('here now · just you')).toBeTruthy()
    expect(screen.getByText('Nobody else is here yet')).toBeTruthy()
    // "Show more" never offers a page of nobody.
    expect(screen.queryByTestId('room-show-more')).toBeNull()
  })
})

describe('the sections', () => {
  it('Meet next: three cards and the shared clock in its pill', async () => {
    const onOpen = jest.fn()
    await room({ onOpen })
    expect(screen.getByLabelText('Shuffles in 4:12')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('meet-next-1'))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }))
  })

  it('Everyone here · 13, a face per person, tap opens the card', async () => {
    jest.useFakeTimers()
    const onOpen = jest.fn()
    await room({ onOpen, onLike: null })
    expect(screen.getByLabelText('Everyone here, 13')).toBeTruthy()
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

describe('People | Crews (R2-D1)', () => {
  it('only when a crew is here or you are in one', async () => {
    await room()
    expect(screen.queryByTestId('room-segments')).toBeNull()
    await room({ segments: true })
    expect(screen.getByRole('tab', { name: 'People' })).toBeTruthy()
  })

  it('the Crews view replaces Meet next and Everyone here with the crews', async () => {
    const card = { crewId: 'c1', name: 'Orbit' } as never
    await room({ segments: true, view: 'crews', crewsHead: <Text>crews head</Text>, crewCards: [card], renderCrew: () => <Text>crew Orbit</Text> })
    expect(screen.getByText('crews head')).toBeTruthy()
    expect(screen.getByText('crew Orbit')).toBeTruthy()
    expect(screen.queryByText('Meet next')).toBeNull()
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

describe('the chat dock, one row (R3-0 02′, R3-D4 13′)', () => {
  const dock = (props: Partial<React.ComponentProps<typeof ChatDock>> = {}) =>
    render(<ChatDock chatGroupId="g1" myId="me" wave={null} onOpen={jest.fn()} onOpenPerson={jest.fn()} bottomInset={34} {...props} />)

  it('quiet: "Nobody has said anything yet. Be the first."', async () => {
    await dock()
    expect(await screen.findByText('Nobody has said anything yet. Be the first.')).toBeTruthy()
    expect(screen.getByText('Room chat')).toBeTruthy()
  })

  it('the last message, "who: what"; a new one counts "1 new" until the chat opens', async () => {
    mockHistory.mockResolvedValue({ success: true, data: [{ id: 'm1', user_id: 'x', user: { name: 'Cosmic Panda' }, content: 'Rumours side two. Fight me.', created_at: new Date().toISOString() }] })
    const onOpen = jest.fn()
    await dock({ onOpen })
    expect(await screen.findByText('Cosmic Panda: Rumours side two. Fight me.')).toBeTruthy()
    await act(async () => mockMessageListeners.forEach((fn) => fn({ chatGroupId: 'g1', message: { id: 'm2', userId: 'y', userName: 'Night Cat', content: 'Same', createdAt: new Date().toISOString() } })))
    expect(screen.getByText('1 new', HIDDEN)).toBeTruthy()
    await fireEvent.press(screen.getByTestId('room-dock'))
    expect(onOpen).toHaveBeenCalled()
    expect(screen.queryByText('1 new', HIDDEN)).toBeNull()
  })

  it('a wave to you is a row, white, with a chevron, that opens their card; the chat is still an action away', async () => {
    const onOpenPerson = jest.fn()
    const onOpen = jest.fn()
    await dock({ wave: { kind: 'wave', id: 'w', fromUserId: 'nc', fromName: 'Night Cat', at: Date.now() }, onOpenPerson, onOpen })
    expect(await screen.findByText('Night Cat waved at you')).toBeTruthy()
    const row = screen.getByTestId('room-dock')
    await fireEvent.press(row)
    expect(onOpenPerson).toHaveBeenCalledWith('nc')
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'openChat' } })
    expect(onOpen).toHaveBeenCalled()
  })

  it('failed: "Couldn’t load messages." with Try again, which asks again', async () => {
    mockHistory.mockResolvedValue({ success: false })
    await dock()
    expect(await screen.findByText('Couldn’t load messages.')).toBeTruthy()
    mockHistory.mockResolvedValue({ success: true, data: [] })
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(mockHistory).toHaveBeenCalledTimes(2)
  })

  it('left: "You left this chat. Open it to rejoin." with Rejoin, and asks the server nothing (#14)', async () => {
    mockLeft = new Set(['g1'])
    const onOpen = jest.fn()
    await dock({ onOpen })
    expect(screen.getByText('You left this chat. Open it to rejoin.')).toBeTruthy()
    expect(mockHistory).not.toHaveBeenCalled()
    await fireEvent.press(screen.getByRole('button', { name: 'Rejoin' }))
    expect(onOpen).toHaveBeenCalled()
  })
})

describe('B8 (Prompt 10): the Room’s glass pills rise; the glass never fades', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'components', 'blendn', 'BlendnScreen.tsx'), 'utf8') as string

  it('enters as a 16 pt rise over base with the glass opaque throughout; only the contents fade', () => {
    expect(src).toContain('const GLASS_RISE = SPACE.lg')
    expect(src).toMatch(/withInitialValues\(\{ opacity: 1, transform: \[\{ translateY: GLASS_RISE \}\] \}\)/)
    expect(src).toContain('entering={reduceMotion ? undefined : glassRise} style={styles.topActions}')
    expect(src).toContain('<Animated.Text entering={glassContentsIn}')
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

describe('the dock glass (found in SCRUM-155: reopening the room lost it)', () => {
  it('is rebuilt once the entrances are over, and only once', async () => {
    jest.useFakeTimers()
    try {
      await room()
      const before = mockMaterialMounts.count
      await act(async () => {
        jest.advanceTimersByTime(999)
      })
      expect(mockMaterialMounts.count).toBe(before)
      await act(async () => {
        jest.advanceTimersByTime(5000)
      })
      expect(mockMaterialMounts.count).toBe(before + 1)
    } finally {
      jest.useRealTimers()
    }
  })
})

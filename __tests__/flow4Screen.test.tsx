/**
 * The Blend'n overlay driven end to end against a room the test moves
 * (Flow 4; the security review of the redesign): the PersonCard from the grid,
 * Meet next, the dock's wave row, the wave toast and the tabs' banner; like
 * and wave refusals on the card; Block / Report after the card has left;
 * Liking as a crew says the crew it sends as; the reveal gate; Check out
 * confirms and closes first; the Match, the Recap and the room's error.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo } from 'react-native'

import { BlendnScreen } from '../components/blendn/BlendnScreen'
import { openBlendn } from '../lib/blendnOverlay'
import { apiClient } from '../lib/apiClient'
import { crewsApi } from '../lib/crewsApi'
import { listenForWaves } from '../lib/roomWaves'
import { showUserSafetyActions } from '../lib/safetyUtils'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), __esModule: true, useReducedMotion: () => true }))
jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}))
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
// Coach marks have their own tests (coachMarks, pulseCoachMark); here they never show.
jest.mock('../lib/coachMarks', () => ({ useCoachMark: () => ({ visible: false, dismiss: () => {} }), markCoachUsed: () => {} }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual('react')
    useEffect(effect, [effect])
  },
}))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() } }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'me', name: 'Sam Rao', image: null } }) }))
// One stable mock per method, so a test can set what it answers (a bare list is "nothing" to the callers that expect more).
jest.mock('../lib/apiClient', () => {
  const fns: Record<string, jest.Mock> = {}
  return { apiClient: new Proxy({}, { get: (_t, name: string) => (fns[name] ??= jest.fn(async () => ({ success: true, data: [] }))) }) }
})
jest.mock('../lib/safetyUtils', () => ({ showUserSafetyActions: jest.fn() }))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn(), sheetClosed: async () => {} }))
const mockWaveListeners = new Set<(d: unknown) => void>()
const mockCancelledListeners = new Set<(d: { eventId: string }) => void>()
jest.mock('../lib/socketClient', () => ({
  connect: jest.fn(),
  subscribeToChatMessage: () => () => {},
  subscribeToLiveEnded: () => () => {},
  subscribeToEventCancelled: (_id: string, fn: (d: { eventId: string }) => void) => {
    mockCancelledListeners.add(fn)
    return () => mockCancelledListeners.delete(fn)
  },
  subscribeToRoomFriends: () => () => {},
  subscribeConnectionStatus: () => () => {},
  subscribeToRoomWave: (fn: (d: unknown) => void) => {
    mockWaveListeners.add(fn)
    return () => mockWaveListeners.delete(fn)
  },
}))
jest.mock('../lib/networkStatus', () => ({ getNetworkState: () => 'online', subscribeNetworkState: () => () => {} }))
jest.mock('../lib/crewsApi', () => ({
  crewsApi: { crewsAt: jest.fn(), myCrews: jest.fn(), openToCrews: jest.fn(), here: jest.fn(), likeCrew: jest.fn(), likePersonAsCrew: jest.fn(), report: jest.fn() },
}))
const mockScrollY = jest.requireActual('react-native-reanimated').makeMutable(0)
jest.mock('../components/blendn/RoomStage', () => {
  const { forwardRef } = jest.requireActual('react')
  return {
    RoomStage: forwardRef(({ children }: { children: React.ReactNode }, _ref: unknown) => children),
    useStageScroll: () => ({ onScroll: undefined, native: {}, scrollEventThrottle: 16 }),
    useStage: () => ({ scrollY: mockScrollY, pan: {} }),
  }
})
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

/* The room, as a store the test sets. */
const mockRoom = {
  like: jest.fn(),
  sendWave: jest.fn(),
  remove: jest.fn(),
  refresh: jest.fn(async () => {}),
  retry: jest.fn(),
  clearMatch: jest.fn(),
  connect: jest.fn(async (): Promise<{ stands: boolean; refusal?: string }> => ({ stands: true })),
  loadMore: jest.fn(async () => {}),
}
jest.mock('../lib/useRoom', () => {
  const { useSyncExternalStore } = jest.requireActual('react')
  let state: Record<string, unknown> = {}
  const listeners = new Set<() => void>()
  return {
    useRoom: () => useSyncExternalStore((fn: () => void) => (listeners.add(fn), () => listeners.delete(fn)), () => state),
    mockSetRoom: (next: Record<string, unknown>) => {
      state = next
      listeners.forEach((fn) => fn())
    },
  }
})
const mockControls = {
  revealed: false,
  revealBusy: false,
  listed: true,
  readiness: { ok: true, missing: '' },
  toggleReveal: jest.fn(),
  checkOut: jest.fn(async () => true),
  checkOutBusy: false,
}
jest.mock('../lib/useRoomControls', () => ({ useRoomControls: () => mockControls }))
jest.mock('../lib/useTonight', () => ({
  useTonight: () => ({ status: 'ready', events: [], insideEventId: null, location: 'on', offline: false, refresh: async () => {} }),
}))

const { mockSetRoom } = jest.requireMock('../lib/useRoom') as { mockSetRoom: (s: Record<string, unknown>) => void }
const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } }
const api = crewsApi as jest.Mocked<typeof crewsApi>
const HIDDEN = { includeHiddenElements: true }

const person = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  name: `Person ${id}`,
  photo: null,
  interests: ['Vinyl'],
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
  raw: {},
  ...o,
})
const PEOPLE = Array.from({ length: 6 }, (_, i) => person(`p${i}`))
const ready = (o: Record<string, unknown> = {}) => ({
  ...mockRoom,
  status: 'ready',
  event: { id: 'e1', title: 'Vinyl Night', endsAt: new Date(Date.now() + 3600_000).toISOString() },
  checkedInAt: new Date(Date.now() - 30 * 60_000).toISOString(),
  revealed: false,
  hereCount: 7,
  people: PEOPLE,
  arrivals: [],
  hasMore: false,
  loadingMore: false,
  chatGroupId: null,
  match: null,
  error: null,
  connection: { state: 'connected' },
  ...o,
})

/** The open card's Modal has left (iOS reports it through onDismiss). */
const cardGone = () => act(async () => screen.getByTestId('person-card-modal', HIDDEN).props.onDismiss?.())
const card = () => screen.queryByTestId('person-card-card', HIDDEN)

beforeEach(() => {
  jest.clearAllMocks()
  mockControls.revealed = false
  mockControls.listed = true
  mockControls.readiness = { ok: true, missing: '' }
  api.crewsAt.mockResolvedValue({ success: true, data: { crewsEnabled: true, crews: [], myCrews: [], total: 0, hasMore: false } })
  api.myCrews.mockResolvedValue({ success: true, data: { crews: [], invites: [] } })
  mockRoom.like.mockResolvedValue({ kind: 'liked' })
  mockRoom.sendWave.mockResolvedValue({ kind: 'sent' })
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false)
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false)
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
  jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {})
  mockSetRoom(ready())
})
afterEach(() => listenForWaves(null))

const drawRoom = async () => {
  await render(<BlendnScreen />)
  await act(async () => {})
}
const openFromGrid = async (i: number) => {
  jest.useFakeTimers()
  await fireEvent.press(screen.getByTestId(`room-face-${i}`))
  await act(async () => jest.advanceTimersByTime(400))
  jest.useRealTimers()
}

describe('the PersonCard, from every room surface (R3-D4 4.1)', () => {
  it('a grid face opens it: their name, their reasons, Like · Wave · Message · ⋯ · View profile', async () => {
    await drawRoom()
    await openFromGrid(3)
    expect(card()).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Like' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Wave at Person p3' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Message' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Block or report Person p3' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'View profile' })).toBeTruthy()
  })

  it('a Meet next card opens it', async () => {
    await drawRoom()
    await fireEvent.press(screen.getByTestId('meet-next-0'))
    expect(card()).toBeTruthy()
  })

  it('the tabs’ wave banner opens the overlay at their card', async () => {
    openBlendn('p2')
    await drawRoom()
    expect(screen.getByRole('button', { name: 'Wave at Person p2' })).toBeTruthy()
  })

  it('a wave while you are here: the ✓ capsule, then their card with "Waved at you" and Wave back (4.2)', async () => {
    listenForWaves('e1')
    await drawRoom()
    await act(async () => mockWaveListeners.forEach((fn) => fn({ eventId: 'e1', fromUserId: 'p4', fromName: 'Person p4' })))
    await fireEvent.press(screen.getByRole('button', { name: 'Person p4 waved at you' }))
    expect(screen.getByText('Waved at you · 1 min', HIDDEN)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Wave back at Person p4' })).toBeTruthy()
  })
})

describe('like and wave refusals (R3-D4 4.3)', () => {
  it('a refused like is one neutral line on the card, and does not show it as liked', async () => {
    mockRoom.like.mockResolvedValue({ kind: 'refused', refusal: { message: 'That didn’t go through.', variant: 'info' } })
    await drawRoom()
    await openFromGrid(1)
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Like' })))
    expect(screen.getByText('That didn’t go through.', HIDDEN)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Like' })).toBeTruthy()
  })

  it('a lapsed check-in offers Check in, which docks this room’s pass and re-reads the room', async () => {
    mockRoom.sendWave.mockResolvedValue({ kind: 'refused', refusal: { message: 'Check in to wave at people here', variant: 'info', checkIn: true } })
    await drawRoom()
    await openFromGrid(2)
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Wave at Person p2' })))
    expect(screen.getByText('Check in to wave at people here', HIDDEN)).toBeTruthy()
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Check in' })))
    expect(mockRoom.refresh).toHaveBeenCalled()
    expect(jest.requireActual('../lib/blendnOverlay').getDoor()).toMatchObject({ id: 'e1', title: 'Vinyl Night' })
  })

  it('a wave goes: the hand waves while it is on its way, then "Waved"', async () => {
    let answer: (v: unknown) => void = () => {}
    mockRoom.sendWave.mockReturnValue(new Promise((r) => (answer = r)))
    await drawRoom()
    await openFromGrid(2)
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Wave at Person p2' })))
    expect(screen.getByTestId('person-card-card-hand-waving', HIDDEN)).toBeTruthy()
    await act(async () => answer({ kind: 'sent' }))
    expect(screen.getByLabelText('Waved')).toBeTruthy()
  })
})

describe('a refused message request (TEXT_NOT_ALLOWED)', () => {
  const sendFromCard = async () => {
    await drawRoom()
    await openFromGrid(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Message' }))
    await cardGone()
    await fireEvent.changeText(screen.getByTestId('connect-message', HIDDEN), 'find me at https://x.example')
    await act(async () => fireEvent.press(screen.getByText('Send request')))
  }

  it('says the server’s sentence, not the generic line', async () => {
    mockRoom.connect.mockResolvedValue({ stands: false, refusal: 'Links and numbers can’t go in a first note.' })
    await sendFromCard()
    expect(screen.getByText('Links and numbers can’t go in a first note.')).toBeTruthy()
    expect(screen.queryByText('Couldn’t send the request. Try again.')).toBeNull()
  })

  it('says it in the sheet, under the note, until the note is edited', async () => {
    mockRoom.connect.mockResolvedValue({ stands: false, refusal: 'Links and numbers can’t go in a first note.' })
    await sendFromCard()
    // The sheet is still open with the sentence in it (a toast sat behind its scrim, drive 2026-10-27).
    expect(screen.getByTestId('connect-message', HIDDEN)).toBeTruthy()
    expect(screen.getByText('Links and numbers can’t go in a first note.')).toBeTruthy()
    await fireEvent.changeText(screen.getByTestId('connect-message', HIDDEN), 'Loved the talk, want to compare notes?')
    expect(screen.queryByText('Links and numbers can’t go in a first note.')).toBeNull()
  })

  it('keeps the generic line for a failure the server did not name', async () => {
    mockRoom.connect.mockResolvedValue({ stands: false })
    await sendFromCard()
    expect(screen.getByText('Couldn’t send the request. Try again.')).toBeTruthy()
  })
})

describe('Block and Report wait for the card to have left', () => {
  it('⋯ closes the card, then opens the safety sheet once it is gone; either removes them', async () => {
    await drawRoom()
    await openFromGrid(3)
    await fireEvent.press(screen.getByRole('button', { name: 'Block or report Person p3' }))
    expect(showUserSafetyActions).not.toHaveBeenCalled()
    await cardGone()
    expect(showUserSafetyActions).toHaveBeenCalledWith('Person p3', 'p3', expect.any(Function), expect.any(Function))
    ;(showUserSafetyActions as jest.Mock).mock.calls[0][2]()
    expect(mockRoom.remove).toHaveBeenCalledWith('p3')
  })
})

describe('Liking as a crew: what the button says is what it sends (R2-D1)', () => {
  const nebula = { crewId: 'nebula', name: 'Nebula', presentCount: 2 }
  const crew = (crewId: string, o: Record<string, unknown> = {}) => ({ crewId, name: crewId, emblemSeed: crewId, openToSolo: true, size: 3, ...o })

  it('one crew here that may like people: "Like for Nebula" likes as Nebula', async () => {
    api.crewsAt.mockResolvedValue({ success: true, data: { crewsEnabled: true, crews: [], myCrews: [nebula], total: 0, hasMore: false } })
    api.myCrews.mockResolvedValue({ success: true, data: { crews: [crew('nebula', { name: 'Nebula' })], invites: [] } } as never)
    api.likePersonAsCrew.mockResolvedValue({ success: true, data: { liked: true, blend: null } })
    await drawRoom()
    await openFromGrid(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Like for Nebula' }))
    await cardGone()
    expect(api.likePersonAsCrew).toHaveBeenCalledWith('e1', 'p1', 'nebula')
    expect(mockRoom.like).not.toHaveBeenCalled()
  })

  it('"Like as yourself" never sends as a crew', async () => {
    api.crewsAt.mockResolvedValue({ success: true, data: { crewsEnabled: true, crews: [], myCrews: [nebula], total: 0, hasMore: false } })
    api.myCrews.mockResolvedValue({ success: true, data: { crews: [crew('nebula', { name: 'Nebula' })], invites: [] } } as never)
    await drawRoom()
    await openFromGrid(1)
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Like as yourself' })))
    expect(mockRoom.like).toHaveBeenCalledWith('p1')
    expect(api.likePersonAsCrew).not.toHaveBeenCalled()
  })

  it('a crew that may not like people (closed to solo) leaves the plain Like, which is you', async () => {
    api.crewsAt.mockResolvedValue({ success: true, data: { crewsEnabled: true, crews: [], myCrews: [nebula], total: 0, hasMore: false } })
    api.myCrews.mockResolvedValue({ success: true, data: { crews: [crew('nebula', { name: 'Nebula', openToSolo: false })], invites: [] } } as never)
    await drawRoom()
    await openFromGrid(1)
    expect(screen.queryByRole('button', { name: 'Like for Nebula' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Like' })).toBeTruthy()
  })

  it('several that may: "Like for your crew", and the app picks none for you', async () => {
    const orbit = { crewId: 'orbit', name: 'Orbit', presentCount: 2 }
    api.crewsAt.mockResolvedValue({ success: true, data: { crewsEnabled: true, crews: [], myCrews: [nebula, orbit], total: 0, hasMore: false } })
    api.myCrews.mockResolvedValue({ success: true, data: { crews: [crew('nebula', { name: 'Nebula' }), crew('orbit', { name: 'Orbit' })], invites: [] } } as never)
    await drawRoom()
    await openFromGrid(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Like for your crew' }))
    await cardGone()
    expect(api.likePersonAsCrew).not.toHaveBeenCalled()
    const { showSheet } = jest.requireMock('../lib/sheet') as { showSheet: jest.Mock }
    const actions = showSheet.mock.calls[0][0].actions.map((a: { label: string }) => a.label)
    expect(actions).toEqual(['Nebula', 'Orbit', 'Just me', 'Cancel'])
  })
})

describe('the visibility line and its gate', () => {
  it('nothing to reveal: the line says so, and its action is the profile, never a reveal', async () => {
    mockControls.readiness = { ok: false, missing: 'a photo' }
    await drawRoom()
    await fireEvent.press(screen.getByRole('button', { name: 'Add a photo' }))
    expect(router.push).toHaveBeenCalledWith('/edit-profile')
    expect(mockControls.toggleReveal).not.toHaveBeenCalled()
  })

  it('named: Go anonymous is never gated', async () => {
    mockControls.revealed = true
    mockControls.readiness = { ok: false, missing: 'a photo' }
    await drawRoom()
    await fireEvent.press(screen.getByRole('button', { name: 'Go anonymous' }))
    expect(mockControls.toggleReveal).toHaveBeenCalled()
  })
})

describe('Check out always confirms (Room #16)', () => {
  it('the confirm: Stay, and Check out in destructiveFill; it closes before the check-out runs', async () => {
    await drawRoom()
    await fireEvent.press(screen.getByRole('button', { name: 'Check out' }))
    expect(screen.getByText('Check out of this event?', HIDDEN)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stay' })).toBeTruthy()
    const buttons = screen.getAllByRole('button', { name: 'Check out' })
    await act(async () => fireEvent.press(buttons[buttons.length - 1]))
    expect(mockControls.checkOut).toHaveBeenCalledTimes(1)
  })
})

describe('the Match, the Recap, the room’s error', () => {
  it('a mutual like plays the Match with the faces the room has earned (D · 4.4)', async () => {
    mockSetRoom(ready({ match: { person: person('p1'), name: 'Night Cat', you: 'Quiet Otter', conversationId: 'c1', at: Date.now() } }))
    await drawRoom()
    expect(screen.getByText('It’s mutual', HIDDEN)).toBeTruthy()
    expect(screen.getByText(/You and Night Cat matched/, HIDDEN)).toBeTruthy()
  })

  it('the night is over: That’s a wrap, never a check-out', async () => {
    mockSetRoom(ready({ event: { id: 'e1', title: 'Vinyl Night', endsAt: new Date(Date.now() - 60_000).toISOString() } }))
    await drawRoom()
    expect(screen.getByText('That’s a wrap', HIDDEN)).toBeTruthy()
    expect(mockControls.checkOut).not.toHaveBeenCalled()
  })

  it('a room that failed to load leaves Tonight up, with a quiet line (Room #15)', async () => {
    mockSetRoom({ ...mockRoom, status: 'error', event: null, people: [], arrivals: [], match: null, error: 'Network request failed', connection: { state: 'connected' } })
    await drawRoom()
    expect(screen.getByText('Couldn’t check your room. You can still browse tonight.')).toBeTruthy()
    expect(screen.queryByText('Network request failed')).toBeNull()
  })
})

/* ---------------------------------------------------------------------------------------------- */
/* Friends here (plans/friends-in-room.md C1) and the event cancelled while you are inside (R4)    */
/* ---------------------------------------------------------------------------------------------- */

const friends = (names: string[], total = names.length) => ({
  success: true,
  data: { friends: names.map((name, i) => ({ userId: `f${i}`, name, photo: null })), total, nextCursor: null },
})
const mockFriendsHere = apiClient.getFriendsHere as unknown as jest.Mock
const mockOpenFriend = apiClient.openFriendConversation as unknown as jest.Mock

describe('Friends here in the Room', () => {
  it('is a section above Meet next: the count, three rows, "1 more here", and Message opens the friend chat by real id', async () => {
    mockFriendsHere.mockResolvedValue(friends(['Asha Menon', 'Rohan Iyer', 'Meera Krishnan', 'Aarav Gupta']))
    mockOpenFriend.mockResolvedValue({ success: true, data: { conversationId: 'c1' } })
    await drawRoom()
    expect(await screen.findByText('Asha Menon')).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Friends here, 4' })).toBeTruthy()
    expect(screen.getByText('1 more here')).toBeTruthy()
    // The friend is a row here, never a face in the grid.
    expect(screen.queryByTestId('room-face-friend', HIDDEN)).toBeNull()
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Message Rohan Iyer' }))
    })
    expect(mockOpenFriend).toHaveBeenCalledWith('f1')
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/private-chat/[conversationId]',
      params: { conversationId: 'c1', otherUserName: 'Rohan Iyer', otherUserId: 'f1' },
    })
  })

  it('See all pushes the pushed screen, for this event', async () => {
    mockFriendsHere.mockResolvedValue(friends(['A', 'B', 'C', 'D'], 60))
    await drawRoom()
    await act(async () => {
      fireEvent.press((await screen.findAllByRole('button', { name: 'See all 60 friends here' }))[0])
    })
    expect(router.push).toHaveBeenCalledWith({ pathname: '/room/friends-here', params: { eventId: 'e1' } })
  })

  it('no friends: no section at all', async () => {
    mockFriendsHere.mockResolvedValue(friends([]))
    await drawRoom()
    expect(screen.queryByText('Friends here')).toBeNull()
  })

  it('an older server (no route): no section, and the room is untouched', async () => {
    mockFriendsHere.mockResolvedValue({ success: false, error: 'Not found' })
    await drawRoom()
    expect(screen.queryByText('Friends here')).toBeNull()
    expect(screen.getByTestId('room-face-0')).toBeTruthy()
  })

  it('a failed chat says so with the first name and reads again', async () => {
    mockFriendsHere.mockResolvedValue(friends(['Asha Menon']))
    mockOpenFriend.mockResolvedValue({ success: false })
    await drawRoom()
    mockFriendsHere.mockClear()
    await act(async () => {
      fireEvent.press(await screen.findByRole('button', { name: 'Message Asha Menon' }))
    })
    expect(await screen.findByText("Couldn’t open your chat with Asha. Try again.")).toBeTruthy()
    expect(mockFriendsHere).toHaveBeenCalled()
  })

  it('nobody else but a friend: the empty state says nobody NEW', async () => {
    mockSetRoom(ready({ people: [], hereCount: 1 }))
    mockFriendsHere.mockResolvedValue(friends(['Asha Menon']))
    await drawRoom()
    expect(await screen.findByText('No one new here yet')).toBeTruthy()
    expect(screen.queryByText('Nobody else is here yet')).toBeNull()
    mockFriendsHere.mockResolvedValue(friends([]))
  })

  it('nobody at all: the empty state is the old one', async () => {
    mockSetRoom(ready({ people: [], hereCount: 1 }))
    mockFriendsHere.mockResolvedValue(friends([]))
    await drawRoom()
    expect(screen.getByText('Nobody else is here yet')).toBeTruthy()
  })
})

describe('the event cancelled while you are inside (R4)', () => {
  const emit = (eventId: string) => act(async () => mockCancelledListeners.forEach((fn) => fn({ eventId })))

  it('event:cancelled makes the Room a calm card with the two ways out; it is modal', async () => {
    mockFriendsHere.mockResolvedValue(friends([]))
    await drawRoom()
    await emit('e1')
    expect(await screen.findByText('Vinyl Night was cancelled')).toBeTruthy()
    expect(screen.getByText('The organizer called it off. You’re checked out.')).toBeTruthy()
    expect(screen.getByTestId('room-cancelled').props.accessibilityViewIsModal).toBe(true)
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'See what’s on tonight' }))
    })
    expect(screen.queryByText('Vinyl Night was cancelled')).toBeNull()
  })

  it('another event’s cancellation changes nothing here', async () => {
    mockFriendsHere.mockResolvedValue(friends([]))
    await drawRoom()
    await emit('someone-else')
    expect(screen.queryByText('Vinyl Night was cancelled')).toBeNull()
  })
})

describe('the floating bar (TG-01)', () => {
  afterEach(() => mockScrollY.set(0))

  it('takes the bar glass once the page scrolls, and drops it back at the top', async () => {
    await drawRoom()
    expect(screen.queryByTestId('blendn-bar')).toBeNull()
    await act(async () => mockScrollY.set(120))
    expect(screen.getByTestId('blendn-bar')).toBeTruthy()
    await act(async () => mockScrollY.set(0))
    expect(screen.queryByTestId('blendn-bar')).toBeNull()
  })

  it('Increase Contrast draws the hairline under it', async () => {
    jest.spyOn(AccessibilityInfo, 'isHighTextContrastEnabled').mockResolvedValue(true)
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await drawRoom()
    await act(async () => mockScrollY.set(120))
    expect(screen.getByTestId('blendn-bar-contrast')).toBeTruthy()
  })
})

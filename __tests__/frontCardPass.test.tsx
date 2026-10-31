/**
 * SCRUM-965: the Tonight deck's front card owns the docked pass.
 *
 * Baseline (2026-10-31, audit seed): with Overlap A and B around the phone the
 * pass docked A (the fence's first) while the deck showed B, and swiping changed
 * nothing about the hold. Now there is one front-card index; the pass, its reach
 * ("You're too far away" for a far card), its "Hold to switch" and the event the
 * hold checks in are all read off the card in front.
 */
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native'
import React from 'react'

import { BlendnScreen } from '../components/blendn/BlendnScreen'
import { blendnClosed, getDoor, openPass, useRoomUp } from '../lib/blendnOverlay'
import { submitCheckIn, type CheckInOutcome } from '../lib/checkIn'
import type { TonightEvent } from '../lib/useTonight'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}))
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useFocusEffect: (effect: () => void | (() => void)) => jest.requireActual('react').useEffect(effect, [effect]),
}))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() } }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Sam Rao', image: null } }) }))
jest.mock('../lib/apiClient', () => ({ apiClient: new Proxy({}, { get: () => jest.fn(async () => ({ success: false })) }) }))
jest.mock('../lib/locationFix', () => ({ warmLocationFix: jest.fn(async () => {}), getCurrentLocation: jest.fn(async () => ({ latitude: 12.95075, longitude: 77.585065, accuracy: 8 })) }))
jest.mock('../lib/roomVisibilityStorage', () => ({}))
jest.mock('../lib/coachMarks', () => ({ useCoachMark: () => ({ visible: false, dismiss: () => {} }), markCoachUsed: () => {} }))
jest.mock('../lib/checkIn', () => ({ ...jest.requireActual('../lib/checkIn'), submitCheckIn: jest.fn(), revealOffer: jest.fn() }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))

/* The room, as a store the test moves. */
jest.mock('../lib/useRoom', () => {
  const { useSyncExternalStore } = jest.requireActual('react')
  const none = {
    status: 'none', event: null, people: [], arrivals: [], hereCount: 0, hasMore: false, loadingMore: false,
    checkedInAt: null, revealed: false, chatGroupId: null, match: null, wave: null, error: null, connection: 'connected',
    clearMatch: () => {}, connect: async () => ({ stands: true }), loadMore: async () => {}, retry: () => {}, like: async () => ({ kind: 'liked' }),
    sendWave: async () => ({ kind: 'sent' }), remove: () => {}, refresh: async () => {},
  }
  let state: Record<string, unknown> = none
  const listeners = new Set<() => void>()
  const set = (next: Record<string, unknown>) => {
    state = next
    listeners.forEach((fn) => fn())
  }
  return {
    useRoom: () => useSyncExternalStore((fn: () => void) => (listeners.add(fn), () => listeners.delete(fn)), () => state),
    mockRoomIn: (id: string) => set({ ...none, status: 'ready', settled: true, event: { id, title: `Event ${id}` } }),
    mockRoomReset: () => set(none),
  }
})

/* The phone stands inside both overlapping fences (12.95075, 77.585065); the signal names the first. */
const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()
const event = (id: string, latitude: number, longitude: number): TonightEvent => ({
  id, title: `Event ${id}`, venue: `Venue ${id}`, photo: null, startsAt: at(-20), endsAt: at(200), distanceKm: 0.05,
  hereCount: 0, capacity: null, going: false, tasteMatchCount: null, goingCount: null, latitude, longitude,
})
const A = event('A', 12.95075, 77.58475)
const B = event('B', 12.95075, 77.58538)
const C = event('C', 12.95075, 77.58500)
const FAR = event('FAR', 12.9791, 77.6408)
let mockFeed: TonightEvent[] = []
let mockInside: string | null = null
jest.mock('../lib/useTonight', () => ({
  useTonight: () => ({ status: 'ready', events: mockFeed, insideEventId: mockInside, location: 'on', offline: false, refresh: async () => {} }),
  quietLocation: async () => ({ coords: { latitude: 12.95075, longitude: 77.585065, accuracy: 8, timestamp: Date.now(), approximate: false }, location: 'on' }),
}))
jest.mock('../lib/useRoomControls', () => ({
  useRoomControls: () => ({ revealed: false, revealBusy: false, listed: true, readiness: { ok: true, missing: null }, toggleReveal: async () => {}, checkOut: async () => true, checkOutBusy: false }),
}))
/* Tonight as what the screen tells it: the deck, the pass's event, its reach, and the swipe. */
jest.mock('../components/blendn/TonightView', () => {
  const { Pressable, Text, View } = jest.requireActual('react-native')
  return {
    TonightView: ({ events, insideEvent, reach, switchFrom, youreIn, onFront, onCheckIn }: Record<string, any>) => (
      <View testID="tonight">
        <Text testID="deck">{events.map((e: TonightEvent) => e.id).join(',')}</Text>
        <Text testID="pass">{insideEvent ? `${insideEvent.id}|${reach}|${switchFrom ?? '-'}|${youreIn ? 'in' : 'out'}` : 'none'}</Text>
        {[0, 1, 2, 3].map((i) => (
          <Pressable key={i} testID={`front-${i}`} onPress={() => onFront?.(i)} />
        ))}
        <Pressable testID="hold" onPress={onCheckIn} />
      </View>
    ),
  }
})
jest.mock('../components/blendn/RoomStage', () => {
  const { forwardRef } = jest.requireActual('react')
  return {
    RoomStage: forwardRef(({ children }: { children: React.ReactNode }, _ref: unknown) => children),
    useStageScroll: () => ({ onScroll: undefined, native: {}, scrollEventThrottle: 16 }),
    useStage: () => ({ scrollY: jest.requireActual('react-native-reanimated').makeMutable(0), pan: {} }),
  }
})
jest.mock('../components/blendn/RoomSections', () => ({ faceOf: () => ({ kind: 'creature', pseudonym: 'Night Cat' }), RoomSkeleton: () => null, useNow: () => Date.now(), useGridCell: () => 100 }))
jest.mock('../components/blendn/RoomView', () => {
  const { View } = jest.requireActual('react-native')
  return { RoomView: () => <View testID="room" /> }
})
jest.mock('../components/blendn/RoomCrews', () => ({ CrewsFoot: () => null, CrewsHead: () => null, PeopleCrewStrip: () => null, RoomCrewCard: () => null }))
jest.mock('../components/crews/CrewsView', () => ({
  useCrewsHere: () => ({ state: { status: 'loading' }, mine: [] }),
  useCrewActions: () => ({ like: async () => {}, liking: null, report: () => {}, here: async () => {}, told: {} }),
  crewCards: () => [],
  openBlend: () => {},
}))
jest.mock('../components/ds/PersonCard', () => ({ PersonCard: () => null }))
jest.mock('../components/grid/ConnectSheet', () => ({ ConnectSheet: () => null }))

const { mockRoomIn, mockRoomReset } = jest.requireMock('../lib/useRoom') as { mockRoomIn: (id: string) => void; mockRoomReset: () => void }
const submit = submitCheckIn as jest.Mock
const HIDDEN = { includeHiddenElements: true }
const pass = () => screen.getByTestId('pass', HIDDEN).props.children as string
const deck = () => screen.getByTestId('deck', HIDDEN).props.children as string
const front = (i: number) => act(async () => fireEvent.press(screen.getByTestId(`front-${i}`, HIDDEN)))
const fresh: CheckInOutcome = { kind: 'checkedIn', checkInId: 'c1', askIntent: false, revealSuggestion: false, left: [] }
/** Past the mount effects and the reach re-read (a promise). */
const settle = () => act(async () => {})

beforeEach(() => {
  jest.clearAllMocks()
  blendnClosed()
  mockRoomReset()
  mockFeed = [B, A, FAR]
  mockInside = 'A'
})

describe('standing in the fences, no door', () => {
  it('the pass is the front card: the inside event leads the deck, and swiping moves the pass', async () => {
    await render(<BlendnScreen />)
    await settle()
    expect(deck()).toBe('A,B,FAR')
    expect(pass()).toBe('A|open|-|out')
    await front(1)
    await settle()
    expect(pass()).toBe('B|open|-|out')
    await front(2)
    await settle()
    // A card the phone is nowhere near: dimmed, "You're too far away" (28 Oct rule).
    expect(pass()).toBe('FAR|far|-|out')
    await front(0)
    await settle()
    expect(pass()).toBe('A|open|-|out')
  })

  it('the hold checks in the card in front, not the fence the signal named', async () => {
    submit.mockResolvedValue(fresh)
    await render(<BlendnScreen />)
    await front(1)
    await settle()
    await act(async () => fireEvent.press(screen.getByTestId('hold', HIDDEN)))
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit.mock.calls[0][0]).toBe('B')
  })
})

describe('opened from an event’s door', () => {
  it('that event’s card is in front, whatever order the feed has', async () => {
    mockInside = null
    await render(<BlendnScreen />)
    await act(async () => openPass(B))
    await settle()
    expect(deck()).toBe('B,A,FAR')
    expect(pass()).toBe('B|open|-|out')
    await front(2)
    await settle()
    expect(pass()).toBe('FAR|far|-|out')
  })

  it('a door the feed does not list is still the front card', async () => {
    mockInside = null
    await render(<BlendnScreen />)
    await act(async () => openPass(C))
    await settle()
    expect(deck()).toBe('C,B,A,FAR')
    expect(pass()).toBe('C|open|-|out')
  })

  it('a different door starts at its own card, not at the old index', async () => {
    mockInside = null
    await render(<BlendnScreen />)
    await act(async () => openPass(B))
    await front(2)
    await act(async () => openPass(A))
    await settle()
    expect(pass()).toBe('A|open|-|out')
  })
})

describe('checked in elsewhere: Hold to switch follows the card', () => {
  it('another card’s hold leaves the room; the room’s own card reads "You’re in", and the screen stays on Tonight', async () => {
    mockInside = null
    await render(<BlendnScreen />)
    await act(async () => openPass(B))
    await act(async () => mockRoomIn('A'))
    await settle()
    expect(screen.queryByTestId('room', HIDDEN)).toBeNull()
    expect(pass()).toBe('B|open|Event A|out')
    // Swipe to the room we are in: no switch to make, and no flip into the Room.
    await front(1)
    await settle()
    expect(pass()).toBe('A|open|-|in')
    expect(screen.queryByTestId('tonight', HIDDEN)).not.toBeNull()
    // And on to a far card: leaving A for it is a switch, disabled.
    await front(2)
    await settle()
    expect(pass()).toBe('FAR|far|Event A|out')
  })

  it('checking into a swiped card makes it the door, so the room it opens is not read as another switch', async () => {
    mockInside = null
    mockFeed = [B, A, C, FAR]
    submit.mockResolvedValue(fresh)
    await render(<BlendnScreen />)
    await act(async () => openPass(B))
    await act(async () => mockRoomIn('A'))
    await front(2)
    await settle()
    expect(pass()).toBe('C|open|Event A|out')
    await act(async () => fireEvent.press(screen.getByTestId('hold', HIDDEN)))
    expect(submit.mock.calls[0][0]).toBe('C')
    expect(getDoor()?.id).toBe('C')
  })
})

describe('an event page waiting for the Room (SCRUM-966)', () => {
  it('says the Room is up once it is whole, and not before or after', async () => {
    mockInside = null
    await render(<BlendnScreen />)
    // Read from its own root: the page that waits is another screen, not a sibling of the overlay.
    const waiting = await renderHook(() => useRoomUp('A'))
    expect(waiting.result.current).toBe(false)
    await act(async () => mockRoomIn('A'))
    expect(waiting.result.current).toBe(true)
    await act(async () => mockRoomReset())
    expect(waiting.result.current).toBe(false)
  })
})

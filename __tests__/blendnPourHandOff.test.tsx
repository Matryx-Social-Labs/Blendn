/**
 * The Blend'n overlay after a fresh check-in: the pour, then any question,
 * then the Room — never a re-armed Tonight in between.
 *
 * Driven on #389 (Android 0.8 s, iOS 0.3 s): the pour handed off on a fixed
 * 700 ms timer and cleared onto Tonight with a live "Hold to blend in",
 * because the overlay only turns into the Room once the room has loaded; and
 * "Why do you go out?" was pushed at the hand-off whatever was under it.
 *
 * Flow 4 Tonight #14 (and #12–#13) draws the question as a sheet over
 * Tonight; motion #9 hands the pour off into the Room. So: with no question
 * the pour holds, filled, until the Room is there and crossfades into it;
 * with one, it clears onto Tonight with the pass still reading "You're in",
 * the sheet rises over that, and the Room comes once it is answered.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet } from 'react-native'

import { BlendnScreen } from '../components/blendn/BlendnScreen'
import { ASK_AT, ORBS_LIFT_MS, ROOM_AT } from '../components/ds/MomentPour'
import { DURATION } from '../lib/design/tokens'
import { askIntentRoute, intentAnswered, submitCheckIn, type CheckInOutcome } from '../lib/checkIn'
import { H } from '../lib/haptics'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), __esModule: true, useReducedMotion: () => false }))
jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}))
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), replace: jest.fn() } }))
jest.mock('../lib/logger', () => ({
  Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() },
}))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Sam Rao', image: null } }) }))
jest.mock('../lib/apiClient', () => ({
  apiClient: new Proxy({}, { get: () => jest.fn(async () => ({ success: false })) }),
}))
jest.mock('../lib/locationFix', () => ({ getCurrentLocation: jest.fn(async () => ({ latitude: 12.97, longitude: 77.59, accuracy: 8 })) }))
jest.mock('../lib/roomVisibilityStorage', () => ({}))
jest.mock('../lib/checkIn', () => ({ ...jest.requireActual('../lib/checkIn'), submitCheckIn: jest.fn(), revealOffer: jest.fn() }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))

/* The room, as a store the test moves: it loads when the test says so. */
jest.mock('../lib/useRoom', () => {
  const { useSyncExternalStore } = jest.requireActual('react')
  const none = {
    status: 'none', event: null, people: [], arrivals: [], hereCount: 0, hasMore: false, loadingMore: false,
    checkedInAt: null, revealed: false, chatGroupId: null, match: null, wave: null, error: null, connection: 'connected',
    clearMatch: () => {}, connect: async () => ({}), loadMore: async () => {}, retry: () => {}, like: async () => ({ kind: 'liked' }),
    sendWave: async () => ({ kind: 'sent' }), remove: () => {}, refresh: async () => {},
  }
  let state: Record<string, unknown> = none
  const listeners = new Set<() => void>()
  return {
    useRoom: () => useSyncExternalStore((fn: () => void) => (listeners.add(fn), () => listeners.delete(fn)), () => state),
    mockRoomLoads: () => {
      state = { ...none, status: 'ready', event: { id: 'e1', title: 'Vinyl Night' } }
      listeners.forEach((fn) => fn())
    },
    mockRoomReset: () => {
      state = none
    },
  }
})
jest.mock('../lib/useTonight', () => ({
  useTonight: () => ({
    status: 'ready',
    events: [{ id: 'e1', title: 'Vinyl Night', venue: 'Toit', hereCount: 3, tasteMatchCount: null }],
    insideEventId: 'e1',
    location: 'on',
    offline: false,
    refresh: async () => {},
  }),
}))
jest.mock('../lib/useRoomControls', () => ({
  useRoomControls: () => ({
    revealed: false, revealBusy: false, listed: true, readiness: { ok: true, missing: null },
    toggleReveal: async () => {}, checkOut: async () => true, checkOutBusy: false,
  }),
}))
/* Tonight as what it shows of the pass: every label it renders is kept. */
const mockPassLabels: string[] = []
jest.mock('../components/blendn/TonightView', () => {
  const { Pressable, Text } = jest.requireActual('react-native')
  const { useEffect } = jest.requireActual('react')
  return {
    TonightView: ({
      checkingIn,
      youreIn,
      onCheckIn,
      onPassFrame,
    }: {
      checkingIn: boolean
      youreIn?: boolean
      onCheckIn: () => void
      onPassFrame?: (f: object) => void
    }) => {
      const label = checkingIn ? (youreIn ? 'You’re in' : 'Checking you in…') : 'Hold to blend in'
      mockPassLabels.push(label)
      // The docked pass, as Tonight measures it: 12 in, at the bottom, 234 tall.
      useEffect(() => onPassFrame?.({ x: 12, y: 584, width: 369, height: 234 }), [onPassFrame])
      return (
        <Pressable testID="tonight" onPress={onCheckIn}>
          <Text>{label}</Text>
        </Pressable>
      )
    },
  }
})
jest.mock('../components/blendn/RoomStage', () => {
  const { forwardRef } = jest.requireActual('react')
  return {
    RoomStage: forwardRef(({ children }: { children: React.ReactNode }, _ref: unknown) => children),
    useStageScroll: () => ({ onScroll: undefined, native: {}, scrollEventThrottle: 16 }),
  }
})
jest.mock('../components/blendn/RoomSections', () => ({
  faceOf: () => ({ kind: 'creature', pseudonym: 'Night Cat' }),
  RoomSkeleton: () => null,
  useNow: () => Date.now(),
  useGridCell: () => 100,
}))
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

const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } }
const { mockRoomLoads, mockRoomReset } = jest.requireMock('../lib/useRoom') as { mockRoomLoads: () => void; mockRoomReset: () => void }
const submit = submitCheckIn as jest.Mock
const HIDDEN = { includeHiddenElements: true }
const advance = (ms: number) => act(async () => jest.advanceTimersByTime(ms))
const fresh = (askIntent: boolean): CheckInOutcome => ({ kind: 'checkedIn', checkInId: 'c1', askIntent, revealSuggestion: false })
const roomShowing = () => screen.queryByTestId('room', HIDDEN) !== null
const tonightShowing = () => screen.queryByTestId('tonight', HIDDEN) !== null

let success: jest.SpyInstance
beforeEach(() => {
  jest.useFakeTimers()
  mockRoomReset()
  mockPassLabels.length = 0
  success = jest.spyOn(H, 'success').mockImplementation(() => {})
  jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {})
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false)
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false)
  jest.spyOn(AccessibilityInfo, 'isBoldTextEnabled').mockResolvedValue(false)
})
afterEach(() => jest.useRealTimers())

async function holdToCheckIn(outcome: CheckInOutcome) {
  submit.mockResolvedValue(outcome)
  await render(<BlendnScreen />)
  await act(async () => fireEvent.press(screen.getByTestId('tonight')))
  mockPassLabels.length = 0
}

it('no question: the pour holds, filled, until the Room has loaded, then hands off into it', async () => {
  await holdToCheckIn(fresh(false))
  expect(screen.getByText('You’re in.', HIDDEN)).toBeTruthy()
  // The flood fills the docked pass, not a panel of its own.
  expect(StyleSheet.flatten(screen.getByTestId('blendn-pour-panel', HIDDEN).props.style)).toMatchObject({ left: 12, top: 584, width: 369, height: 234 })
  // Past #9's 700 ms with no Room yet: still the pour over Tonight, the pass still "You're in".
  await advance(1500)
  expect(screen.getByTestId('blendn-pour', HIDDEN).props.pointerEvents).toBe('auto')
  expect(roomShowing()).toBe(false)
  expect(tonightShowing()).toBe(true)
  await act(async () => mockRoomLoads())
  await advance(0)
  // Handed off: it lets every touch through to the Room crossfading in under it.
  expect(screen.getByTestId('blendn-pour', HIDDEN).props.pointerEvents).toBe('none')
  expect(roomShowing()).toBe(true)
  expect(tonightShowing()).toBe(false)
  // Never a re-armed pass between the server's yes and the Room.
  expect(mockPassLabels).not.toContain('Hold to blend in')
  expect(mockPassLabels.length).toBeGreaterThan(0)
  expect(success).toHaveBeenCalledTimes(1)
  expect(router.push).not.toHaveBeenCalled()
})

it('"Why do you go out?": the pour plays out and clears, then the sheet over Tonight (#14), then the Room', async () => {
  let underTheSheet: { room: boolean; tonight: boolean; pourReleased: boolean } | null = null
  router.push.mockImplementation(() => {
    const pour = screen.queryByTestId('blendn-pour', HIDDEN)
    underTheSheet = { room: roomShowing(), tonight: tonightShowing(), pourReleased: !pour || pour.props.pointerEvents === 'none' }
  })
  await holdToCheckIn(fresh(true))
  // The room loads under the pour; it still waits its turn.
  await advance(300)
  await act(async () => mockRoomLoads())
  expect(roomShowing()).toBe(false)
  // Not at the Room's 700 ms: the pour holds "You're in." to ASK_AT, then fades over D.base.
  await advance(ROOM_AT - 300)
  expect(router.push).not.toHaveBeenCalled()
  await advance(ASK_AT - ROOM_AT)
  expect(router.push).not.toHaveBeenCalled()
  await advance(DURATION.base)
  expect(router.push).toHaveBeenCalledWith(askIntentRoute('e1'))
  expect(underTheSheet).toEqual({ room: false, tonight: true, pourReleased: true })
  // While the sheet is up: Tonight, the pass reading "You're in".
  await advance(3000)
  expect(roomShowing()).toBe(false)
  await act(async () => intentAnswered())
  await advance(0)
  expect(roomShowing()).toBe(true)
  expect(mockPassLabels).not.toContain('Hold to blend in')
})

describe('smooth: nothing heavy mounts while the pour moves (owner defect, Debug iOS drive)', () => {
  const stage = () => screen.queryByTestId('room-stage', HIDDEN)
  const pourReleased = () => screen.getByTestId('blendn-pour', HIDDEN).props.pointerEvents === 'none'

  it('the Room loaded mid-flood mounts hidden only once the pour holds still, and the hand-off comes after that mount', async () => {
    await holdToCheckIn(fresh(false))
    // The room answers 100 ms into the flood.
    await advance(100)
    await act(async () => mockRoomLoads())
    await advance(0)
    // Still moving (flood, "You're in.", the orbs' lift): no Room tree yet.
    expect(stage()).toBeNull()
    await advance(ORBS_LIFT_MS - 100 - 1)
    expect(stage()).toBeNull()
    await advance(1)
    // Still: the Room is mounted under the pour, hidden and untouchable; Tonight is still up.
    expect(stage()).not.toBeNull()
    expect(stage()!.props.pointerEvents).toBe('none')
    expect(stage()!.props.accessibilityElementsHidden).toBe(true)
    expect(tonightShowing()).toBe(true)
    expect(pourReleased()).toBe(false)
    // #9's 700 ms: the hand-off, into the Room that is already there.
    await advance(ROOM_AT - ORBS_LIFT_MS)
    expect(pourReleased()).toBe(true)
    expect(stage()!.props.pointerEvents).toBe('auto')
    expect(tonightShowing()).toBe(false)
    expect(success).toHaveBeenCalledTimes(1)
  })

  it('one hold is one check-in: a second activation while it runs sends nothing', async () => {
    submit.mockResolvedValue(fresh(false))
    await render(<BlendnScreen />)
    await act(async () => {
      fireEvent.press(screen.getByTestId('tonight'))
      fireEvent.press(screen.getByTestId('tonight'))
    })
    await advance(0)
    expect(submit).toHaveBeenCalledTimes(1)
  })
})

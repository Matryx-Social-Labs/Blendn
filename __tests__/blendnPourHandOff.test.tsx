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
import { motionTokens } from '../lib/motion'
import { askIntentRoute, intentAnswered, submitCheckIn, type CheckInOutcome } from '../lib/checkIn'
import { H } from '../lib/haptics'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
let mockReduceMotion = false
jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), __esModule: true, useReducedMotion: () => mockReduceMotion }))
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
jest.mock('../lib/locationFix', () => ({ warmLocationFix: jest.fn(async () => {}), getCurrentLocation: jest.fn(async () => ({ latitude: 12.97, longitude: 77.59, accuracy: 8 })) }))
jest.mock('../lib/roomVisibilityStorage', () => ({}))
// Coach marks have their own tests (coachMarks, pulseCoachMark); here they never show.
jest.mock('../lib/coachMarks', () => ({ useCoachMark: () => ({ visible: false, dismiss: () => {} }), markCoachUsed: () => {} }))
jest.mock('../lib/checkIn', () => ({ ...jest.requireActual('../lib/checkIn'), submitCheckIn: jest.fn(), revealOffer: jest.fn() }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))

/* The room, as a store the test moves: it loads when the test says so. */
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
  return {
    useRoom: () => useSyncExternalStore((fn: () => void) => (listeners.add(fn), () => listeners.delete(fn)), () => state),
    mockRoomLoads: () => {
      state = { ...none, status: 'ready', settled: true, event: { id: 'e1', title: 'Vinyl Night' } }
      listeners.forEach((fn) => fn())
    },
    /* Ready, but its count and chat haven't answered: the Room must not be revealed yet. */
    mockRoomReadyUnsettled: () => {
      state = { ...none, status: 'ready', settled: false, event: { id: 'e1', title: 'Vinyl Night' } }
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
const mockScrollY = jest.requireActual('react-native-reanimated').makeMutable(0)
jest.mock('../components/blendn/RoomStage', () => {
  const { forwardRef } = jest.requireActual('react')
  return {
    RoomStage: forwardRef(({ children }: { children: React.ReactNode }, _ref: unknown) => children),
    useStageScroll: () => ({ onScroll: undefined, native: {}, scrollEventThrottle: 16 }),
    useStage: () => ({ scrollY: mockScrollY, pan: {} }),
  }
})
jest.mock('../components/blendn/RoomSections', () => ({
  faceOf: () => ({ kind: 'creature', pseudonym: 'Night Cat' }),
  RoomSkeleton: () => null,
  useNow: () => Date.now(),
  useGridCell: () => 100,
}))
/* The Room, counting its mounts: the one pre-mounted under the pour must be the one that stays. */
let mockRoomMounts = 0
jest.mock('../components/blendn/RoomView', () => {
  const { View } = jest.requireActual('react-native')
  const { useEffect } = jest.requireActual('react')
  return {
    RoomView: () => {
      useEffect(() => {
        mockRoomMounts += 1
      }, [])
      return <View testID="room" />
    },
  }
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
const { mockRoomLoads, mockRoomReset, mockRoomReadyUnsettled } = jest.requireMock('../lib/useRoom') as {
  mockRoomLoads: () => void
  mockRoomReset: () => void
  mockRoomReadyUnsettled: () => void
}
const submit = submitCheckIn as jest.Mock
const HIDDEN = { includeHiddenElements: true }
const advance = (ms: number) => act(async () => jest.advanceTimersByTime(ms))
const fresh = (askIntent: boolean): CheckInOutcome => ({ kind: 'checkedIn', checkInId: 'c1', askIntent, revealSuggestion: false, left: [] })
const roomShowing = () => screen.queryByTestId('room', HIDDEN) !== null
const tonightShowing = () => screen.queryByTestId('tonight', HIDDEN) !== null
/** The pre-mounted Room laid out on the native side: the hand-off waits for this, as on a device. */
const layOut = () =>
  act(async () => fireEvent(screen.getByTestId('room-stage', HIDDEN), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 393, height: 852 } } }))
/** Past the crossfade (D.base, or Reduce Motion's 200 ms) and its fallback's slack. */
const AFTER_FADE = DURATION.base + 100

let success: jest.SpyInstance
beforeEach(() => {
  mockReduceMotion = false
  jest.useFakeTimers()
  mockRoomReset()
  mockPassLabels.length = 0
  mockRoomMounts = 0
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
  await layOut()
  // Handed off: it lets every touch through to the Room crossfading in over Tonight.
  expect(screen.getByTestId('blendn-pour', HIDDEN).props.pointerEvents).toBe('none')
  expect(roomShowing()).toBe(true)
  expect(tonightShowing()).toBe(true)
  await advance(AFTER_FADE)
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
    // Mounted in JS is not mounted on screen: past #9's 700 ms the pour still holds for the Room's native layout.
    await advance(ROOM_AT - ORBS_LIFT_MS)
    expect(pourReleased()).toBe(false)
    await layOut()
    // The hand-off, into the Room that is already there; Tonight stays under it until the crossfade is done.
    expect(pourReleased()).toBe(true)
    expect(stage()!.props.pointerEvents).toBe('auto')
    expect(tonightShowing()).toBe(true)
    await advance(AFTER_FADE)
    expect(tonightShowing()).toBe(false)
    expect(success).toHaveBeenCalledTimes(1)
  })

  it('a Room whose count and chat have not answered is not revealed: the pour holds until they have', async () => {
    await holdToCheckIn(fresh(false))
    await advance(100)
    await act(async () => mockRoomReadyUnsettled())
    await advance(ROOM_AT)
    // Past 700 ms: no Room mounted, the pour still holding over Tonight.
    expect(stage()).toBeNull()
    expect(pourReleased()).toBe(false)
    await act(async () => mockRoomLoads())
    await advance(0)
    expect(stage()).not.toBeNull()
    await layOut()
    expect(pourReleased()).toBe(true)
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

describe('Reduce Motion on (drive 2: stuck on "Checking you in…")', () => {
  const stage = () => screen.queryByTestId('room-stage', HIDDEN)
  const pourReleased = () => screen.getByTestId('blendn-pour', HIDDEN).props.pointerEvents === 'none'

  it('every step is a timer or state: the pour plays, hands off at #9’s 700 ms and the Room is there', async () => {
    mockReduceMotion = true
    await holdToCheckIn(fresh(false))
    expect(screen.getByText('You’re in.', HIDDEN)).toBeTruthy()
    await act(async () => mockRoomLoads())
    await advance(ORBS_LIFT_MS)
    await layOut()
    await advance(ROOM_AT - ORBS_LIFT_MS)
    expect(pourReleased()).toBe(true)
    expect(stage()).not.toBeNull()
    expect(stage()!.props.pointerEvents).toBe('auto')
    expect(tonightShowing()).toBe(true)
    await advance(AFTER_FADE)
    expect(tonightShowing()).toBe(false)
    expect(success).toHaveBeenCalledTimes(1)
  })

  it('with a question: the pour clears on its timer and the question is asked', async () => {
    mockReduceMotion = true
    await holdToCheckIn(fresh(true))
    await act(async () => mockRoomLoads())
    await advance(ASK_AT)
    // Reduce Motion's fade is 200 ms: a timer, not an animation's completion.
    await advance(200)
    expect(router.push).toHaveBeenCalledWith(askIntentRoute('e1'))
  })
})

describe('the crossfade: both layers at once (drive 2: a one-frame cut)', () => {
  it('at the hand-off the Room is already mounted under the pour, and the pour is still there to fade', async () => {
    await holdToCheckIn(fresh(false))
    await act(async () => mockRoomLoads())
    await advance(ORBS_LIFT_MS)
    // Before the hand-off: both mounted, the Room hidden.
    expect(screen.queryByTestId('room-stage', HIDDEN)).not.toBeNull()
    expect(screen.getByTestId('blendn-pour', HIDDEN)).toBeTruthy()
    await advance(ROOM_AT - ORBS_LIFT_MS)
    // After it: still both, the pour fading out over the Room fading in (opacity, not a mount).
    expect(screen.queryByTestId('room-stage', HIDDEN)).not.toBeNull()
    expect(screen.getByTestId('blendn-pour', HIDDEN)).toBeTruthy()
  })

  it('the readiness gate is the room hook’s `settled`: count, chat and avatars, not just the roster', async () => {
    await holdToCheckIn(fresh(false))
    await act(async () => mockRoomReadyUnsettled())
    await advance(ROOM_AT + 500)
    expect(screen.queryByTestId('room-stage', HIDDEN)).toBeNull()
  })
})

describe('the hand-off is one stack (drive 3: Tonight vanished in one frame, then an empty screen)', () => {
  const FRAME = 16
  const pour = () => screen.queryByTestId('blendn-pour', HIDDEN)
  const pourReleased = () => pour()?.props.pointerEvents === 'none'
  /** The two layers, in paint order (later is on top). */
  const layers = () => {
    const ids: string[] = []
    const walk = (n: unknown): void => {
      if (!n || typeof n !== 'object') return
      if (Array.isArray(n)) return n.forEach(walk)
      const node = n as { props?: { testID?: string }; children?: unknown }
      if (node.props?.testID === 'tonight-layer' || node.props?.testID === 'room-stage') ids.push(node.props.testID)
      walk(node.children)
    }
    walk(screen.toJSON())
    return ids
  }

  it.each([false, true])('Reduce Motion %s: Tonight or the Room in every frame, both at the hand-off, one Room, Tonight gone only after the fade', async (reduce) => {
    mockReduceMotion = reduce
    const fade = motionTokens(reduce).duration.base
    await holdToCheckIn(fresh(false))
    const frames: { t: number; tonight: boolean; room: boolean; released: boolean }[] = []
    let laidOut = false
    for (let t = 0; t <= 2000; t += FRAME) {
      if (t === 96) await act(async () => mockRoomLoads())
      if (!laidOut && screen.queryByTestId('room-stage', HIDDEN)) {
        // Mounted: an absolute layer above Tonight, never a flex sibling that halves it.
        expect(layers()).toEqual(['tonight-layer', 'room-stage'])
        expect(StyleSheet.flatten(screen.getByTestId('room-stage', HIDDEN).props.style)).toMatchObject({ position: 'absolute', top: 0, bottom: 0 })
        expect(StyleSheet.flatten(screen.getByTestId('tonight-layer', HIDDEN).props.style)).toMatchObject({ position: 'absolute', top: 0, bottom: 0 })
        await layOut()
        laidOut = true
      }
      frames.push({ t, tonight: tonightShowing(), room: roomShowing(), released: pourReleased() })
      await advance(FRAME)
    }
    // Never an empty frame from the pour's start to settled.
    expect(frames.filter((f) => !f.tonight && !f.room)).toEqual([])
    const handOff = frames.find((f) => f.released)!
    expect(handOff).toBeDefined()
    // At the hand-off: both layers.
    expect(handOff).toMatchObject({ tonight: true, room: true })
    // Tonight stays through the fade and goes after it.
    const tonightGone = frames.find((f) => f.t > handOff.t && !f.tonight)!
    expect(tonightGone.t - handOff.t).toBeGreaterThanOrEqual(fade)
    expect(tonightGone.t - handOff.t).toBeLessThanOrEqual(fade + 100)
    expect(frames.filter((f) => f.t >= tonightGone.t).every((f) => f.room && !f.tonight)).toBe(true)
    // The Room mounted once, under the pour, and is the one that stays.
    expect(mockRoomMounts).toBe(1)
    expect(screen.getByTestId('room-stage', HIDDEN).props.pointerEvents).toBe('auto')
    // Under the fade the pass never re-armed.
    expect(mockPassLabels).not.toContain('Hold to blend in')
  })
})

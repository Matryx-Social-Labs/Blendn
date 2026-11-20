/*
 * The home drawer's travel (BUILD-SPEC §0, `drawer`): M.settle from the token,
 * and under Reduce Motion a short timing on the standard curve rather than an
 * instant jump.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils'
import { State } from 'react-native-gesture-handler'
import { StyleSheet } from 'react-native'
import React, { useState } from 'react'
import { Text } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { DrawerCover, HomeDrawer } from '../components/home/HomeDrawer'
import { SHEET_ORBS } from '../components/ds/Orbs'
import { COLOR, EASING, MATERIAL, REDUCE_MOTION, SPRING } from '../lib/design/tokens'
import { DRAWER_HEADER_HEIGHT, DRAWER_SNAP_LABEL, type DrawerSnap } from '../lib/home'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return {
    ...actual,
    __esModule: true,
    useReducedMotion: jest.fn(() => false),
    withSpring: jest.fn(actual.withSpring),
    withTiming: jest.fn(actual.withTiming),
  }
})
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const points = { full: 100, half: 400, peek: 700 }
const drawer = (snap: 'full' | 'half' | 'peek') => {
  const y = Reanimated.makeMutable(points.half)
  return (
    <HomeDrawer y={y} points={points} snap={snap} onSnap={jest.fn()} header={<Text>header</Text>}>
      <Text>pane</Text>
    </HomeDrawer>
  )
}

beforeEach(() => {
  jest.mocked(Reanimated.withSpring).mockClear()
  jest.mocked(Reanimated.withTiming).mockClear()
})

describe('the drawer travels', () => {
  it('on M.settle, from the token', async () => {
    reduceMotion.mockReturnValue(false)
    await render(drawer('full'))
    expect(Reanimated.withSpring).toHaveBeenCalledWith(
      points.full,
      expect.objectContaining({ stiffness: SPRING.settle.stiffness, damping: SPRING.settle.damping, mass: SPRING.settle.mass }),
      expect.any(Function)
    )
    expect(Reanimated.withTiming).not.toHaveBeenCalled()
  })

  it('under Reduce Motion, on a 200 ms standard-curve timing: gentler, never an instant jump', async () => {
    reduceMotion.mockReturnValue(true)
    await render(drawer('full'))
    expect(Reanimated.withSpring).not.toHaveBeenCalled()
    expect(Reanimated.withTiming).toHaveBeenCalledWith(points.full, expect.objectContaining({ duration: REDUCE_MOTION.duration.base }), expect.any(Function))
    expect(REDUCE_MOTION.duration.base).toBe(200)
    expect(EASING.standard).toHaveLength(4)
  })
})

/*
 * Owner, 2026-11-03: the drawer must look like the approved board, "not gray". The board's `.drawer` computes to ink at 80%
 * over the dark map (96% at full), a 0.5 pt rim (10%, 18% along the top), and three brand orbs at 60% when not full
 * (kit.css `.orbs`). Its neutral reads #0F1012, within a few levels of ink; the grey (#171618 measured) was iOS 26's
 * regular glass under the old Material layer, and Android stood on the sheet's grey fill.
 */
describe('the drawer is the board’s: ink, the rim and the three orbs, on every tier', () => {
  const { Platform } = jest.requireActual('react-native')
  const original = Platform.OS
  afterEach(() => Object.defineProperty(Platform, 'OS', { value: original, configurable: true }))

  it.each([
    ['ios', 'peek'],
    ['ios', 'half'],
    ['ios', 'full'],
    ['android', 'peek'],
    ['android', 'half'],
    ['android', 'full'],
  ] as const)('%s at %s: an opaque ink drawer, with no glass and no wash over it', async (os, snap) => {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
    reduceMotion.mockReturnValue(false)
    await render(drawer(snap))
    expect(StyleSheet.flatten(screen.getByTestId('home-drawer', { includeHiddenElements: true }).props.style).backgroundColor).toBe(COLOR.ink)
    // Control for what made it grey: the sheet glass and the fading wash are gone.
    expect(screen.queryByTestId('drawer-glass', { includeHiddenElements: true })).toBeNull()
    expect(screen.queryByTestId('drawer-opaque', { includeHiddenElements: true })).toBeNull()
  })

  it('the rim: 0.5 pt at 10% all round, 18% along the top (kit.css `.drawer` box-shadow)', async () => {
    await render(drawer('half'))
    expect(StyleSheet.flatten(screen.getByTestId('drawer-rim', { includeHiddenElements: true }).props.style)).toMatchObject({
      borderWidth: 0.5,
      borderColor: COLOR.hairline,
      borderTopColor: MATERIAL.glassSpecular,
    })
  })

  it('the orbs: 60% below full, none at full (the board’s `.full` has none)', async () => {
    await render(drawer('half'))
    expect(StyleSheet.flatten(screen.getByTestId('drawer-orbs', { includeHiddenElements: true }).props.style).opacity).toBe(0.6)
    // The drawer resting at full (its edge at `points.full`).
    await render(
      <HomeDrawer y={Reanimated.makeMutable(points.full)} points={points} snap="full" onSnap={jest.fn()} header={<Text>header</Text>}>
        <Text>pane</Text>
      </HomeDrawer>
    )
    expect(StyleSheet.flatten(screen.getByTestId('drawer-orbs', { includeHiddenElements: true }).props.style).opacity).toBe(0)
  })

  it('the three orbs are the board’s, to the percent: ember top-left, violet right, rose low', () => {
    expect(SHEET_ORBS).toEqual([
      { color: COLOR.brandOrange, alpha: 0.18, cx: 0.08, cy: 0.06, rx: 0.6, ry: 0.34 },
      { color: COLOR.brandViolet, alpha: 0.14, cx: 1, cy: 0.22, rx: 0.55, ry: 0.3 },
      { color: COLOR.brandRose, alpha: 0.1, cx: 0.3, cy: 0.7, rx: 0.5, ry: 0.3 },
    ])
    expect([COLOR.brandOrange, COLOR.brandViolet, COLOR.brandRose]).toEqual(['#F05423', '#925DA9', '#BE5C71'])
  })
})

describe('a pinned row inside the drawer is the drawer: plain ink, never a bar (rc7 D3, owner 2026-11-03)', () => {
  const { Platform } = jest.requireActual('react-native')
  const { StickyBar } = jest.requireActual('../components/pulse/StickyBar')
  const pinned = (y: number, scrolled?: boolean) => (
    <HomeDrawer y={Reanimated.makeMutable(y)} points={points} snap="full" onSnap={jest.fn()} header={<Text>header</Text>}>
      <StickyBar scrolled={scrolled}>
        <Text>chips</Text>
      </StickyBar>
    </HomeDrawer>
  )
  const original = Platform.OS
  afterEach(() => Object.defineProperty(Platform, 'OS', { value: original, configurable: true }))

  it.each([
    ['ios', false],
    ['ios', true],
    ['android', false],
    ['android', true],
  ] as const)('%s, scrolled %s: the row stands on ink, so nothing shows through and no band reads as a rail', async (os, scrolled) => {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
    await render(pinned(points.full, scrolled))
    const ground = screen.getByTestId('sticky-search-ground', { includeHiddenElements: true })
    expect(StyleSheet.flatten(ground.props.style)).toMatchObject({ position: 'absolute', backgroundColor: COLOR.ink })
    // The drawer's own orbs, placed where this row sits in it (under the header), so there is no band: the glow runs on.
    const orbs = screen.getByTestId('sticky-search-ground-orbs', { includeHiddenElements: true })
    expect(StyleSheet.flatten(orbs.props.style).top).toBe(-DRAWER_HEADER_HEIGHT)
    expect(screen.queryByTestId('sticky-search-bar', { includeHiddenElements: true })).toBeNull()
  })

  it('outside a drawer the scrolled row keeps its bar, since no ground stands behind it', async () => {
    await render(
      <StickyBar scrolled>
        <Text>search</Text>
      </StickyBar>
    )
    expect(screen.getByTestId('sticky-search-bar', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByTestId('sticky-search-ground', { includeHiddenElements: true })).toBeNull()
  })
})

/*
 * SCRUM-1079 (TalkBack, 2026-11-19): the drawer stayed drawn at half while it read "Collapsed". At peek, a two-finger drag
 * let go near half; TalkBack's swipe-down reached the handle before that release had rendered, so it stepped down from
 * the stale "peek" (to peek again). The two updates netted to no change, the effect that moves the drawer never re-ran,
 * and the release's own spring to half stood. Reproduced on the emulator with the JS thread held busy at the release.
 * The drawer is moved to the committed snap after every settle, whether or not the snap changed.
 */
describe('the drawer drawn and the drawer spoken never disagree', () => {
  function Shell({ start }: { start: DrawerSnap }) {
    const [snap, setSnap] = useState<DrawerSnap>(start)
    const y = Reanimated.useSharedValue(points[start])
    return (
      <HomeDrawer y={y} points={points} snap={snap} onSnap={setSnap} header={<Text>header</Text>}>
        <Text>pane</Text>
      </HomeDrawer>
    )
  }
  const handle = () => screen.getByLabelText('Events and places')
  const spoken = () => handle().props.accessibilityValue.text
  const drawnTo = () => {
    const calls = jest.mocked(Reanimated.withSpring).mock.calls
    return calls[calls.length - 1]?.[0]
  }
  const release = (to: number) =>
    fireGestureHandler(getByGestureTestId('home-drawer-pan'), [
      { state: State.BEGAN, translationY: 0 },
      { state: State.ACTIVE, translationY: 0 },
      { state: State.ACTIVE, translationY: to },
      { state: State.END, translationY: to, velocityY: 0 },
    ])
  const step = (actionName: 'increment' | 'decrement') => fireEvent(handle(), 'accessibilityAction', { nativeEvent: { actionName } })

  beforeEach(() => reduceMotion.mockReturnValue(false))

  it('a drag let go near half from peek, then a screen reader step down before it rendered: drawn where it is read', async () => {
    await render(<Shell start="peek" />)
    await act(async () => {
      release(points.half - points.peek + 60)
      await Promise.resolve()
      await Promise.resolve()
      step('decrement')
    })
    expect(spoken()).toBe(DRAWER_SNAP_LABEL.peek)
    expect(drawnTo()).toBe(points.peek)
  })

  it('the same at the top: let go near half from full, then a step up before it rendered', async () => {
    await render(<Shell start="full" />)
    await act(async () => {
      release(points.half - points.full - 60)
      await Promise.resolve()
      await Promise.resolve()
      step('increment')
    })
    expect(spoken()).toBe(DRAWER_SNAP_LABEL.full)
    expect(drawnTo()).toBe(points.full)
  })

  it('control: a drag on its own settles where it is let go, and reads it', async () => {
    await render(<Shell start="peek" />)
    await act(async () => {
      release(points.half - points.peek + 60)
    })
    expect(spoken()).toBe(DRAWER_SNAP_LABEL.half)
    expect(drawnTo()).toBe(points.half)
  })

  it('control: a screen reader step on its own moves it one snap, and reads it', async () => {
    await render(<Shell start="half" />)
    await act(async () => step('decrement'))
    expect(spoken()).toBe(DRAWER_SNAP_LABEL.peek)
    expect(drawnTo()).toBe(points.peek)
  })
})

/*
 * SCRUM-1090 (owner, 2026-11-20: "when you pull the drawer on the pulse screen back up now its messed up, it flickers").
 * Measured on the iOS sim (slit scans of the drawer's edge, before/after frame strips): pulled up from peek, the drawer
 * rose as bare ink, its pane cut to peek's height, and the list popped in only once it had settled; the peek line sat over
 * the chips the whole way up. And every settle issued a second animation toward the target the release was already
 * springing to (#592). One animation per move; the pane as tall as full while the drawer travels; the line off the chips.
 */
describe('the drawer moves once, and its pane is there all the way', () => {
  function Shell({ start, peek }: { start: DrawerSnap; peek?: boolean }) {
    const [snap, setSnap] = useState<DrawerSnap>(start)
    const y = Reanimated.useSharedValue(points[start])
    return (
      <HomeDrawer y={y} points={points} snap={snap} onSnap={setSnap} header={<Text>header</Text>} peek={peek ? <Text>peek line</Text> : undefined}>
        <Text testID="pane">pane</Text>
      </HomeDrawer>
    )
  }
  const paneHeight = () => StyleSheet.flatten(screen.getByTestId('home-drawer-pane', { includeHiddenElements: true }).props.style)?.height
  const content = (snap: DrawerSnap) => 800 - points[snap] - DRAWER_HEADER_HEIGHT
  const pan = () => getByGestureTestId('home-drawer-pan')
  const animations = () => jest.mocked(Reanimated.withSpring).mock.calls.length + jest.mocked(Reanimated.withTiming).mock.calls.length
  // What the UI thread hands back (`scheduleOnRN`) lands on a microtask under Jest.
  const flush = async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve()
  }

  beforeEach(() => {
    reduceMotion.mockReturnValue(false)
    jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width: 400, height: 800, scale: 3, fontScale: 1 })
  })
  afterEach(() => jest.restoreAllMocks())

  it('a release starts one animation, and the settle that follows never starts a second toward the same snap', async () => {
    await render(<Shell start="peek" />)
    jest.mocked(Reanimated.withSpring).mockClear()
    await act(async () => {
      fireGestureHandler(pan(), [
        { state: State.BEGAN, translationY: 0 },
        { state: State.ACTIVE, translationY: 0 },
        { state: State.ACTIVE, translationY: points.full - points.peek },
        { state: State.END, translationY: points.full - points.peek, velocityY: 0 },
      ])
      await flush()
    })
    expect(jest.mocked(Reanimated.withSpring).mock.calls.map((c) => c[0])).toEqual([points.full])
  })

  it('the same under Reduce Motion: one timing, never restarted', async () => {
    reduceMotion.mockReturnValue(true)
    await render(<Shell start="half" />)
    jest.mocked(Reanimated.withTiming).mockClear()
    await act(async () => {
      fireGestureHandler(pan(), [
        { state: State.BEGAN, translationY: 0 },
        { state: State.ACTIVE, translationY: 0 },
        { state: State.ACTIVE, translationY: points.full - points.half },
        { state: State.END, translationY: points.full - points.half, velocityY: 0 },
      ])
      await flush()
    })
    expect(jest.mocked(Reanimated.withTiming).mock.calls.map((c) => c[0])).toEqual([points.full])
  })

  it('control: a tap on the handle is one animation too', async () => {
    await render(<Shell start="peek" />)
    jest.mocked(Reanimated.withSpring).mockClear()
    jest.mocked(Reanimated.withTiming).mockClear()
    await act(async () => fireEvent.press(screen.getByLabelText('Events and places')))
    expect(animations()).toBe(1)
    expect(jest.mocked(Reanimated.withSpring).mock.calls[0][0]).toBe(points.half)
  })

  // Fake timers hold the drawer mid-travel: Jest's gesture helper always ends the gesture, and its spring then runs on.
  it('pulled up from peek, the pane is as tall as full from the first frame of the drag, not once it settles', async () => {
    jest.useFakeTimers({ doNotFake: ['queueMicrotask'] })
    await render(<Shell start="peek" />)
    expect(paneHeight()).toBe(content('peek'))
    await act(async () => {
      fireGestureHandler(pan(), [
        { state: State.BEGAN, translationY: 0 },
        { state: State.ACTIVE, translationY: 0 },
        { state: State.ACTIVE, translationY: -40 },
      ])
      await flush()
    })
    expect(paneHeight()).toBe(content('full'))
    jest.useRealTimers()
  })

  it('at rest the pane is the snap’s again, so the last row is reachable at half', async () => {
    jest.useFakeTimers({ doNotFake: ['queueMicrotask'] })
    await render(<Shell start="peek" />)
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Events and places'))
      await flush()
    })
    expect(paneHeight()).toBe(content('full'))
    await act(async () => {
      jest.advanceTimersByTime(2000)
      await flush()
    })
    expect(paneHeight()).toBe(content('half'))
    jest.useRealTimers()
  })

  it('the peek line leaves the chips as soon as the drawer moves, and is back once it rests at peek', async () => {
    jest.useFakeTimers({ doNotFake: ['queueMicrotask'] })
    await render(<Shell start="peek" peek />)
    expect(screen.getByText('peek line')).toBeTruthy()
    await act(async () => {
      fireGestureHandler(pan(), [
        { state: State.BEGAN, translationY: 0 },
        { state: State.ACTIVE, translationY: 0 },
        { state: State.ACTIVE, translationY: -40 },
      ])
      await flush()
    })
    expect(screen.queryByText('peek line')).toBeNull()
    await act(async () => {
      jest.advanceTimersByTime(2000)
      await flush()
    })
    expect(screen.getByText('peek line')).toBeTruthy()
    jest.useRealTimers()
  })
})

/*
 * SCRUM-1090, sheet 17 pick A (advisor, 2026-11-20): the board's FULL draws the top bar on ink. The strip of map left
 * under the top bar fades to the drawer's ink as the drawer rises past half, so nothing of the map can sit under the
 * Blend'n mark at full. At rest at peek only the header and its one line show (the board's PEEK).
 */
describe('the drawer at full covers the map, and at peek shows only its line', () => {
  const cover = (at: number) => {
    const y = Reanimated.makeMutable(at)
    return <DrawerCover y={y} points={points} height={140} />
  }
  const coverOpacity = () => StyleSheet.flatten(screen.getByTestId('drawer-cover', { includeHiddenElements: true }).props.style).opacity
  const coverStyle = () => StyleSheet.flatten(screen.getByTestId('drawer-cover', { includeHiddenElements: true }).props.style)

  it('the cover is the drawer’s ink, as tall as it is told, and never takes a touch', async () => {
    await render(cover(points.full))
    expect(coverStyle()).toMatchObject({ backgroundColor: COLOR.ink, height: 140, top: 0 })
    expect(screen.getByTestId('drawer-cover', { includeHiddenElements: true }).props.pointerEvents).toBe('none')
  })

  it('opaque at full, clear at half and below, halfway between halfway up', async () => {
    await render(cover(points.full))
    expect(coverOpacity()).toBe(1)
    await render(cover((points.full + points.half) / 2))
    expect(coverOpacity()).toBeCloseTo(0.5)
    await render(cover(points.half))
    expect(coverOpacity()).toBe(0)
    // Control: below half it stays clear (clamped), never negative.
    await render(cover(points.peek))
    expect(coverOpacity()).toBe(0)
  })

  function Shell({ start, peek }: { start: DrawerSnap; peek?: boolean }) {
    const [snap, setSnap] = useState<DrawerSnap>(start)
    const y = Reanimated.useSharedValue(points[start])
    return (
      <HomeDrawer y={y} points={points} snap={snap} onSnap={setSnap} header={<Text>header</Text>} peek={peek ? <Text>peek line</Text> : undefined}>
        <Text testID="pane">pane</Text>
      </HomeDrawer>
    )
  }
  const pane = () => screen.getByTestId('home-drawer-pane', { includeHiddenElements: true })
  const flush = async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve()
  }
  const paneHidden = () => {
    const p = pane()
    return StyleSheet.flatten(p.props.style).opacity === 0 && p.props.importantForAccessibility === 'no-hide-descendants' && p.props.pointerEvents === 'none'
  }

  it('at rest at peek the pane is hidden under the line: not drawn, not read, not touched', async () => {
    reduceMotion.mockReturnValue(false)
    await render(<Shell start="peek" peek />)
    expect(paneHidden()).toBe(true)
    expect(screen.getByText('peek line')).toBeTruthy()
  })

  it('the pane is back the moment the drawer moves off peek', async () => {
    jest.useFakeTimers({ doNotFake: ['queueMicrotask'] })
    await render(<Shell start="peek" peek />)
    await act(async () => {
      fireGestureHandler(getByGestureTestId('home-drawer-pan'), [
        { state: State.BEGAN, translationY: 0 },
        { state: State.ACTIVE, translationY: 0 },
        { state: State.ACTIVE, translationY: -40 },
      ])
      await flush()
    })
    expect(paneHidden()).toBe(false)
    jest.useRealTimers()
  })

  it.each(['half', 'full'] as const)('control: at %s the pane is shown and read', async (snap) => {
    await render(<Shell start={snap} peek />)
    expect(paneHidden()).toBe(false)
  })

  it('a screen reader’s escape at full steps the drawer down to half', async () => {
    await render(<Shell start="full" />)
    await act(async () => {
      fireEvent(screen.getByTestId('home-drawer', { includeHiddenElements: true }), 'accessibilityEscape')
      await flush()
    })
    expect(screen.getByLabelText('Events and places').props.accessibilityValue).toEqual({ text: DRAWER_SNAP_LABEL.half })
  })

  it('control: below full the escape does nothing (it is not the drawer’s to take)', async () => {
    await render(<Shell start="half" />)
    expect(screen.getByTestId('home-drawer', { includeHiddenElements: true }).props.onAccessibilityEscape).toBeUndefined()
  })
})

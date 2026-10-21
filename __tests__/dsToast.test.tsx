/*
 * <Toast> (guidelines/components/Toast.html, motion #19): a glass capsule at
 * the top on iOS, a raised snackbar at the bottom on Android; the outcome
 * haptic only for a server's answer; a polite announcement; the dwell, paused
 * while touched; and Reduce Motion.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { Toast, toastDwell } from '../components/ds/Toast'
import { TAB_BAR_HINT_RISE } from '../components/ds/TabBar'
import { COLOR, DURATION, RADIUS, SIZE, SPACE } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false), withSpring: jest.fn(actual.withSpring), withTiming: jest.fn(actual.withTiming) }
})
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return {
    GlassView: (props: object) => <View {...props} testID="glass" />,
    isGlassEffectAPIAvailable: jest.fn(() => true),
    isLiquidGlassAvailable: jest.fn(() => true),
  }
})

/** The safe-area mock has no insets. */
const INSET_BOTTOM = 0
const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
const advance = (ms: number) => act(async () => jest.advanceTimersByTime(ms))

let haptic: Record<'success' | 'error', jest.SpyInstance>
let announce: jest.SpyInstance
beforeEach(() => {
  jest.useFakeTimers()
  on('ios')
  reduceMotion.mockReturnValue(false)
  haptic = {
    success: jest.spyOn(H, 'success').mockImplementation(() => {}),
    error: jest.spyOn(H, 'error').mockImplementation(() => {}),
  }
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
})
afterEach(() => jest.useRealTimers())

describe('the success check draws (foundations)', () => {
  it('success is a drawn circle-check; error and info stay still', async () => {
    await render(<Toast kind="success" text="Saved to Going" onDismiss={jest.fn()} testID="t" />)
    expect(screen.getByTestId('t-glyph', { includeHiddenElements: true })).toBeTruthy()
    await render(<Toast kind="error" text="Couldn’t save" onDismiss={jest.fn()} testID="e" />)
    expect(screen.queryByTestId('e-glyph', { includeHiddenElements: true })).toBeNull()
    await render(<Toast kind="info" text="Copied" onDismiss={jest.fn()} testID="i" />)
    expect(screen.queryByTestId('i-glyph', { includeHiddenElements: true })).toBeNull()
  })

  it('it strokes in as the toast appears, on the frame H.success plays, and not for an error', async () => {
    const stroke = jest.spyOn(Reanimated, 'withDelay')
    await render(<Toast kind="success" text="Saved to Going" onDismiss={jest.fn()} testID="t" />)
    expect(haptic.success).toHaveBeenCalledTimes(1)
    // circle-check is two strokes, one delay each.
    expect(stroke).toHaveBeenCalledTimes(2)
    stroke.mockClear()
    await render(<Toast kind="error" text="Couldn’t save" onDismiss={jest.fn()} testID="e" />)
    expect(stroke).not.toHaveBeenCalled()
    stroke.mockRestore()
  })

  it('Reduce Motion: the check stands drawn, nothing strokes in', async () => {
    reduceMotion.mockReturnValue(true)
    const stroke = jest.spyOn(Reanimated, 'withDelay')
    await render(<Toast kind="success" text="Saved to Going" onDismiss={jest.fn()} testID="t" />)
    expect(stroke).not.toHaveBeenCalled()
    stroke.mockRestore()
  })
})

describe('toastDwell', () => {
  it('is at least 5 s, plus 1 s per 8 words', () => {
    expect(toastDwell('Saved to Going', {})).toBe(5000)
    expect(toastDwell('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen', {})).toBe(7000)
  })

  it('is at least 10 s with Undo or a screen reader', () => {
    expect(toastDwell('Removed from Going', { action: true })).toBe(10000)
    expect(toastDwell('Removed from Going', { screenReader: true })).toBe(10000)
  })
})

describe('<Toast>', () => {
  it('iOS: a glass capsule at the top, its kind’s tint', async () => {
    await render(<Toast kind="success" text="Saved to Going" onDismiss={jest.fn()} testID="t" />)
    expect(screen.getByTestId('glass')).toBeTruthy()
    expect(flat('t')).toMatchObject({ top: SPACE.sm, left: SPACE.lg, right: SPACE.lg })
    expect(flat('t-tint').backgroundColor).toBe(COLOR.liveTint)
  })

  it('Android: a raised snackbar at the bottom, above the tab bar when one shows', async () => {
    on('android')
    await render(<Toast kind="error" text="Couldn’t save. Try again." onDismiss={jest.fn()} testID="t" />)
    expect(screen.queryByTestId('glass')).toBeNull()
    expect(flat('t-body')).toMatchObject({ backgroundColor: COLOR.surfaceRaised, borderRadius: RADIUS.pressedAndroid })
    expect(flat('t').bottom).toBe(SPACE.lg)
    await render(<Toast kind="error" text="Couldn’t save." onDismiss={jest.fn()} aboveTabBar testID="t" />)
    // Over the bar and over the centre button's check-in pill, which rises 36 above it (drive 3).
    expect(TAB_BAR_HINT_RISE).toBe(36)
    expect(flat('t').bottom).toBe(SPACE.tabBarBottomGapAndroid + SIZE.tabBar + TAB_BAR_HINT_RISE + SPACE.md)
  })

  it('Android: no dock sits at the bottom inset + 16; a dock of 100 lifts it to + 116; the tab roots are unchanged', async () => {
    on('android')
    await render(<Toast kind="error" text="Couldn’t save." onDismiss={jest.fn()} testID="t" />)
    expect(flat('t').bottom).toBe(INSET_BOTTOM + SPACE.lg)
    await render(<Toast kind="error" text="Couldn’t save." onDismiss={jest.fn()} dock={100} testID="d" />)
    expect(flat('d').bottom).toBe(INSET_BOTTOM + 100 + SPACE.lg)
    await render(<Toast kind="error" text="Couldn’t save." onDismiss={jest.fn()} aboveTabBar dock={100} testID="r" />)
    expect(flat('r').bottom).toBe(INSET_BOTTOM + SPACE.tabBarBottomGapAndroid + SIZE.tabBar + TAB_BAR_HINT_RISE + SPACE.md)
  })

  it('reports its laid-out height, so a screen can leave room under it', async () => {
    const onHeight = jest.fn()
    await render(<Toast kind="info" text="Saved" onDismiss={jest.fn()} onHeight={onHeight} testID="t" />)
    await act(async () => fireEvent(screen.getByTestId('t'), 'layout', { nativeEvent: { layout: { width: 300, height: 52, x: 0, y: 0 } } }))
    expect(onHeight).toHaveBeenCalledWith(52)
  })

  it.each([
    ['success', 'success'],
    ['error', 'error'],
  ] as const)('a %s toast reporting the server’s answer plays H.%s, once', async (kind, token) => {
    await render(<Toast kind={kind} text="Saved" onDismiss={jest.fn()} />)
    expect(haptic[token]).toHaveBeenCalledTimes(1)
  })

  it('info and Copy (silent) play nothing', async () => {
    await render(<Toast kind="info" text="You left Vinyl Night." onDismiss={jest.fn()} />)
    await render(<Toast kind="success" text="Link copied" silent onDismiss={jest.fn()} />)
    expect(haptic.success).not.toHaveBeenCalled()
    expect(haptic.error).not.toHaveBeenCalled()
  })

  it('is announced politely on iOS, never stealing focus; Undo is a button', async () => {
    const undo = jest.fn()
    const onDismiss = jest.fn()
    await render(<Toast kind="success" text="Removed from Going" action={{ label: 'Undo', onPress: undo }} onDismiss={onDismiss} />)
    expect(announce).toHaveBeenCalledWith('Removed from Going. Undo is available.')
    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledTimes(1)
    await advance(1000)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('is a live region on Android: polite, assertive for an error', async () => {
    on('android')
    await render(<Toast kind="info" text="You left." onDismiss={jest.fn()} testID="t" />)
    expect(screen.getByTestId('t').props.accessibilityLiveRegion).toBe('polite')
    await render(<Toast kind="error" text="Couldn’t save." onDismiss={jest.fn()} testID="t" />)
    expect(screen.getByTestId('t').props.accessibilityLiveRegion).toBe('assertive')
  })

  it('leaves after its dwell, and holds while touched', async () => {
    const onDismiss = jest.fn()
    await render(<Toast kind="info" text="You left Vinyl Night." onDismiss={onDismiss} testID="t" />)
    await advance(3000)
    await fireEvent(screen.getByTestId('t'), 'touchStart')
    await advance(10000)
    expect(onDismiss).not.toHaveBeenCalled()
    await fireEvent(screen.getByTestId('t'), 'touchEnd')
    await advance(2000)
    // Then the exit plays.
    await advance(1000)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('a parent re-rendering does not restart the dwell', async () => {
    const onDismiss = jest.fn()
    await render(<Toast kind="info" text="You left." onDismiss={() => onDismiss()} />)
    for (let i = 0; i < 3; i++) {
      await advance(2000)
      await screen.rerender(<Toast kind="info" text="You left." onDismiss={() => onDismiss()} />)
    }
    await advance(0)
    await advance(1000)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('a second finger does not count the hold twice', async () => {
    const onDismiss = jest.fn()
    await render(<Toast kind="info" text="You left." onDismiss={onDismiss} testID="t" />)
    await advance(2000)
    await fireEvent(screen.getByTestId('t'), 'touchStart')
    await advance(1500)
    await fireEvent(screen.getByTestId('t'), 'touchStart')
    await advance(500)
    await fireEvent(screen.getByTestId('t'), 'touchEnd')
    // 3 s of dwell were left when the first finger landed.
    await advance(2900)
    expect(onDismiss).not.toHaveBeenCalled()
    await advance(100)
    await advance(1000)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does not call onDismiss after it has been unmounted', async () => {
    const onDismiss = jest.fn()
    await render(<Toast kind="info" text="Removed" action={{ label: 'Undo', onPress: () => {} }} onDismiss={onDismiss} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }))
    await screen.unmount()
    await advance(20000)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('enters on M.snap; under Reduce Motion it does not move', async () => {
    await render(<Toast kind="info" text="Hi" onDismiss={jest.fn()} />)
    expect(Reanimated.withSpring).toHaveBeenCalledWith(0, expect.objectContaining({ stiffness: 439 }))
    ;(Reanimated.withSpring as jest.Mock).mockClear()
    reduceMotion.mockReturnValue(true)
    await render(<Toast kind="info" text="Hi" onDismiss={jest.fn()} />)
    expect(Reanimated.withSpring).not.toHaveBeenCalled()
  })

  describe('#19: it fades as it enters and leaves, on both platforms (the Toast page: "+ fade")', () => {
    const withTiming = Reanimated.withTiming as jest.Mock
    beforeEach(() => withTiming.mockClear())
    const fadedIn = (duration: number) => withTiming.mock.calls.some(([to, cfg]) => to === 1 && cfg.duration === duration)
    const fadedOut = () => withTiming.mock.calls.some(([to, cfg]) => to === 0 && cfg.duration === 160)

    it('iOS: opacity starts at 0 and fades in over quick, on the gentle curve', async () => {
      await render(<Toast kind="info" text="Hi" onDismiss={jest.fn()} testID="t" />)
      expect(fadedIn(160)).toBe(true)
    })

    it('Android: the same', async () => {
      on('android')
      await render(<Toast kind="info" text="Hi" onDismiss={jest.fn()} testID="t" />)
      expect(fadedIn(160)).toBe(true)
    })

    it.each(['ios', 'android'] as const)('%s: it fades out over quick when it leaves', async (os) => {
      on(os)
      await render(<Toast kind="info" text="Hi" action={{ label: 'Undo', onPress: () => {} }} onDismiss={jest.fn()} />)
      withTiming.mockClear()
      await fireEvent.press(screen.getByRole('button', { name: 'Undo' }))
      expect(fadedOut()).toBe(true)
    })

    it.each(['ios', 'android'] as const)('%s, Reduce Motion: no move, a fade in place over 200, and out over quick', async (os) => {
      on(os)
      reduceMotion.mockReturnValue(true)
      ;(Reanimated.withSpring as jest.Mock).mockClear()
      const onDismiss = jest.fn()
      await render(<Toast kind="info" text="Hi" action={{ label: 'Undo', onPress: () => {} }} onDismiss={onDismiss} />)
      expect(Reanimated.withSpring).not.toHaveBeenCalled()
      expect(fadedIn(200)).toBe(true)
      withTiming.mockClear()
      await fireEvent.press(screen.getByRole('button', { name: 'Undo' }))
      expect(fadedOut()).toBe(true)
      // It stays for the length of the fade, not a frame: iOS used to vanish at once.
      expect(onDismiss).not.toHaveBeenCalled()
      await advance(200)
      expect(onDismiss).toHaveBeenCalledTimes(1)
    })
  })

  it('takes its dwell from the design tokens', () => {
    expect(DURATION.toastDwell).toBe(5000)
    expect(DURATION.toastDwellAction).toBe(10000)
  })
})

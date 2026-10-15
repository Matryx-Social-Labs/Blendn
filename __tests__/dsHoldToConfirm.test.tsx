/*
 * <HoldToConfirm> (guidelines/components/HoldToConfirm.html; ROUND3 B10): the
 * one hold in the product. 900 ms; the gradient fill translates in over the
 * surfaceSunken track with the label drawn twice; H.tick at 25 / 50 / 75%,
 * H.commit at 100% (the outcome's H.success / H.error is the caller's, on the
 * server's answer); a release rewinds silently on M.settle (Reduce Motion cuts
 * it; the fill itself keeps its speed). A refusal: the destructive ring, #20,
 * H.error. A screen reader gets one strong button: a double-tap confirms.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet } from 'react-native'
import { getByGestureTestId } from 'react-native-gesture-handler/jest-utils'
import * as Reanimated from 'react-native-reanimated'

import { HoldToConfirm } from '../components/ds/HoldToConfirm'
import { COLOR, DURATION, FONT_FAMILY, MATERIAL, RADIUS, SIZE, SPRING } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { OPACITY } from '../lib/theme'

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
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} testID="gradient" /> }
})

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const animated = (id: string) => Reanimated.getAnimatedStyle(screen.getByTestId(id, { includeHiddenElements: true }))

let haptics: Record<'tick' | 'commit' | 'error' | 'success', jest.SpyInstance>
beforeEach(() => {
  reduceMotion.mockReturnValue(false)
  haptics = {
    tick: jest.spyOn(H, 'tick').mockImplementation(() => {}),
    commit: jest.spyOn(H, 'commit').mockImplementation(() => {}),
    error: jest.spyOn(H, 'error').mockImplementation(() => {}),
    success: jest.spyOn(H, 'success').mockImplementation(() => {}),
  }
})
afterEach(() => jest.useRealTimers())

const draw = (props: Partial<React.ComponentProps<typeof HoldToConfirm>> = {}) =>
  render(<HoldToConfirm label="Hold to blend in" onConfirm={jest.fn()} consequence="Checks you in. Other people at this event will see you." testID="h" {...props} />)

const layout = () => fireEvent(screen.getByTestId('h'), 'layout', { nativeEvent: { layout: { width: 300, height: 56 } } })
/*
 * The gesture's own callbacks, driven one at a time: RNGH's `fireGestureHandler`
 * always completes BEGAN → ACTIVE → END, so it cannot let go early.
 */
type Phase = 'begin' | 'start' | 'release' | 'lift'
const hold = (phase: Phase) =>
  act(async () => {
    const h = getByGestureTestId('h-hold').handlers as unknown as Record<string, (e: object, ok?: boolean) => void>
    if (phase === 'begin') h.onBegin({})
    if (phase === 'start') h.onStart({})
    if (phase === 'release') h.onFinalize({}, false)
    if (phase === 'lift') h.onFinalize({}, true)
  })

describe('the pill', () => {
  it('is a 56 pt surfaceSunken track at radius 28; the label sits twice, textSecondary under, white on the fill', async () => {
    await draw({ previewProgress: 0.4 })
    expect(flat('h')).toMatchObject({ height: SIZE.primary, borderRadius: RADIUS.button, backgroundColor: COLOR.surfaceSunken })
    const labels = screen.getAllByText('Hold to blend in', { includeHiddenElements: true })
    expect(labels).toHaveLength(2)
    expect(StyleSheet.flatten(labels[0].props.style)).toMatchObject({ fontFamily: FONT_FAMILY.brand[700], color: COLOR.textSecondary })
    expect(StyleSheet.flatten(labels[1].props.style).color).toBe(COLOR.textOnGradient)
    for (const l of labels) expect(l.props.maxFontSizeMultiplier).toBe(1.3)
    expect(screen.getByTestId('gradient', { includeHiddenElements: true })).toBeTruthy()
  })

  it('the fill sits where the progress is: 40% in is 60% of the width still to go', async () => {
    jest.useFakeTimers()
    await draw({ previewProgress: 0.4 })
    await layout()
    await act(async () => jest.advanceTimersByTime(16))
    expect(animated('h-fill').transform).toEqual([{ translateX: -180 }])
    expect(animated('h-fill-label').transform).toEqual([{ translateX: 180 }])
  })

  it('a long label shrinks to fit the pill rather than losing its tail', async () => {
    await draw({ disabled: true, label: 'Go live when you’re here · 350 m' })
    for (const l of screen.getAllByText('Go live when you’re here · 350 m', { includeHiddenElements: true })) {
      expect(l.props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true })
      expect(StyleSheet.flatten(l.props.style).flexShrink).toBe(1)
    }
  })

  it('is a button that states its consequence', async () => {
    await draw()
    const pill = screen.getByRole('button', { name: 'Hold to blend in' })
    expect(pill.props.accessibilityHint).toBe('Checks you in. Other people at this event will see you.')
  })
})

describe('the hold', () => {
  it('fills over 900 ms, linear: the hold keeps its speed under Reduce Motion', async () => {
    reduceMotion.mockReturnValue(true)
    await draw()
    await hold('begin')
    expect(Reanimated.withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: DURATION.hold }))
  })

  it('H.tick at each quarter, in order, then H.commit and the confirm at the edge', async () => {
    jest.useFakeTimers()
    const onConfirm = jest.fn()
    await draw({ onConfirm })
    await layout()
    await hold('begin')
    await act(async () => jest.advanceTimersByTime(DURATION.hold - 50))
    expect(haptics.tick.mock.calls).toEqual([[1], [2], [3]])
    expect(haptics.commit).not.toHaveBeenCalled()
    await hold('start')
    await hold('lift')
    await act(async () => jest.advanceTimersByTime(0))
    expect(haptics.commit).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    // The outcome is the caller's: nothing here claims success.
    expect(haptics.success).not.toHaveBeenCalled()
  })

  it('let go early: it rewinds on M.settle, silently, and confirms nothing', async () => {
    const onConfirm = jest.fn()
    await draw({ onConfirm })
    await hold('begin')
    jest.mocked(Reanimated.withSpring).mockClear()
    await hold('release')
    expect(Reanimated.withSpring).toHaveBeenCalledWith(0, expect.objectContaining({ stiffness: SPRING.settle.stiffness }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(haptics.commit).not.toHaveBeenCalled()
  })

  it('a hold already committed is never rewound: a cancel after the edge (busy disables it, Android drift) keeps it full', async () => {
    await draw()
    await hold('begin')
    await hold('start')
    jest.mocked(Reanimated.withSpring).mockClear()
    await hold('release')
    expect(Reanimated.withSpring).not.toHaveBeenCalled()
  })

  it('Reduce Motion: the rewind cuts', async () => {
    reduceMotion.mockReturnValue(true)
    await draw()
    await hold('begin')
    jest.mocked(Reanimated.withSpring).mockClear()
    await hold('release')
    expect(Reanimated.withSpring).not.toHaveBeenCalled()
  })
})

describe('states', () => {
  it('disabled: 45%, no hold, read as disabled', async () => {
    const onConfirm = jest.fn()
    await draw({ disabled: true, onConfirm, label: 'Go live when you’re here · 350 m' })
    expect(flat('h-wrap').opacity).toBe(OPACITY.disabled)
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({ disabled: true })
    await act(async () => {
      screen.getByRole('button').props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } })
    })
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('busy: the fill stays full under its own label; read as busy; it drains when busy drops', async () => {
    jest.useFakeTimers()
    await draw({ busy: true, busyLabel: 'Checking you in…' })
    await layout()
    await act(async () => jest.advanceTimersByTime(16))
    expect(animated('h-fill').transform).toEqual([{ translateX: 0 }])
    await screen.rerender(<HoldToConfirm label="Hold to blend in" onConfirm={jest.fn()} testID="h" />)
    await act(async () => jest.advanceTimersByTime(1000))
    expect(animated('h-fill').transform).toEqual([{ translateX: -300 }])
    await screen.rerender(<HoldToConfirm label="Hold to blend in" busy busyLabel="Checking you in…" onConfirm={jest.fn()} testID="h" />)
    expect(screen.getAllByText('Checking you in…', { includeHiddenElements: true })).toHaveLength(2)
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({ busy: true })
  })

  it('refused (#10, R3-D4 4.7): H.error at t0 and the pass drains on M.settle, not a bounce; no ring, no shake', async () => {
    await draw({ busy: true, busyLabel: 'Checking you in…' })
    jest.mocked(Reanimated.withSpring).mockClear()
    jest.mocked(Reanimated.withTiming).mockClear()
    await screen.rerender(<HoldToConfirm label="Hold to blend in" onConfirm={jest.fn()} refused testID="h" />)
    expect(haptics.error).toHaveBeenCalledTimes(1)
    expect(Reanimated.withSpring).toHaveBeenCalledWith(0, expect.objectContaining({ stiffness: SPRING.settle.stiffness }))
    expect(screen.queryByTestId('h-refused', { includeHiddenElements: true })).toBeNull()
    expect(Reanimated.withTiming).not.toHaveBeenCalled()
  })

  it('refused under Reduce Motion: the drain cuts; H.error still plays', async () => {
    reduceMotion.mockReturnValue(true)
    await draw({ busy: true })
    jest.mocked(Reanimated.withSpring).mockClear()
    await screen.rerender(<HoldToConfirm label="Hold to blend in" onConfirm={jest.fn()} refused testID="h" />)
    expect(haptics.error).toHaveBeenCalledTimes(1)
    expect(Reanimated.withSpring).not.toHaveBeenCalled()
  })

  it('confirmed (#9, the Flow 4 prototype): the fill stays full and the label reads “You’re in”; nothing to hold, no haptic', async () => {
    const onConfirm = jest.fn()
    await draw({ confirmedLabel: 'You’re in', onConfirm })
    expect(screen.getAllByText('You’re in', { includeHiddenElements: true })).toHaveLength(2)
    const pill = screen.getByRole('button')
    expect(pill.props.accessibilityState).toMatchObject({ disabled: true })
    await act(async () => pill.props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } }))
    expect(onConfirm).not.toHaveBeenCalled()
    for (const spy of Object.values(haptics)) expect(spy).not.toHaveBeenCalled()
  })

  it('Switch Control and Voice Control activate it directly, with H.commit', async () => {
    const onConfirm = jest.fn()
    await draw({ onConfirm })
    await act(async () => {
      screen.getByRole('button').props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } })
    })
    expect(haptics.commit).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})

describe('accessibility settings', () => {
  it('Increase Contrast: the 50% hairline on the track', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await draw()
    await act(async () => {})
    expect(flat('h-contrast')).toMatchObject({ borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast })
  })

  it('a screen reader gets one strong button: a double-tap confirms, no hold', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true)
    const onConfirm = jest.fn()
    await draw({ onConfirm, srLabel: 'Check in' })
    await act(async () => {})
    const button = screen.getByRole('button', { name: 'Check in' })
    expect(StyleSheet.flatten(button.props.style).backgroundColor).toBe(COLOR.textPrimary)
    await fireEvent.press(button)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(haptics.commit).toHaveBeenCalledTimes(1)
  })
})

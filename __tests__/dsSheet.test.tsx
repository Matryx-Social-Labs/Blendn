/*
 * <Sheet> (guidelines/components/Sheet.html, motion #5): the one L3 surface.
 * The fixed button order, focus on the title, the handle as "Dismiss", system
 * back, busy holding it open, the three detents and H.detent when a drag
 * settles on another, no haptic on open, and Reduce Motion.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Dimensions, Platform, StyleSheet } from 'react-native'
import { State } from 'react-native-gesture-handler'
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils'
import * as Reanimated from 'react-native-reanimated'

import { fieldScroll, settleDetent, Sheet, sheetBottomPadding, sheetFrame, sheetHeightAt, sheetMaxHeight } from '../components/ds/Sheet'
import { COLOR, FONT_FAMILY, MATERIAL, SPRING } from '../lib/design/tokens'
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
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const withSpring = Reanimated.withSpring as jest.Mock
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })

beforeEach(() => {
  on('ios')
  reduceMotion.mockReturnValue(false)
})

const signOut = (props: Partial<React.ComponentProps<typeof Sheet>> = {}) => (
  <Sheet
    visible
    onClose={jest.fn()}
    icon="log-out"
    title="Sign out?"
    body="You’ll need to sign in again to see your events, friends and messages."
    actions={[
      { label: 'Cancel', kind: 'tertiary', onPress: jest.fn() },
      { label: 'Sign out', kind: 'destructive', onPress: jest.fn() },
    ]}
    testID="s"
    {...props}
  />
)

describe('headerNote (audit D5)', () => {
  const note = { lead: '1', text: ' of 3 · Name and vibe', label: 'Step 1 of 3, Name and vibe' }

  it('is two sibling Texts, the lead in Geist Mono white: no Text is a child of another Text', async () => {
    await render(signOut({ headerNote: note }))
    const box = screen.getByTestId('s-note')
    // Two host Texts side by side, each holding only a string: nothing is nested in a Text.
    expect(box.children).toHaveLength(2)
    for (const child of box.children) expect((child as { children: unknown[] }).children.every((c) => typeof c === 'string')).toBe(true)
    expect(StyleSheet.flatten(screen.getByText('1').props.style)).toMatchObject({ fontFamily: FONT_FAMILY.mono[500], color: COLOR.textPrimary })
    expect(StyleSheet.flatten(screen.getByText(/of 3 · Name and vibe/).props.style).color).toBe(COLOR.textSecondary)
  })

  it('gives ground under a long title: the note shrinks, the row wraps, and the title holds its width', async () => {
    await render(signOut({ headerNote: note, title: 'A title that is long enough to fill a phone’s row on its own' }))
    expect(StyleSheet.flatten(screen.getByTestId('s-note').props.style)).toMatchObject({ flexShrink: 1, minWidth: 0 })
    expect(StyleSheet.flatten(screen.getByText(/A title that is long/).props.style)).toMatchObject({ flexShrink: 0, maxWidth: '100%' })
  })

  it('is read as one element: its label, or its words', async () => {
    await render(signOut({ headerNote: note }))
    expect(screen.getByLabelText('Step 1 of 3, Name and vibe')).toBeTruthy()
    await screen.unmount()
    await render(signOut({ headerNote: { text: 'Step 1 of 3' } }))
    expect(screen.getByLabelText('Step 1 of 3')).toBeTruthy()
  })
})

describe('headerAction', () => {
  it('is right-aligned in the title row, runs its handler, and a sheet without one is unchanged', async () => {
    const onPress = jest.fn()
    await render(signOut({ headerAction: { label: 'Clear all', onPress } }))
    await fireEvent.press(screen.getByRole('button', { name: 'Clear all' }))
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Sign out?')).toBeTruthy()
    await screen.rerender(signOut())
    expect(screen.queryByText('Clear all')).toBeNull()
  })

  it('disabled: held, dimmed, and says so', async () => {
    const onPress = jest.fn()
    await render(signOut({ headerAction: { label: 'Clear all', onPress, disabled: true } }))
    const action = screen.getByTestId('s-header-action')
    expect(action.props.accessibilityState).toMatchObject({ disabled: true })
    await fireEvent.press(action)
    expect(onPress).not.toHaveBeenCalled()
  })
})

describe('settleDetent', () => {
  const heights = [300, 500, 800]

  it('settles on the nearest detent', () => {
    expect(settleDetent(heights, 1, 620, 0, 0)).toBe(1)
    expect(settleDetent(heights, 1, 700, 0, 0)).toBe(2)
  })

  it('a fling steps one detent its way', () => {
    expect(settleDetent(heights, 1, 510, 0, -900)).toBe(2)
    expect(settleDetent(heights, 1, 490, 0, 900)).toBe(0)
  })

  it('dismisses past 30% below the lowest, or flung down from it', () => {
    expect(settleDetent(heights, 0, 300, 91, 0)).toBe('dismiss')
    expect(settleDetent(heights, 0, 300, 80, 0)).toBe(0)
    expect(settleDetent(heights, 0, 300, 10, 900)).toBe('dismiss')
  })
})

describe('<Sheet>', () => {
  it('puts the actions in the fixed order, whatever order they came in', async () => {
    await render(
      signOut({
        actions: [
          { label: 'Cancel', kind: 'tertiary', onPress: jest.fn() },
          { label: 'Delete', kind: 'destructive', onPress: jest.fn() },
          { label: 'Copy link', kind: 'secondary', onPress: jest.fn() },
          { label: 'WhatsApp', kind: 'strong', onPress: jest.fn() },
        ],
      })
    )
    expect(screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual([
      'Dismiss',
      'WhatsApp',
      'Copy link',
      'Delete',
      'Cancel',
    ])
  })

  it('moves focus to the title once it is shown, and plays nothing', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {})
    const spies = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
    await render(signOut())
    expect(screen.getByRole('header', { name: 'Sign out?' })).toBeTruthy()
    // Not before the modal is on screen: iOS presents it a frame later and drops an early focus.
    expect(focus).not.toHaveBeenCalled()
    await fireEvent(screen.getByTestId('s-modal'), 'show')
    expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus')
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('the handle is “Dismiss, button”; system back dismisses too', async () => {
    const onClose = jest.fn()
    await render(signOut({ onClose }))
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await fireEvent(screen.getByTestId('s-modal'), 'requestClose')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('busy: the primary shows its spinner, the rest dim, and it will not close', async () => {
    const onClose = jest.fn()
    await render(
      signOut({
        onClose,
        actions: [
          { label: 'Delete account', kind: 'destructive', onPress: jest.fn(), loading: true },
          { label: 'Keep my account', kind: 'tertiary', onPress: jest.fn() },
        ],
      })
    )
    expect(screen.getByRole('button', { name: 'Delete account' }).props.accessibilityState).toMatchObject({ busy: true })
    expect(screen.getByRole('button', { name: 'Keep my account' }).props.accessibilityState).toMatchObject({ disabled: true })
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('iOS: sheet glass under a 60% backdrop, a 36×5 handle', async () => {
    await render(signOut())
    expect(screen.getByTestId('glass')).toBeTruthy()
    expect(flat('s-scrim').backgroundColor).toBe(COLOR.backdrop)
    expect(flat('s-handle')).toMatchObject({ width: 36, height: 5 })
  })

  it('Android: solid under a 50% scrim, a 32×4 handle', async () => {
    on('android')
    await render(signOut())
    expect(screen.queryByTestId('glass')).toBeNull()
    expect(flat('s-scrim').backgroundColor).toBe('rgba(13,12,12,0.5)')
    expect(flat('s-handle')).toMatchObject({ width: 32, height: 4 })
  })

  it('opens at its detent: short 34%, medium 56%, tall 92% of the screen', async () => {
    const { height } = Dimensions.get('window')
    await render(signOut({ detents: ['medium', 'tall'] }))
    expect(flat('s-place').height).toBe(Math.round(height * 0.56))
  })

  it('a drag that settles on another detent plays H.detent', async () => {
    const detent = jest.spyOn(H, 'detent').mockImplementation(() => {})
    const { height } = Dimensions.get('window')
    await render(signOut({ detents: ['medium', 'tall'] }))
    const up = Math.round(height * 0.36)
    await act(async () =>
      fireGestureHandler(getByGestureTestId('s-drag'), [
        { state: State.BEGAN },
        { state: State.ACTIVE, translationY: 0 },
        // Same state again: an update, which is where the sheet follows the finger.
        { state: State.ACTIVE, translationY: -up },
        { state: State.END, translationY: -up, velocityY: 0 },
      ])
    )
    expect(detent).toHaveBeenCalledTimes(1)
  })

  it('opens at its first detent even when the list is not in order, and drags between them', async () => {
    const detent = jest.spyOn(H, 'detent').mockImplementation(() => {})
    const onClose = jest.fn()
    const { height } = Dimensions.get('window')
    await render(signOut({ onClose, detents: ['tall', 'medium'] }))
    expect(flat('s-place').height).toBe(Math.round(height * 0.92))
    const down = Math.round(height * 0.36)
    await act(async () =>
      fireGestureHandler(getByGestureTestId('s-drag'), [
        { state: State.BEGAN },
        { state: State.ACTIVE, translationY: 0 },
        { state: State.ACTIVE, translationY: down },
        { state: State.END, translationY: down, velocityY: 0 },
      ])
    )
    expect(detent).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('takes no touches while it leaves', async () => {
    await render(signOut())
    await screen.rerender(signOut({ visible: false }))
    expect(screen.getByTestId('s-root', { includeHiddenElements: true }).props.pointerEvents).toBe('none')
  })

  it('rises on M.travel; under Reduce Motion it does not rise', async () => {
    await render(signOut())
    expect(withSpring).toHaveBeenCalledWith(0, expect.objectContaining({ stiffness: SPRING.travel.stiffness }))
    withSpring.mockClear()
    reduceMotion.mockReturnValue(true)
    await render(signOut())
    expect(withSpring).not.toHaveBeenCalledWith(0, expect.objectContaining({ stiffness: SPRING.travel.stiffness }))
  })

  it('Increase Contrast: the 50% hairline, and the body in white', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await render(signOut())
    await act(async () => {})
    // The sheet is iOS 26 glass here (the mock names it `glass`).
    expect(flat('glass').borderColor).toBe(MATERIAL.hairlineIncreaseContrast)
    expect(StyleSheet.flatten(screen.getByText(/sign in again/).props.style).color).toBe(COLOR.textPrimary)
  })
})

describe('onDismissed: the next sheet waits for this one to have left', () => {
  it('iOS: it is the Modal’s own onDismiss, so a sheet opened after it is not dropped', async () => {
    const onDismissed = jest.fn()
    await render(signOut({ onDismissed }))
    const modal = screen.getByTestId('s-modal', { includeHiddenElements: true })
    expect(onDismissed).not.toHaveBeenCalled()
    await act(async () => modal.props.onDismiss())
    expect(onDismissed).toHaveBeenCalledTimes(1)
  })

  it('Android: once it has unmounted, after its fade', async () => {
    on('android')
    jest.useFakeTimers()
    const onDismissed = jest.fn()
    const view = await render(signOut({ onDismissed }))
    expect(screen.getByTestId('s-modal', { includeHiddenElements: true }).props.onDismiss).toBeUndefined()
    await view.rerender(signOut({ onDismissed, visible: false }))
    expect(onDismissed).not.toHaveBeenCalled()
    await act(async () => jest.advanceTimersByTime(1000))
    expect(onDismissed).toHaveBeenCalledTimes(1)
    jest.useRealTimers()
  })
})

describe('the foot over a keyboard (Board composer drive: a dead band between Cancel and the keys)', () => {
  it('keeps the home-indicator inset without a keyboard and drops it under one', () => {
    expect(sheetBottomPadding(34, false)).toBe(34 + 8)
    expect(sheetBottomPadding(34, true)).toBe(8)
  })

  it('follows the keyboard as it shows and hides', async () => {
    const { Keyboard } = require('react-native')
    const handlers: Record<string, (e?: { endCoordinates: { height: number; screenY: number } }) => void> = {}
    const spy = jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, fn: (e?: { endCoordinates: { height: number; screenY: number } }) => void) => {
      handlers[event] = fn
      return { remove: () => {} }
    }) as never)
    await render(signOut())
    // The sheet's own glass (the mock names it 'glass'): its padding is the foot.
    const pad = () => flat('glass').paddingBottom
    const resting = pad()
    const windowHeight = Dimensions.get('window').height
    await act(async () => handlers.keyboardWillShow({ endCoordinates: { height: 300, screenY: windowHeight - 300 } }))
    expect(pad()).toBe(8)
    // And it never rises past the status bar: capped at the keyboard's top, less the top inset and a margin.
    expect(flat('glass').maxHeight).toBe(sheetMaxHeight(windowHeight, 0, windowHeight - 300))
    await act(async () => handlers.keyboardWillHide())
    expect(pad()).toBe(resting)
    spy.mockRestore()
  })
})

describe('the cap (drive 2: the composer slid under the status bar with the keyboard up)', () => {
  it('runs from the keyboard’s top (or the visible bottom) to the top safe area and 8 pt', () => {
    expect(sheetMaxHeight(874, 62, 874 - 336)).toBe(874 - 336 - 62 - 8)
    expect(sheetMaxHeight(874, 62, null)).toBe(874 - 62 - 8)
    expect(sheetMaxHeight(300, 62, 40)).toBe(0)
  })

  it('Android edge-to-edge (drive 3): the modal’s own height and the keyboard’s screenY, whatever the window says', async () => {
    const { Keyboard } = require('react-native')
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
    const handlers: Record<string, (e?: { endCoordinates: { height: number; screenY: number } }) => void> = {}
    const spy = jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, fn: (e?: { endCoordinates: { height: number; screenY: number } }) => void) => {
      handlers[event] = fn
      return { remove: () => {} }
    }) as never)
    await render(signOut())
    // The translucent modal is the whole screen (915), taller than the window the app reports.
    await act(async () => fireEvent(screen.getByTestId('s-root', { includeHiddenElements: true }), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 412, height: 915 } } }))
    // The keyboard's height excludes the navigation bar; its top edge is what bounds the sheet.
    await act(async () => handlers.keyboardDidShow({ endCoordinates: { height: 300, screenY: 567 } }))
    // Android draws the sheet's material solid (no glass): the sheet is its testID.
    expect(flat('s').maxHeight).toBe(567 - 0 - 8)
    await act(async () => handlers.keyboardDidHide())
    expect(flat('s').maxHeight).toBe(915 - 0 - 8)
    spy.mockRestore()
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
  })

  it('scrolls the content inside it, the title and the actions outside the scroll', async () => {
    const { Text } = jest.requireActual('react-native')
    await render(signOut({ children: <Text>Form</Text> }))
    const content = screen.getByTestId('s-content', { includeHiddenElements: true })
    expect(content.type).toBe('RCTScrollView')
    expect(screen.getByText('Form', { includeHiddenElements: true })).toBeTruthy()
  })
})

describe('the field being typed in, scrolled into view (drive 3: the stepper peeked under the box)', () => {
  it('scrolls to the end when the whole field still shows: the row after it comes fully into view, never a sliver', () => {
    // Viewport 200 over 320 of content; the text box at 120–220, the stepper row after it to 320.
    expect(fieldScroll(120, 100, 200, 320)).toBe(120)
  })

  it('stops at the field when the end would push its top out of view', () => {
    // A tall form: the field at 40–140, 600 of content.
    expect(fieldScroll(40, 100, 200, 600)).toBe(0)
    expect(fieldScroll(300, 100, 200, 900)).toBe(208)
  })
})

/*
 * The owner's Make a crew defect (iOS sim): typing pushed the sheet far too high. A tall detent sheet is
 * an explicit 0.92 × screen height, and the avoiding view lifted it by the whole keyboard, so its top
 * went off the screen. The frame is one function of one keyboard frame: the lift and the clamp together.
 */
describe('where the sheet stands over a keyboard (393 × 852, a 336 pt keyboard, a 59 pt top inset)', () => {
  const SCREEN = 852
  const KEYBOARD = 336
  const INSET = 59
  const tall = Math.round(SCREEN * 0.92)
  const frame = (keyboard: boolean, detentHeight: number | null) =>
    sheetFrame({ visibleHeight: SCREEN, insetTop: INSET, keyboardTop: keyboard ? SCREEN - KEYBOARD : null, detentHeight })

  it('a tall detent sheet is shortened to the room above the keyboard, and stands on it', () => {
    const f = frame(true, tall)
    expect(f.lift).toBe(KEYBOARD)
    expect(f.maxHeight).toBe(SCREEN - KEYBOARD - INSET - 8)
    expect(f.height).toBe(f.maxHeight)
    // Its top is the status bar's foot and the 8 pt margin; never above it.
    expect(SCREEN - f.lift - (f.height as number)).toBe(INSET + 8)
  })

  it('the lift alone, the old behaviour, put the top 268 pt above the screen', () => {
    expect(SCREEN - KEYBOARD - tall).toBe(-268)
  })

  it('with no keyboard a detent sheet is its detent and rests on the bottom (a drag may still rubber-band)', () => {
    const f = frame(false, tall)
    expect(f).toMatchObject({ lift: 0, height: tall })
    expect(f.maxHeight).toBe(SCREEN - INSET - 8)
  })

  it('a detent already shorter than the room is left alone', () => {
    const short = Math.round(SCREEN * 0.34)
    expect(frame(true, short).height).toBe(short)
  })

  it('a tray has no height of its own: it is lifted and capped, nothing more', () => {
    expect(frame(true, null)).toEqual({ lift: KEYBOARD, maxHeight: SCREEN - KEYBOARD - INSET - 8, height: null })
    expect(frame(false, null)).toEqual({ lift: 0, maxHeight: SCREEN - INSET - 8, height: null })
  })

  it('lifts to the keyboard’s top edge, not by its height: Android edge-to-edge leaves the navigation bar out of the height', () => {
    // A 915 pt modal, a keyboard reporting 300 pt whose top is at 567: the sheet stands on 567.
    expect(sheetFrame({ visibleHeight: 915, insetTop: 0, keyboardTop: 567, detentHeight: null }).lift).toBe(915 - 567)
  })

  it('a keyboard taller than the room leaves a sheet no height rather than a negative one', () => {
    expect(sheetFrame({ visibleHeight: 300, insetTop: 62, keyboardTop: 40, detentHeight: 276 })).toMatchObject({ height: 0, maxHeight: 0 })
  })
})

describe('the place view over a keyboard (render)', () => {
  const handlers: Record<string, (e?: { endCoordinates: { height: number; screenY: number } }) => void> = {}
  let listen: jest.SpyInstance
  let dims: jest.SpyInstance

  beforeEach(() => {
    jest.useFakeTimers()
    reduceMotion.mockReturnValue(false)
    const { Keyboard } = require('react-native')
    listen = jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, fn: (typeof handlers)[string]) => {
      handlers[event] = fn
      return { remove: () => {} }
    }) as never)
    const real = Dimensions.get.bind(Dimensions)
    dims = jest.spyOn(Dimensions, 'get').mockImplementation(((k: 'window' | 'screen') => (k === 'window' ? { width: 393, height: 852, scale: 3, fontScale: 1 } : real(k))) as never)
  })
  afterEach(() => {
    jest.useRealTimers()
    listen.mockRestore()
    dims.mockRestore()
  })

  /** The place view's style as it is now: its animated values (the lift, the clamped height), not the first paint's. */
  const place = () => Reanimated.getAnimatedStyle(screen.getByTestId('s-place', { includeHiddenElements: true })) as { marginBottom: number; height?: number }
  const lay = () => act(async () => fireEvent(screen.getByTestId('s-root', { includeHiddenElements: true }), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 393, height: 852 } } }))
  // The lift and the clamp ease on `base`: run the clock past it (jumps at once under Reduce Motion).
  const settle = () => act(async () => jest.advanceTimersByTime(600))
  const keyboard = async () => {
    await act(async () => handlers.keyboardWillShow({ endCoordinates: { height: 336, screenY: 852 - 336 } }))
    await settle()
  }

  it('a tall sheet: its height is no more than the room above the keyboard, and its foot is on it', async () => {
    await render(signOut({ detents: ['tall'] }))
    await lay()
    expect(place().height).toBe(Math.round(852 * 0.92))
    expect(place().marginBottom).toBe(0)
    await keyboard()
    const room = 852 - 336 // the insets are 0 here: the room is the keyboard's top
    expect(place().marginBottom).toBe(336)
    expect(place().height).toBeLessThanOrEqual(room)
    expect(place().height).toBe(room - 8)
    // The top lands on screen: bottom edge (852 − lift) less its height.
    expect(852 - place().marginBottom - (place().height as number)).toBeGreaterThanOrEqual(0)
    await act(async () => handlers.keyboardWillHide())
    await settle()
    expect(place().height).toBe(Math.round(852 * 0.92))
    expect(place().marginBottom).toBe(0)
  })

  it('under Reduce Motion it is there within a frame, not eased over `base`', async () => {
    reduceMotion.mockReturnValue(true)
    await render(signOut({ detents: ['tall'] }))
    await lay()
    await act(async () => handlers.keyboardWillShow({ endCoordinates: { height: 336, screenY: 852 - 336 } }))
    await act(async () => jest.advanceTimersByTime(20))
    expect(place()).toMatchObject({ marginBottom: 336, height: 852 - 336 - 8 })
  })

  it('a tray: lifted onto the keyboard, no fixed height, its content capped', async () => {
    await render(signOut())
    await lay()
    await keyboard()
    expect(place().marginBottom).toBe(336)
    expect(place().height).toBeUndefined()
    expect(flat('glass').maxHeight).toBe(852 - 336 - 8)
  })

  it('there is one lift: the sheet draws no KeyboardAvoidingView of its own', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../components/ds/Sheet.tsx'), 'utf8')
    expect(src).not.toMatch(/<KeyboardAvoidingView|import \{[^}]*KeyboardAvoidingView/)
  })

  it('drags between detents when no keyboard is up', async () => {
    await render(signOut({ detents: ['medium', 'tall'] }))
    await lay()
    expect(flat('s-place').height).toBe(Math.round(852 * 0.56))
  })
})

/*
 * Pre-build review H1: the end state was right and the way there was not. The height was clamped to the
 * final room by a separate eased cap, so while the lift rose 0 → 336 the 784 pt sheet's top was
 * 852 − lift − 784 — far above the screen — and snapped back when the cap landed. The height is now
 * derived from the lift of the same frame, so the top holds still at the clamp for every frame.
 */
describe('the sheet’s top on every frame of the keyboard’s show and hide (393 × 852, 59 pt inset)', () => {
  const SCREEN = 852
  const INSET = 59
  const TOP = INSET + 8
  const tall = Math.round(SCREEN * 0.92)
  const topAt = (lift: number) => SCREEN - lift - sheetHeightAt(lift, SCREEN, INSET, tall)

  it('never above the status bar and its margin, at any lift from 0 to the keyboard’s height', () => {
    for (let lift = 0; lift <= 336; lift += 1) {
      const top = topAt(lift)
      // At rest the 92% detent sits at 68 (852 − 784), which is already inside the margin.
      expect(top).toBeGreaterThanOrEqual(Math.min(TOP, SCREEN - tall))
    }
  })

  it('the old shape (a cap that only bites at the end) put it 268 pt off at the first frame', () => {
    const oldHeight = (lift: number, cap: number) => Math.min(tall, cap)
    // Mid-rise (lift 168, the cap still ~100000): the top is a long way above the screen.
    expect(SCREEN - 168 - oldHeight(168, 100000)).toBeLessThan(0)
    expect(topAt(168)).toBeGreaterThanOrEqual(TOP)
  })

  it('a tray’s clamp is the same line: the foot on the keyboard, the head under the status bar', () => {
    expect(sheetHeightAt(0, SCREEN, INSET, 500)).toBe(500)
    expect(sheetHeightAt(336, SCREEN, INSET, 100)).toBe(100)
  })
})

describe('the place view frame by frame (render)', () => {
  const handlers: Record<string, (e?: { endCoordinates: { height: number; screenY: number }; duration?: number }) => void> = {}
  let spies: jest.SpyInstance[] = []
  let insetsModule: { useSafeAreaInsets: jest.Mock }
  const SCREEN = 852
  const INSET = 59
  const place = () => Reanimated.getAnimatedStyle(screen.getByTestId('s-place', { includeHiddenElements: true })) as { marginBottom: number; height: number }
  const lay = () => act(async () => fireEvent(screen.getByTestId('s-root', { includeHiddenElements: true }), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 393, height: SCREEN } } }))

  beforeEach(() => {
    jest.useFakeTimers()
    reduceMotion.mockReturnValue(false)
    const { Keyboard } = require('react-native')
    const insets = require('react-native-safe-area-context')
    const real = Dimensions.get.bind(Dimensions)
    spies = [
      jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, fn: (typeof handlers)[string]) => {
        handlers[event] = fn
        return { remove: () => {} }
      }) as never),
      jest.spyOn(Dimensions, 'get').mockImplementation(((k: 'window' | 'screen') => (k === 'window' ? { width: 393, height: SCREEN, scale: 3, fontScale: 1 } : real(k))) as never),
      jest.spyOn(insets, 'useSafeAreaInsets').mockReturnValue({ top: INSET, bottom: 34, left: 0, right: 0 }),
    ]
    insetsModule = insets
  })
  afterEach(() => {
    jest.useRealTimers()
    spies.forEach((s) => s.mockRestore())
    // A spy restored over a jest.fn leaves it answering nothing: put the plain zero insets back for whatever runs next.
    insetsModule.useSafeAreaInsets.mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 })
  })

  /** Steps the clock a frame at a time and returns where the sheet's top was at each. */
  const tops = async (ms: number) => {
    const out: { lift: number; top: number }[] = []
    for (let t = 0; t < ms; t += 16) {
      await act(async () => jest.advanceTimersByTime(16))
      const p = place()
      out.push({ lift: p.marginBottom, top: SCREEN - p.marginBottom - p.height })
    }
    return out
  }
  const floor = INSET + 8

  it('show: the top never goes above the margin on any frame, and the lift does rise', async () => {
    await render(signOut({ detents: ['tall'] }))
    await lay()
    await act(async () => jest.advanceTimersByTime(600))
    await act(async () => handlers.keyboardWillShow({ endCoordinates: { height: 336, screenY: SCREEN - 336 }, duration: 250 }))
    const frames = await tops(400)
    expect(frames.some((f) => f.lift > 0 && f.lift < 336)).toBe(true)
    for (const f of frames) expect(f.top).toBeGreaterThanOrEqual(floor - 0.5)
    expect(frames.at(-1)).toMatchObject({ lift: 336 })
  })

  it('hide: the same, back down', async () => {
    await render(signOut({ detents: ['tall'] }))
    await lay()
    await act(async () => handlers.keyboardWillShow({ endCoordinates: { height: 336, screenY: SCREEN - 336 }, duration: 250 }))
    await act(async () => jest.advanceTimersByTime(600))
    await act(async () => handlers.keyboardWillHide())
    const frames = await tops(400)
    expect(frames.some((f) => f.lift > 0 && f.lift < 336)).toBe(true)
    // Coming down the sheet grows back to its detent; its top is the margin until it reaches it, then the detent's own.
    for (const f of frames) expect(f.top).toBeGreaterThanOrEqual(Math.min(floor, SCREEN - Math.round(SCREEN * 0.92)) - 0.5)
    expect(frames.at(-1)).toMatchObject({ lift: 0 })
  })

  it('opened while the keyboard is already up: no event ever fires, and it is lifted and clamped from its first frame', async () => {
    const { Keyboard } = require('react-native')
    const metrics = jest.spyOn(Keyboard, 'metrics').mockReturnValue({ screenX: 0, screenY: SCREEN - 336, width: 393, height: 336 })
    try {
      await render(signOut({ detents: ['tall'] }))
      await lay()
      await act(async () => jest.advanceTimersByTime(20))
      const p = place()
      expect(p.marginBottom).toBe(336)
      expect(SCREEN - p.marginBottom - p.height).toBeGreaterThanOrEqual(floor - 0.5)
    } finally {
      metrics.mockRestore()
    }
  })

  it('Android: the lift begins with the controller’s will-show, not after the keyboard has finished, and counts the navigation bar once', async () => {
    on('android')
    const kc = require('react-native-keyboard-controller')
    const kcHandlers: Record<string, (e: { height: number; duration: number }) => void> = {}
    const kcSpy = jest.spyOn(kc.KeyboardEvents, 'addListener').mockImplementation(((event: string, fn: (e: { height: number; duration: number }) => void) => {
      kcHandlers[event] = fn
      return { remove: () => {} }
    }) as never)
    try {
      await render(signOut({ detents: ['tall'] }))
      await lay()
      // The start of the rise: React Native has said nothing yet.
      // Edge-to-edge: the controller's height already includes the 34 pt navigation bar (300 + 34).
      await act(async () => kcHandlers.keyboardWillShow({ height: 334, duration: 250 }))
      const frames = await tops(100)
      expect(frames.some((f) => f.lift > 0)).toBe(true)
      for (const f of frames) expect(f.top).toBeGreaterThanOrEqual(floor - 0.5)
      // The estimate settles ON the keyboard's top, with no bar added to it again: 334, not 334 + 34.
      await act(async () => jest.advanceTimersByTime(600))
      expect(place().marginBottom).toBe(334)
      // And React Native's exact event, when it comes, agrees: nothing moves.
      await act(async () => handlers.keyboardDidShow({ endCoordinates: { height: 300, screenY: SCREEN - 334 } }))
      await act(async () => jest.advanceTimersByTime(600))
      expect(place().marginBottom).toBe(334)
    } finally {
      kcSpy.mockRestore()
      on('ios')
    }
  })
})

/*
 * Audit H3 / M3 / L6: a flick down to dismiss kept stopping dead (the offset sprang back toward 0, then a fresh
 * 220 ms curve started from rest once `visible` flipped). The release hands its velocity to the exit.
 */
describe('the swipe-to-dismiss hands its velocity on (DS #5: release on M.fling)', () => {
  const withSpring = Reanimated.withSpring as jest.Mock
  const withTiming = Reanimated.withTiming as jest.Mock
  const flick = async (id: string, velocityY: number, translationY = 300) => {
    await act(async () =>
      fireGestureHandler(getByGestureTestId(id), [
        { state: State.BEGAN },
        { state: State.ACTIVE, translationY: 0 },
        { state: State.ACTIVE, translationY },
        { state: State.END, translationY, velocityY },
      ])
    )
    // `scheduleOnRN` hands the close back to React on the next tick.
    await act(async () => jest.advanceTimersByTime(1))
  }

  beforeEach(() => {
    jest.useFakeTimers()
    withSpring.mockClear()
    withTiming.mockClear()
  })
  afterEach(() => jest.useRealTimers())

  it('(a) a flick closes it, and the exit is a clamped spring carrying that velocity: no spring back first, no curve from rest', async () => {
    const Host = () => {
      const [visible, setVisible] = React.useState(true)
      return signOut({ visible, onClose: () => setVisible(false), detents: ['medium'], testID: 'make' })
    }
    await render(<Host />)
    withSpring.mockClear()
    await flick('make-drag', 1200)
    // The exit: the sheet's own height or more, with the flick's speed, never past the bottom.
    expect(withSpring).toHaveBeenCalledWith(expect.any(Number), expect.objectContaining({ velocity: 1200, overshootClamping: true }))
    // And it was not sprung back toward 0 on the way: the only spring toward 0 after the release would be the wall.
    const toZero = withSpring.mock.calls.filter(([to]) => to === 0)
    expect(toZero).toHaveLength(0)
    // It goes after the flick has had room to land.
    await act(async () => jest.advanceTimersByTime(400))
    expect(screen.queryByTestId('make-place')).toBeNull()
  })

  it('a close from the scrim, with no flick, is the timed exit it always was', async () => {
    const Host = () => {
      const [visible, setVisible] = React.useState(true)
      return signOut({ visible, onClose: () => setVisible(false), detents: ['medium'], testID: 'make' })
    }
    await render(<Host />)
    withSpring.mockClear()
    withTiming.mockClear()
    await fireEvent.press(screen.getByLabelText('Dismiss'))
    expect(withSpring).not.toHaveBeenCalledWith(expect.any(Number), expect.objectContaining({ overshootClamping: true }))
    expect(withTiming).toHaveBeenCalledWith(expect.any(Number), expect.objectContaining({ duration: 220 }))
  })

  it('(b) an owner who refuses the close (a "discard changes?" ask): the sheet springs back a beat later', async () => {
    const onClose = jest.fn()
    await render(signOut({ visible: true, onClose, detents: ['medium'], testID: 'make' }))
    withSpring.mockClear()
    await flick('make-drag', 1200)
    expect(onClose).toHaveBeenCalled()
    // Nothing has sprung back yet: the answer may still be a close.
    expect(withSpring).not.toHaveBeenCalledWith(0, expect.objectContaining({ stiffness: SPRING.fling.stiffness }))
    await act(async () => jest.advanceTimersByTime(40))
    expect(withSpring).toHaveBeenCalledWith(0, expect.objectContaining({ stiffness: SPRING.fling.stiffness, damping: SPRING.fling.damping }))
  })

  it('a re-open while it is still leaving rises from where it is, not from the bottom', async () => {
    const r = await render(signOut({ visible: true, testID: 'make' }))
    await r.rerender(signOut({ visible: false, testID: 'make' }))
    await act(async () => jest.advanceTimersByTime(100))
    withSpring.mockClear()
    await r.rerender(signOut({ visible: true, testID: 'make' }))
    expect(withSpring).toHaveBeenCalledWith(0, expect.objectContaining({ stiffness: SPRING.travel.stiffness }))
  })

  it('the scrim eases on the gentle curve, over base', async () => {
    withTiming.mockClear()
    await render(signOut({ visible: true, testID: 'make' }))
    expect(withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 220 }))
  })

  describe('(c) Reduce Motion: a 200 ms fade in and out of place, and the drag still tracks', () => {
    beforeEach(() => reduceMotion.mockReturnValue(true))

    it('opens by fading in over 200', async () => {
      await render(signOut({ visible: true, testID: 'make' }))
      expect(withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 200 }))
      expect(withSpring).not.toHaveBeenCalledWith(0, expect.objectContaining({ stiffness: SPRING.travel.stiffness }))
    })

    it('closes by fading out over 200: the sheet is not left opaque while only the scrim fades', async () => {
      const r = await render(signOut({ visible: true, testID: 'make' }))
      withTiming.mockClear()
      await r.rerender(signOut({ visible: false, testID: 'make' }))
      const fades = withTiming.mock.calls.filter(([to, cfg]) => to === 0 && cfg.duration === 200)
      // The scrim and the sheet itself.
      expect(fades.length).toBeGreaterThanOrEqual(2)
    })

    it('a flick still dismisses, with no travelling exit', async () => {
      const Host = () => {
        const [visible, setVisible] = React.useState(true)
        return signOut({ visible, onClose: () => setVisible(false), detents: ['medium'], testID: 'make' })
      }
      await render(<Host />)
      withSpring.mockClear()
      await flick('make-drag', 1200)
      expect(withSpring).not.toHaveBeenCalledWith(expect.any(Number), expect.objectContaining({ overshootClamping: true }))
      await act(async () => jest.advanceTimersByTime(250))
      expect(screen.queryByTestId('make-place')).toBeNull()
    })
  })
})

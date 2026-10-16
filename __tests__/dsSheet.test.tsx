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

import { settleDetent, Sheet, sheetBottomPadding } from '../components/ds/Sheet'
import { COLOR, MATERIAL, SPRING } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false), withSpring: jest.fn(actual.withSpring) }
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
    const handlers: Record<string, () => void> = {}
    const spy = jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, fn: () => void) => {
      handlers[event] = fn
      return { remove: () => {} }
    }) as never)
    await render(signOut())
    // The sheet's own glass (the mock names it 'glass'): its padding is the foot.
    const pad = () => flat('glass').paddingBottom
    const resting = pad()
    await act(async () => handlers.keyboardWillShow())
    expect(pad()).toBe(8)
    await act(async () => handlers.keyboardWillHide())
    expect(pad()).toBe(resting)
    spy.mockRestore()
  })
})

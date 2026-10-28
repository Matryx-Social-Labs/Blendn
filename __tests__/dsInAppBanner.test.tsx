/*
 * <InAppBanner> (guidelines/components/InAppBanner.html, Flow 9 · 9.4, R3 D ·
 * 9.1): a notification that lands while you're in the app. The toast tier at
 * 56 pt, a 32 pt visual, two single lines, no buttons; leaves after 4 s or a
 * swipe up; never auto-dismisses for a screen reader, which gets Dismiss.
 * Silent, except the wave: H.arrive as it lands.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'
import { State } from 'react-native-gesture-handler'
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils'
import * as Reanimated from 'react-native-reanimated'

import { InAppBanner } from '../components/ds/InAppBanner'
import { RADIUS, SIZE, SPACE } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false) }
})
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return {
    GlassView: (props: object) => <View {...props} testID="glass" />,
    isGlassEffectAPIAvailable: jest.fn(() => true),
    isLiquidGlassAvailable: jest.fn(() => true),
  }
})

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
const advance = (ms: number) => act(async () => jest.advanceTimersByTime(ms))

const wave = (props: Partial<React.ComponentProps<typeof InAppBanner>> = {}) => (
  <InAppBanner
    kind="wave"
    visual={{ type: 'creature', pseudonym: 'Cosmic Panda' }}
    title="Cosmic Panda waved at you"
    context="Vinyl Night · now"
    onPress={jest.fn()}
    onDismiss={jest.fn()}
    testID="b"
    {...props}
  />
)

let arrive: jest.SpyInstance
let announce: jest.SpyInstance
beforeEach(() => {
  jest.useFakeTimers()
  on('ios')
  reduceMotion.mockReturnValue(false)
  arrive = jest.spyOn(H, 'arrive').mockImplementation(() => {})
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false)
})
afterEach(() => jest.useRealTimers())

describe('<InAppBanner>', () => {
  it('a 56 pt capsule on the toast glass at the top, the title and context on one line each', async () => {
    await render(wave())
    expect(screen.getByTestId('glass')).toBeTruthy()
    expect(flat('b')).toMatchObject({ top: SPACE.sm, left: SPACE.sm, right: SPACE.sm })
    expect(flat('glass')).toMatchObject({ minHeight: SIZE.primary, borderRadius: RADIUS.capsule })
    expect(screen.getByText('Cosmic Panda waved at you').props.numberOfLines).toBe(1)
    expect(screen.getByText('Vinyl Night · now').props.numberOfLines).toBe(1)
  })

  it('Android: the solid tier', async () => {
    on('android')
    await render(wave())
    expect(screen.queryByTestId('glass')).toBeNull()
  })

  it('the wave plays H.arrive as it lands, once; every other kind is silent', async () => {
    await render(wave())
    expect(arrive).toHaveBeenCalledTimes(1)
    await render(wave({ kind: 'default', title: 'Priya wants to be friends' }))
    expect(arrive).toHaveBeenCalledTimes(1)
  })

  it('is one button, “{title}, {context}”, announced once', async () => {
    const onPress = jest.fn()
    await render(wave({ onPress }))
    expect(announce).toHaveBeenCalledWith('Cosmic Panda waved at you, Vinyl Night · now')
    await fireEvent.press(screen.getByRole('button', { name: 'Cosmic Panda waved at you, Vinyl Night · now' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('announces once: a re-render with the same notification says nothing again', async () => {
    const { rerender } = await render(wave())
    await rerender(wave())
    expect(announce).toHaveBeenCalledTimes(1)
    expect(arrive).toHaveBeenCalledTimes(1)
  })

  it('Reduce Motion: it appears in place, no drop', async () => {
    reduceMotion.mockReturnValue(true)
    await render(wave())
    const style = Reanimated.getAnimatedStyle(screen.getByTestId('b')) as { transform: { translateY: number }[] }
    expect(style.transform[0].translateY).toBe(0)
  })

  it('leaves after 4 s', async () => {
    const onDismiss = jest.fn()
    await render(wave({ onDismiss }))
    await advance(3900)
    expect(onDismiss).not.toHaveBeenCalled()
    await advance(1000)
    await advance(500)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('holds while touched', async () => {
    const onDismiss = jest.fn()
    await render(wave({ onDismiss }))
    await fireEvent(screen.getByTestId('b'), 'touchStart')
    await advance(10000)
    expect(onDismiss).not.toHaveBeenCalled()
    await fireEvent(screen.getByTestId('b'), 'touchEnd')
    await advance(5000)
    await advance(500)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('a swipe up dismisses it', async () => {
    const onDismiss = jest.fn()
    await render(wave({ onDismiss }))
    await act(async () =>
      fireGestureHandler(getByGestureTestId('b-swipe'), [
        { state: State.BEGAN, translationY: 0 },
        { state: State.ACTIVE, translationY: 0 },
        { state: State.ACTIVE, translationY: -40 },
        { state: State.END, translationY: -40, velocityY: -900 },
      ])
    )
    await advance(500)
    await advance(500)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('with a screen reader: a × labelled Close (not a Dismiss pill), and it never leaves on its own', async () => {
    ;(AccessibilityInfo.isScreenReaderEnabled as jest.Mock).mockResolvedValue(true)
    const onDismiss = jest.fn()
    await render(wave({ onDismiss }))
    await act(async () => {})
    await advance(60000)
    expect(onDismiss).not.toHaveBeenCalled()
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }))
    await advance(500)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})

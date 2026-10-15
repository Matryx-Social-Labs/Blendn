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
import { COLOR, RADIUS, SIZE, SPACE } from '../lib/design/tokens'
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
    expect(flat('t').bottom).toBe(SPACE.tabBarBottomGapAndroid + SIZE.tabBar + SPACE.md)
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
    await advance(2000 + 1000)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('enters on M.snap; under Reduce Motion it does not move', async () => {
    await render(<Toast kind="info" text="Hi" onDismiss={jest.fn()} />)
    expect(Reanimated.withSpring).toHaveBeenCalledWith(0, expect.objectContaining({ stiffness: 439 }))
    ;(Reanimated.withSpring as jest.Mock).mockClear()
    reduceMotion.mockReturnValue(true)
    await render(<Toast kind="info" text="Hi" onDismiss={jest.fn()} />)
    expect(Reanimated.withSpring).not.toHaveBeenCalled()
  })
})

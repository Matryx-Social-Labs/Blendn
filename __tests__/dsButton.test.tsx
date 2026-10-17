/*
 * <Button> (guidelines/components/Button.html): five kinds at 56 / 48 / 36,
 * pressed per platform, focused, disabled, loading after a 300 ms grace,
 * refused (#20), the haptic only where the page puts one, and the
 * accessibility matrix.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { Button } from '../components/ds/Button'
import { COLOR, FONT_FAMILY, MATERIAL, RADIUS, SIZE } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { OPACITY } from '../lib/theme'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return {
    ...actual,
    __esModule: true,
    useReducedMotion: jest.fn(() => false),
    withSequence: jest.fn(actual.withSequence),
    withSpring: jest.fn(actual.withSpring),
  }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} testID="gradient" /> }
})

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style)

function on(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
}

let haptics: Record<'primary' | 'destructive' | 'error' | 'select', jest.SpyInstance>
beforeEach(() => {
  on('ios')
  reduceMotion.mockReturnValue(false)
  haptics = {
    primary: jest.spyOn(H, 'primary').mockImplementation(() => {}),
    destructive: jest.spyOn(H, 'destructive').mockImplementation(() => {}),
    error: jest.spyOn(H, 'error').mockImplementation(() => {}),
    select: jest.spyOn(H, 'select').mockImplementation(() => {}),
  }
})
afterEach(() => jest.useRealTimers())

const draw = (props: Partial<React.ComponentProps<typeof Button>> = {}) =>
  render(<Button label="I’m going" onPress={jest.fn()} testID="b" {...props} />)

describe('kinds and sizes', () => {
  it.each([
    ['lg', SIZE.primary],
    ['md', SIZE.control],
    ['sm', 36],
  ] as const)('%s is %i pt tall', async (size, height) => {
    await draw({ size })
    expect(flat('b').height).toBe(height)
  })

  it('primary is the fill gradient with a white label', async () => {
    await draw({ kind: 'primary' })
    expect(screen.getByTestId('gradient')).toBeTruthy()
    expect(StyleSheet.flatten(screen.getByText('I’m going').props.style).color).toBe(COLOR.textOnGradient)
  })

  it('strong is white with an ink label; destructive is destructiveFill, never the text red', async () => {
    await draw({ kind: 'strong' })
    expect(flat('b').backgroundColor).toBe(COLOR.textPrimary)
    expect(StyleSheet.flatten(screen.getByText('I’m going').props.style).color).toBe(COLOR.ink)
    await draw({ kind: 'destructive' })
    expect(flat('b').backgroundColor).toBe(COLOR.destructiveFill)
  })

  it('a 36 pt row action reaches the target through slop above and below', async () => {
    await draw({ size: 'sm' })
    expect(screen.getByTestId('b').props.hitSlop).toEqual({ top: 4, bottom: 4 })
  })

  it('secondary is surface, 8% white on glass, raised at 36', async () => {
    await draw({ kind: 'secondary' })
    expect(flat('b').backgroundColor).toBe(COLOR.surface)
    await draw({ kind: 'secondary', onGlass: true })
    expect(flat('b').backgroundColor).toBe(MATERIAL.fillOnGlass)
    await draw({ kind: 'secondary', size: 'sm' })
    expect(flat('b').backgroundColor).toBe(COLOR.surfaceRaised)
  })
})

describe('haptics: only where the page puts one', () => {
  const pressIn = () => fireEvent(screen.getByTestId('b'), 'pressIn')

  it('the primary plays H.primary on press-in', async () => {
    await draw({ kind: 'primary' })
    await pressIn()
    expect(haptics.primary).toHaveBeenCalledTimes(1)
  })

  it('a primary whose outcome haptic follows plays nothing (I’m going, §10.2)', async () => {
    await draw({ kind: 'primary', pressHaptic: false })
    await pressIn()
    expect(haptics.primary).not.toHaveBeenCalled()
  })

  it('the destructive button in a confirm plays H.destructive', async () => {
    await draw({ kind: 'destructive' })
    await pressIn()
    expect(haptics.destructive).toHaveBeenCalledTimes(1)
  })

  it('plays the cue a page names instead of its kind’s own (H.primary on a strong “Use at the door”)', async () => {
    await draw({ kind: 'strong', pressHaptic: H.primary })
    await pressIn()
    expect(haptics.primary).toHaveBeenCalledTimes(1)
    await draw({ kind: 'primary', pressHaptic: H.select })
    await pressIn()
    expect(haptics.select).toHaveBeenCalledTimes(1)
    expect(haptics.primary).toHaveBeenCalledTimes(1)
  })

  it.each(['strong', 'secondary', 'tertiary'] as const)('%s is silent', async (kind) => {
    await draw({ kind })
    await pressIn()
    for (const spy of Object.values(haptics)) expect(spy).not.toHaveBeenCalled()
  })
})

describe('states', () => {
  it('is a button named by its label', async () => {
    const onPress = jest.fn()
    await draw({ onPress })
    const b = screen.getByRole('button', { name: 'I’m going' })
    await fireEvent.press(b)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('disabled: dimmed to 45%, announced, not pressable', async () => {
    const onPress = jest.fn()
    await draw({ disabled: true, onPress })
    expect(screen.getByTestId('b').props.accessibilityState).toMatchObject({ disabled: true })
    expect(flat('b').opacity).toBe(OPACITY.disabled)
    await fireEvent.press(screen.getByTestId('b'))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('loading: busy at once, the spinner only after 300 ms, the label kept for width and name', async () => {
    jest.useFakeTimers()
    const onPress = jest.fn()
    await draw({ loading: true, onPress })
    const b = screen.getByTestId('b')
    expect(b.props.accessibilityState).toMatchObject({ busy: true })
    expect(b.props.accessibilityLabel).toBe('I’m going')
    const spinner = () => screen.queryByTestId('b-spinner', { includeHiddenElements: true })
    expect(spinner()).toBeNull()
    await act(async () => jest.advanceTimersByTime(300))
    // Drawn, and hidden from screen readers: the busy state is what they hear.
    expect(spinner()).toBeTruthy()
    expect(screen.queryByTestId('b-spinner')).toBeNull()
    expect(screen.getByText('I’m going')).toBeTruthy()
    await fireEvent.press(b)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('refused: the destructive border, H.error once at t0, and the shake', async () => {
    await draw({ refused: false })
    expect(screen.queryByTestId('b-refused')).toBeNull()
    await screen.rerender(<Button label="I’m going" onPress={jest.fn()} testID="b" refused />)
    expect(StyleSheet.flatten(screen.getByTestId('b-refused').props.style).borderColor).toBe(COLOR.destructive)
    expect(haptics.error).toHaveBeenCalledTimes(1)
    expect(Reanimated.withSequence).toHaveBeenCalled()
  })

  it('refused under Reduce Motion: no shake, the haptic and the border kept', async () => {
    reduceMotion.mockReturnValue(true)
    await draw({ refused: false })
    await screen.rerender(<Button label="I’m going" onPress={jest.fn()} testID="b" refused />)
    expect(Reanimated.withSequence).not.toHaveBeenCalled()
    expect(haptics.error).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('b-refused')).toBeTruthy()
  })

  it('focused draws the ring', async () => {
    await draw()
    expect(screen.queryByTestId('b-focus')).toBeNull()
    await fireEvent(screen.getByTestId('b'), 'focus')
    expect(screen.getByTestId('b-focus')).toBeTruthy()
  })
})

describe('platform press', () => {
  it('iOS scales to 0.97 on M.press', async () => {
    await draw()
    await fireEvent(screen.getByTestId('b'), 'pressIn')
    expect(Reanimated.withSpring).toHaveBeenCalledWith(0.97, expect.anything())
  })

  it('Android does not scale: it squares off to 12 dp', async () => {
    on('android')
    await draw()
    await fireEvent(screen.getByTestId('b'), 'pressIn')
    expect(Reanimated.withSpring).toHaveBeenCalledWith(RADIUS.pressedAndroid, expect.anything())
    expect(Reanimated.withSpring).not.toHaveBeenCalledWith(0.97, expect.anything())
  })
})

describe('accessibility settings', () => {
  it('caps Dynamic Type at 1.3×; the label wraps to two lines on Android only', async () => {
    await draw()
    expect(screen.getByText('I’m going').props).toMatchObject({ maxFontSizeMultiplier: 1.3, numberOfLines: 1 })
    on('android')
    await draw()
    expect(screen.getByText('I’m going').props.numberOfLines).toBe(2)
  })

  it('Bold Text steps the label 700 → 900', async () => {
    jest.spyOn(AccessibilityInfo, 'isBoldTextEnabled').mockResolvedValue(true)
    await draw()
    await act(async () => {})
    expect(StyleSheet.flatten(screen.getByText('I’m going').props.style).fontFamily).toBe(FONT_FAMILY.brand[900])
  })

  it('Increase Contrast adds the 50% hairline to secondary and tertiary only', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await draw({ kind: 'secondary' })
    await act(async () => {})
    expect(StyleSheet.flatten(screen.getByTestId('b-contrast').props.style).borderColor).toBe(MATERIAL.hairlineIncreaseContrast)
    await draw({ kind: 'primary' })
    await act(async () => {})
    expect(screen.queryByTestId('b-contrast')).toBeNull()
  })
})

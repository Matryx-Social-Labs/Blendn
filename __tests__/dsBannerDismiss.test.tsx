/*
 * <Banner onDismiss>: the closing × is a bare glyph on the banner's solid fill (glass has nothing to refract there),
 * a full touch target by its slop, and it stays on the sentence's first line, beside the glyph, when the action wraps under.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Dimensions, Platform, StyleSheet } from 'react-native'

jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return {
    GlassView: (props: object) => <View {...props} testID="glass" />,
    isGlassEffectAPIAvailable: jest.fn(() => true),
    isLiquidGlassAvailable: jest.fn(() => true),
  }
})
jest.mock('expo-blur', () => {
  const { View } = jest.requireActual('react-native')
  return { BlurView: (props: object) => <View testID="blur" {...props} /> }
})

/* eslint-disable import/first */
import { Banner } from '../components/ds/Banner'
import { minTarget } from '../components/ds/shared'
import { ICON } from '../lib/design/tokens'
/* eslint-enable import/first */

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style)
const window = Dimensions.get('window')
const os = Platform.OS
afterEach(() => {
  Dimensions.set({ window })
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
})

const banner = (onDismiss = jest.fn()) => (
  <Banner kind="info" icon="plane" text="Browsing Canada. Times are Toronto time." action={{ label: 'Back to Bengaluru', onPress: jest.fn() }} onDismiss={onDismiss} testID="b" />
)

it.each(['ios', 'android'] as const)('on %s the × draws no glass and no blur on the solid banner, and is a full target', async (platform) => {
  Object.defineProperty(Platform, 'OS', { value: platform, configurable: true })
  const onDismiss = jest.fn()
  await render(banner(onDismiss))
  expect(screen.queryByTestId('glass')).toBeNull()
  expect(screen.queryByTestId('blur')).toBeNull()
  const dismiss = screen.getByRole('button', { name: 'Dismiss' })
  // Real bounds (the accessibility node is the target), drawn at the glyph's size: no slop reaching over the action.
  const target = StyleSheet.flatten(dismiss.props.style)
  expect(target.width).toBe(minTarget())
  expect(target.height).toBe(minTarget())
  expect(target.margin).toBe(-(minTarget() - ICON.control) / 2)
  expect(dismiss.props.hitSlop).toBeUndefined()
  await fireEvent.press(dismiss)
  expect(onDismiss).toHaveBeenCalledTimes(1)
})

it('with the action wrapped under the sentence, the × hangs from the first line, level with the glyph', async () => {
  // The React Native jest preset starts at fontScale 2: past 1.3x, so the action is under the sentence.
  Dimensions.set({ window: { ...window, fontScale: 2 } })
  await render(banner())
  expect(flat('b-slot').flexBasis).toBe('100%')
  expect(flat('b-dismiss-slot')).toEqual(flat('b-glyph'))
  expect(flat('b-glyph').height).toBeGreaterThan(0)
})

it('beside the action, the × is centred in the row like the glyph', async () => {
  Dimensions.set({ window: { ...window, fontScale: 1 } })
  await render(banner())
  expect(flat('b-dismiss-slot')?.height).toBeUndefined()
})

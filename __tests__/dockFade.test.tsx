/*
 * A dock pinned over a scroll on the solid tier fades the page into itself instead of cutting it on a hard edge (r7 L7:
 * event preferences' "Dating" card sliced by Android's opaque dock). Glass shows what is under it and draws no fade.
 */
import { render, screen } from '@testing-library/react-native'
import { isLiquidGlassAvailable } from 'expo-glass-effect'
import React from 'react'
import { AccessibilityInfo, Platform, Text } from 'react-native'

import { Dock } from '../components/ds/Dock'
import { MATERIAL, SPACE } from '../lib/design/tokens'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: View, isGlassEffectAPIAvailable: jest.fn(() => true), isLiquidGlassAvailable: jest.fn(() => true) }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

const os = Platform.OS
function on(platform: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { value: platform, configurable: true })
  ;(isLiquidGlassAvailable as jest.Mock).mockReturnValue(platform === 'ios')
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false)
}
afterEach(() => Object.defineProperty(Platform, 'OS', { value: os, configurable: true }))

const dock = (floating: boolean) => (
  <Dock floating={floating} testID="d">
    <Text>Save</Text>
  </Dock>
)

it('floating on Android: a fade above the bar, into the bar’s own solid colour', async () => {
  on('android')
  await render(dock(true))
  const fade = screen.getByTestId('d-fade', { includeHiddenElements: true })
  expect(fade.props.colors[fade.props.colors.length - 1]).toBe(MATERIAL.solidBar)
  expect(fade.props.style).toMatchObject({ bottom: '100%', height: SPACE.xxxl })
})

it('in the flow, or on glass, no fade', async () => {
  on('android')
  await render(dock(false))
  expect(screen.queryByTestId('d-fade', { includeHiddenElements: true })).toBeNull()
  on('ios')
  await render(dock(true))
  expect(screen.queryByTestId('d-fade', { includeHiddenElements: true })).toBeNull()
})

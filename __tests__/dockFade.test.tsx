/*
 * A dock pinned over a scroll on the solid tier fades the page into itself instead of cutting it on a hard edge (r7 L7:
 * event preferences' "Dating" card sliced by Android's opaque dock). Glass shows what is under it and draws no fade.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
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

// RC 7: the Scene pads its scroll by the dock it is told of; the fade covers the page too, so the foot of a short page
// (a run's struck-through day strip) sat under it. The dock reports what it covers: the bar, and the fade when drawn.
const layout = (height: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width: 400, height } } })
it('reports what it covers: the bar and, on the solid tier, the fade above it', async () => {
  on('android')
  const onHeight = jest.fn()
  await render(
    <Dock floating onHeight={onHeight} testID="d">
      <Text>Save</Text>
    </Dock>
  )
  await fireEvent(screen.getByTestId('d'), 'layout', layout(120))
  expect(onHeight).toHaveBeenLastCalledWith(120 + SPACE.xxxl)
})

it('on glass, or in the flow, the bar alone', async () => {
  on('ios')
  const onHeight = jest.fn()
  await render(
    <Dock floating onHeight={onHeight} testID="d">
      <Text>Save</Text>
    </Dock>
  )
  await fireEvent(screen.getByTestId('d'), 'layout', layout(120))
  expect(onHeight).toHaveBeenLastCalledWith(120)
  on('android')
  const inFlow = jest.fn()
  await render(
    <Dock onHeight={inFlow} testID="f">
      <Text>Save</Text>
    </Dock>
  )
  await fireEvent(screen.getByTestId('f'), 'layout', layout(90))
  expect(inFlow).toHaveBeenLastCalledWith(90)
})

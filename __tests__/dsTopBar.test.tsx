/*
 * <TopBar> (guidelines/components/TopBar.html): no bar at rest; the bar glass
 * mounted behind once scrolled (glass never fades, §5.2); a condensed 17 pt
 * centred title; glass circles on the right; the Save pill; and the
 * accessibility matrix.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'

import { TopBar } from '../components/ds/TopBar'
import { COLOR, FONT_FAMILY, MATERIAL, TYPE } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
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
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} testID="gradient" /> }
})

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })

let haptics: Record<'select' | 'primary', jest.SpyInstance>
beforeEach(() => {
  on('ios')
  haptics = {
    select: jest.spyOn(H, 'select').mockImplementation(() => {}),
    primary: jest.spyOn(H, 'primary').mockImplementation(() => {}),
  }
})

const draw = (props: Partial<React.ComponentProps<typeof TopBar>> = {}) =>
  render(<TopBar title="Edit profile" onBack={jest.fn()} testID="top" {...props} />)

describe('<TopBar> row top (every frame: the back circle just under the safe-area top, `top: 62` under a 59 pt status bar)', () => {
  const INSET = 59 // the frame kit's status bar
  beforeEach(() => {
    jest.spyOn(jest.requireMock('react-native-safe-area-context'), 'useSafeAreaInsets').mockReturnValue({ top: INSET, bottom: 34, left: 0, right: 0 })
  })
  afterEach(() => jest.restoreAllMocks())

  it('the row starts 2 pt under the inset (a design exception for the frame’s 3), and the glass reaches 10 pt under the circle', async () => {
    await draw()
    const header = StyleSheet.flatten(screen.getByTestId('top').props.style)
    expect(header.paddingTop).toBe(INSET + 2)
    expect(header.paddingBottom).toBe(10)
  })

  it('the condensed title is centred on the circle row, which starts at the same place', async () => {
    await draw({ state: 'condensed' })
    expect(flat('top-condensed').top).toBe(INSET + 2)
    expect(flat('top-condensed').height).toBe(44)
  })
})

describe('<TopBar>', () => {
  it('at rest: no bar, a back circle and the title as a heading', async () => {
    await draw()
    expect(screen.queryByTestId('top-bar')).toBeNull()
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
    const title = screen.getByRole('header', { name: 'Edit profile' })
    expect(StyleSheet.flatten(title.props.style)).toMatchObject({ fontSize: TYPE.heading.fontSize, color: COLOR.textPrimary })
  })

  it('back is silent and calls back', async () => {
    const onBack = jest.fn()
    await draw({ onBack })
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(haptics.select).not.toHaveBeenCalled()
    expect(haptics.primary).not.toHaveBeenCalled()
  })

  it('scrolled: the bar glass tier is mounted behind, never faded', async () => {
    await draw({ state: 'scrolled' })
    expect(screen.getByTestId('top-bar')).toBeTruthy()
    expect(screen.getAllByTestId('glass').length).toBeGreaterThan(0)
    expect(flat('top-bar').opacity).toBeUndefined()
  })

  it('condensed: a 17 pt centred title in 700', async () => {
    await draw({ state: 'condensed' })
    const title = StyleSheet.flatten(screen.getByRole('header', { name: 'Edit profile' }).props.style)
    expect(title).toMatchObject({ fontSize: TYPE.bodyStrong.fontSize, fontFamily: FONT_FAMILY.brand[700], textAlign: 'center' })
  })

  it('condensed: the centred title keeps clear of the wider side', async () => {
    await draw({ state: 'condensed', save: { onPress: jest.fn() } })
    await fireEvent(screen.getByTestId('top-right'), 'layout', { nativeEvent: { layout: { width: 100, height: 48, x: 0, y: 0 } } })
    // 16 in, the 100 pt Save, 12 to the title: the same on both sides, so the title stays centred.
    expect(flat('top-condensed')).toMatchObject({ left: 128, right: 128 })
  })

  it('Android: the arrow back, and the solid bar once scrolled', async () => {
    on('android')
    await draw({ state: 'scrolled' })
    expect(screen.queryByTestId('glass')).toBeNull()
    expect(screen.getByTestId('top-bar')).toBeTruthy()
  })

  it('right actions are glass circles named by what they do', async () => {
    const onPress = jest.fn()
    await draw({ actions: [{ icon: 'user-plus', label: 'Add a friend', onPress }] })
    await fireEvent.press(screen.getByRole('button', { name: 'Add a friend' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('Save is the gradient pill with H.primary on press-in; saving reads busy', async () => {
    const onSave = jest.fn()
    await draw({ save: { onPress: onSave } })
    const save = screen.getByRole('button', { name: 'Save' })
    await fireEvent(save, 'pressIn')
    await fireEvent.press(save)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(haptics.primary).toHaveBeenCalledTimes(1)
    await draw({ save: { onPress: onSave, saving: true } })
    expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState).toMatchObject({ busy: true })
  })

  it('a sub line under the title scales freely; the title caps at 1.3× and truncates', async () => {
    await draw({ title: 'Nebula', sub: '4 people · 2 here now' })
    const title = screen.getByText('Nebula')
    expect(title.props.maxFontSizeMultiplier).toBe(1.3)
    expect(title.props.numberOfLines).toBe(1)
    const sub = screen.getByText('4 people · 2 here now')
    expect(sub.props.maxFontSizeMultiplier).toBeUndefined()
    expect(StyleSheet.flatten(sub.props.style).color).toBe(COLOR.textSecondary)
  })

  it('Increase Contrast: the 50% hairline under the scrolled bar', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await draw({ state: 'scrolled' })
    await act(async () => {})
    expect(flat('top-bar-contrast')).toMatchObject({ backgroundColor: MATERIAL.hairlineIncreaseContrast })
  })
})

describe('the Save pill’s height is the circle’s', () => {
  it.each([['ios', 44], ['android', 48]] as const)('%s: %i pt, level with the circle beside it', async (os, height) => {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
    await draw({ save: { onPress: jest.fn() }, testID: 'bar' })
    const style = StyleSheet.flatten(screen.getByRole('button', { name: 'Save' }).props.style)
    expect(style.height).toBe(height)
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
  })
})

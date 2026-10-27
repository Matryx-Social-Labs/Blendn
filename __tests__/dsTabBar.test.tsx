/*
 * <TabBar> (guidelines/components/TabBar.html; DESIGN-BRIEF §13): Pulse ·
 * Going · the disc · Banter · Me in a 64 pt bar-glass capsule, 16 in from the
 * edges; the selected pill (iOS) or indicator (Android); silent tab switches
 * (§10, §13); and the accessibility matrix.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Dimensions, Platform, StyleSheet } from 'react-native'

import * as Reanimated from 'react-native-reanimated'

import { pillX, TabBar, tabBarGeometry } from '../components/ds/TabBar'
import { COLOR, FONT_FAMILY, MATERIAL, RADIUS, SIZE, SPACE, SPRING } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false), withSpring: jest.fn(actual.withSpring) }
})
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
  return { LinearGradient: (props: object) => <View {...props} /> }
})

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const label = (t: string) => StyleSheet.flatten(screen.getByText(t).props.style)
const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })

const IDLE = { state: 'idle', eventId: null, badge: 0 } as const

const withSpring = Reanimated.withSpring as jest.Mock
const reduceMotion = Reanimated.useReducedMotion as jest.Mock
let haptics: jest.SpyInstance[]
beforeEach(() => {
  on('ios')
  reduceMotion.mockReturnValue(false)
  withSpring.mockClear()
  haptics = (['select', 'primary', 'disc'] as const).map((k) => jest.spyOn(H, k).mockImplementation(() => {}))
})

const draw = (props: Partial<React.ComponentProps<typeof TabBar>> = {}) =>
  render(<TabBar selected="pulse" onSelect={jest.fn()} disc={{ target: IDLE, onPress: jest.fn() }} testID="tabs" {...props} />)

describe('<TabBar>', () => {
  it('is a 64 pt capsule on the bar glass, 16 pt in from the edges', async () => {
    await draw()
    expect(flat('tabs')).toMatchObject({ height: SIZE.tabBar, borderRadius: RADIUS.tabBar, left: SPACE.tabBarInset, right: SPACE.tabBarInset })
    expect(screen.getByTestId('glass')).toBeTruthy()
  })

  it('Android: the solid bar tier, 12 dp above the gesture bar', async () => {
    on('android')
    await draw()
    expect(screen.queryByTestId('glass')).toBeNull()
    expect(flat('tabs').bottom).toBe(SPACE.tabBarBottomGapAndroid)
  })

  it('four tabs around the disc, in order; the selected one is selected', async () => {
    await draw({ selected: 'banter' })
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.props.accessibilityLabel)).toEqual(['Pulse', 'Going', 'Banter', 'Me'])
    expect(screen.getByRole('tab', { name: 'Banter' }).props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByTestId('disc')).toBeTruthy()
  })

  it('iOS: the selected tab is a 22% white pill and a 700 label; the rest 500 in textSecondary', async () => {
    await draw()
    expect(flat('tabs-pill').backgroundColor).toBe(COLOR.tabCapsule)
    expect(label('Pulse')).toMatchObject({ fontFamily: FONT_FAMILY.brand[700], color: COLOR.textPrimary })
    expect(label('Going')).toMatchObject({ fontFamily: FONT_FAMILY.brand[500], color: COLOR.textSecondary })
  })

  it('Android: a 56 × 32 indicator behind the glyph, and the label is not bold (§13)', async () => {
    on('android')
    await draw()
    expect(flat('tabs-pill')).toMatchObject({ width: 56, height: 32 })
    expect(label('Pulse').fontFamily).toBe(FONT_FAMILY.brand[500])
  })

  it('a tab switch calls back and plays nothing (§10.1 rule 5, §13)', async () => {
    const onSelect = jest.fn()
    await draw({ onSelect })
    await fireEvent.press(screen.getByRole('tab', { name: 'Going' }))
    expect(onSelect).toHaveBeenCalledWith('going')
    await fireEvent.press(screen.getByRole('tab', { name: 'Pulse' }))
    expect(onSelect).toHaveBeenLastCalledWith('pulse')
    for (const h of haptics) expect(h).not.toHaveBeenCalled()
  })

  it('Me is your own face, ringed white when selected', async () => {
    await draw({ selected: 'me', mePhoto: 'https://example.com/me.jpg' })
    expect(flat('tabs-me-avatar-ring').backgroundColor).toBe(COLOR.textPrimary)
  })

  it('labels cap at 1.3× in the fixed bar', async () => {
    await draw()
    expect(screen.getByText('Pulse').props.maxFontSizeMultiplier).toBe(1.3)
  })

  it('the bar is a tab list', async () => {
    await draw()
    expect(screen.getByTestId('tabs-row').props.accessibilityRole).toBe('tablist')
  })
})

describe('Increase Contrast and Bold Text', () => {
  it('Increase Contrast adds the 50% outline to the capsule', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await draw()
    await act(async () => {})
    expect(flat('tabs-contrast')).toMatchObject({ borderColor: MATERIAL.hairlineIncreaseContrast, borderRadius: RADIUS.tabBar })
  })

  it('Bold Text makes every label 700, so the pill alone tells them apart', async () => {
    jest.spyOn(AccessibilityInfo, 'isBoldTextEnabled').mockResolvedValue(true)
    await draw()
    await act(async () => {})
    expect(label('Pulse').fontFamily).toBe(FONT_FAMILY.brand[700])
    expect(label('Going').fontFamily).toBe(FONT_FAMILY.brand[700])
  })
})

describe('geometry: five equal slots, the disc in the middle one (owner override on #401)', () => {
  const { tabBarGeometry } = require('../components/ds/TabBar') as typeof import('../components/ds/TabBar')

  it.each([360, 393, 430, 440])('at %i pt all five centres are equally spaced, the disc at the middle of the screen', (width) => {
    const { cell, centres } = tabBarGeometry(width)
    expect(cell).toBeCloseTo((width - 40) / 5, 6)
    expect(centres[2]).toBeCloseTo(width / 2, 6)
    const gaps = centres.slice(1).map((c, i) => c - centres[i])
    gaps.forEach((g) => expect(g).toBeCloseTo(cell, 6))
    // Every 56 pt target, and the 56 pt disc, fits its slot.
    expect(cell).toBeGreaterThanOrEqual(56)
  })

  it('draws all five slots at the same width, the disc slot included', async () => {
    await draw()
    const width = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style).width
    const slots = ['pulse', 'going', 'banter', 'me'].map((k) => width(`tabs-${k}-cell`)).concat(width('tabs-disc-slot'))
    expect(new Set(slots).size).toBe(1)
  })
})


describe('the selection pill slides (DS #2: the capsule moves on M.snap)', () => {
  const WIDTH = 402 // the jest window
  const { cell } = tabBarGeometry(Dimensions.get('window').width)
  const translateX = () => (Reanimated.getAnimatedStyle(screen.getByTestId('tabs-pill', { includeHiddenElements: true })) as { transform: { translateX: number }[] }).transform[0].translateX

  it('is one pill, not one per tab', async () => {
    await draw({ selected: 'going' })
    expect(screen.getAllByTestId(/-pill$/, { includeHiddenElements: true })).toHaveLength(1)
    expect(screen.queryByTestId('tabs-going-pill')).toBeNull()
  })

  it('rests under the selected tab’s slot: its centre, the disc’s slot skipped', async () => {
    await draw({ selected: 'banter' })
    // Slot 3 (the disc owns 2), centred, after the row’s 4 pt of padding.
    expect(translateX()).toBe(SPACE.xs + cell * 3.5 - SIZE.primary / 2)
    expect(pillX('pulse', cell, SIZE.primary)).toBe(SPACE.xs + cell * 0.5 - SIZE.primary / 2)
    expect(pillX('me', cell, SIZE.primary)).toBe(SPACE.xs + cell * 4.5 - SIZE.primary / 2)
    void WIDTH
  })

  it('a new selection springs to the new slot on M.snap, from where it is', async () => {
    const view = await draw({ selected: 'pulse' })
    expect(withSpring).not.toHaveBeenCalled()
    await view.rerender(<TabBar selected="me" onSelect={jest.fn()} disc={{ target: IDLE, onPress: jest.fn() }} testID="tabs" />)
    expect(withSpring).toHaveBeenCalledWith(pillX('me', cell, SIZE.primary), expect.objectContaining({ stiffness: SPRING.snap.stiffness, damping: SPRING.snap.damping }))
  })

  it('a second switch mid-flight retargets: each selection springs to its own slot', async () => {
    const view = await draw({ selected: 'pulse' })
    for (const to of ['going', 'me'] as const) await view.rerender(<TabBar selected={to} onSelect={jest.fn()} disc={{ target: IDLE, onPress: jest.fn() }} testID="tabs" />)
    expect(withSpring.mock.calls.map(([x]) => x)).toEqual([pillX('going', cell, SIZE.primary), pillX('me', cell, SIZE.primary)])
  })

  it('Reduce Motion: it jumps, with no spring', async () => {
    reduceMotion.mockReturnValue(true)
    const view = await draw({ selected: 'pulse' })
    await view.rerender(<TabBar selected="me" onSelect={jest.fn()} disc={{ target: IDLE, onPress: jest.fn() }} testID="tabs" />)
    expect(withSpring).not.toHaveBeenCalled()
  })

  it('Android: the 56 × 32 indicator slides the same way', async () => {
    on('android')
    const view = await draw({ selected: 'pulse' })
    await view.rerender(<TabBar selected="going" onSelect={jest.fn()} disc={{ target: IDLE, onPress: jest.fn() }} testID="tabs" />)
    expect(withSpring).toHaveBeenCalledWith(pillX('going', cell, SIZE.primary), expect.any(Object))
    expect(flat('tabs-pill')).toMatchObject({ width: 56, height: 32 })
  })

  it('the tabs’ content crossfades, never slides (source check on the layout)', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../app/(tabs)/_layout.tsx'), 'utf8')
    expect(src).toMatch(/animation: 'fade'/)
    expect(src).toMatch(/transitionSpec: \{ animation: 'timing'/)
    expect(src).not.toMatch(/animation: 'shift'/)
  })
})

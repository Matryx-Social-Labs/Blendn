/*
 * <TabBar> (guidelines/components/TabBar.html; DESIGN-BRIEF §13): Pulse ·
 * Going · the disc · Banter · Me in a 64 pt bar-glass capsule, 16 in from the
 * edges; the selected pill (iOS) or indicator (Android); silent tab switches
 * (§10, §13); and the accessibility matrix.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'

import { TabBar } from '../components/ds/TabBar'
import { COLOR, FONT_FAMILY, MATERIAL, RADIUS, SIZE, SPACE } from '../lib/design/tokens'
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
  return { LinearGradient: (props: object) => <View {...props} /> }
})

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const label = (t: string) => StyleSheet.flatten(screen.getByText(t).props.style)
const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })

const IDLE = { state: 'idle', eventId: null, badge: 0 } as const

let haptics: jest.SpyInstance[]
beforeEach(() => {
  on('ios')
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
    expect(flat('tabs-pulse-pill').backgroundColor).toBe(COLOR.tabCapsule)
    expect(label('Pulse')).toMatchObject({ fontFamily: FONT_FAMILY.brand[700], color: COLOR.textPrimary })
    expect(label('Going')).toMatchObject({ fontFamily: FONT_FAMILY.brand[500], color: COLOR.textSecondary })
  })

  it('Android: a 56 × 32 indicator behind the glyph, and the label is not bold (§13)', async () => {
    on('android')
    await draw()
    expect(flat('tabs-pulse-pill')).toMatchObject({ width: 56, height: 32 })
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

describe('geometry: the design’s grid, 1fr 1fr 56 1fr 1fr inside 16 + 4 pt (owner defect on #401)', () => {
  const { tabBarGeometry } = require('../components/ds/TabBar') as typeof import('../components/ds/TabBar')

  it.each([360, 393, 430])('at %i pt the four tabs sit symmetric about the disc, with equal gaps', (width) => {
    const { cell, centres } = tabBarGeometry(width)
    const [pulse, going, disc, banter, me] = centres
    expect(cell).toBeCloseTo((width - 40 - 56) / 4, 6)
    expect(disc).toBeCloseTo(width / 2, 6)
    // Inner pair and outer pair, mirrored.
    expect(banter - disc).toBeCloseTo(disc - going, 6)
    expect(me - disc).toBeCloseTo(disc - pulse, 6)
    // Neighbouring tabs one cell apart on each side; the disc's slot is its own 56.
    expect(going - pulse).toBeCloseTo(cell, 6)
    expect(me - banter).toBeCloseTo(cell, 6)
    expect(banter - going).toBeCloseTo(cell + 56, 6)
    // Every tab's 56 pt target fits its cell, so no label can widen one.
    expect(cell).toBeGreaterThanOrEqual(56)
  })

  it('draws every tab cell at the same width, whatever its label, and the disc slot at 56', async () => {
    await draw()
    const width = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style).width
    const cells = ['pulse', 'going', 'banter', 'me'].map((k) => width(`tabs-${k}-cell`))
    expect(new Set(cells).size).toBe(1)
    expect(width('tabs-disc-slot')).toBe(56)
  })
})

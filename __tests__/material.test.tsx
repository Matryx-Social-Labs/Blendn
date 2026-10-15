/*
 * <Material> resolves glass, blur or solid by platform, glass support and
 * Reduce Transparency, and takes its tints from the tokens (DESIGN-BRIEF §5).
 */
import { render, screen, waitFor } from '@testing-library/react-native'
import { isLiquidGlassAvailable } from 'expo-glass-effect'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet, Text } from 'react-native'

import { Material, materialTier } from '../components/ui/Material'
import { MATERIAL } from '../lib/design/tokens'

jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return {
    GlassView: (props: object) => <View {...props} testID="glass" />,
    isGlassEffectAPIAvailable: () => true,
    isLiquidGlassAvailable: jest.fn(() => true),
  }
})
jest.mock('expo-blur', () => {
  const { View } = jest.requireActual('react-native')
  return { BlurView: (props: object) => <View testID="blur" {...props} /> }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View testID="highlight" {...props} /> }
})

const liquidGlass = isLiquidGlassAvailable as jest.Mock

function on(os: 'ios' | 'android', { glass = false, reduceTransparency = false } = {}) {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
  liquidGlass.mockReturnValue(glass)
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(reduceTransparency)
}

const flat = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style)

describe('materialTier', () => {
  it.each([
    ['android', false, false, 'solid'],
    ['android', true, false, 'solid'],
    ['ios', true, false, 'glass'],
    ['ios', true, true, 'glass'], // iOS 26+ glass handles Reduce Transparency itself
    ['ios', false, false, 'blur'],
    ['ios', false, true, 'solid'],
  ])('%s, liquid glass %s, Reduce Transparency %s → %s', (os, liquidGlass, reduceTransparency, tier) => {
    expect(materialTier({ os, liquidGlass, reduceTransparency })).toBe(tier)
  })
})

describe('<Material>', () => {
  const draw = (role: React.ComponentProps<typeof Material>['role']) =>
    render(
      <Material role={role} testID="material">
        <Text>Pulse</Text>
      </Material>
    )

  it('is regular glass tinted with ink on iOS 26+', async () => {
    on('ios', { glass: true })
    await draw('bar')
    expect(screen.getByTestId('glass').props).toMatchObject({ glassEffectStyle: 'regular', tintColor: MATERIAL.glassTintBar })
  })

  it('is clear glass over a hero photo', async () => {
    on('ios', { glass: true })
    await draw('media')
    expect(screen.getByTestId('glass').props.glassEffectStyle).toBe('clear')
  })

  it('is a blur tinted harder on older iOS', async () => {
    on('ios')
    await draw('sheet')
    expect(screen.getByTestId('blur').props.tint).toBe('systemChromeMaterialDark')
    expect(screen.getByText('Pulse')).toBeTruthy()
  })

  it('turns solid under Reduce Transparency on older iOS', async () => {
    on('ios', { reduceTransparency: true })
    await draw('bar')
    await waitFor(() => expect(screen.queryByTestId('blur')).toBeNull())
    expect(flat('material').backgroundColor).toBe(MATERIAL.solidBar)
  })

  it('is Tier B solid on Android: near-opaque, a top hairline and the inner highlight', async () => {
    on('android')
    await draw('control')
    expect(flat('material')).toMatchObject({ backgroundColor: MATERIAL.solidControl, borderTopColor: MATERIAL.solidTopHairline })
    expect(screen.getByTestId('highlight').props.colors).toEqual(MATERIAL.solidInnerHighlight.colors)
    expect(screen.queryByTestId('glass')).toBeNull()
    expect(screen.queryByTestId('blur')).toBeNull()
  })

  it.each(['ios', 'android'] as const)('never sets an opacity of its own (%s)', async (os) => {
    on(os)
    await draw('toast')
    expect(flat('material').opacity).toBeUndefined()
  })
})

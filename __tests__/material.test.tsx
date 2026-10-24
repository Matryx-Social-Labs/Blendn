/*
 * <Material> resolves glass, blur or solid by platform, glass support and
 * Reduce Transparency, and takes its tints from the tokens (DESIGN-BRIEF §5).
 */
import { act, render, screen, waitFor } from '@testing-library/react-native'
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet, Text, TextInput } from 'react-native'

import { Material, materialTier } from '../components/ui/Material'
import { COLOR, MATERIAL } from '../lib/design/tokens'
import { tint } from '../lib/theme'

const channel = (c: number) => {
  const x = c / 255
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1, 7), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

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
  return { LinearGradient: (props: object) => <View testID="highlight" {...props} /> }
})

const liquidGlass = isLiquidGlassAvailable as jest.Mock
const glassApi = isGlassEffectAPIAvailable as jest.Mock

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

  it('media glass has an ink floor, so a white glyph on it reads at 3:1 even over a white photo (B-S9)', async () => {
    on('ios', { glass: true })
    await draw('media')
    const floor = StyleSheet.flatten(screen.getByTestId('material-media-floor', { includeHiddenElements: true }).props.style)
    expect(floor.backgroundColor).toBe(tint(COLOR.ink, MATERIAL.glassDimMedia))
    // The floor alone, composited over pure white (the clear glass's own 25% tint only darkens it further).
    const over = (alpha: number, ink: string, ground: number) => Math.round(alpha * parseInt(ink.slice(1, 3), 16) + (1 - alpha) * ground)
    const v = over(MATERIAL.glassDimMedia, COLOR.ink, 255).toString(16).padStart(2, '0')
    expect(contrast(COLOR.textPrimary, `#${v}${v}${v}`)).toBeGreaterThanOrEqual(3)
  })

  it('no other role, and no other tier, draws the floor', async () => {
    on('ios', { glass: true })
    await draw('bar')
    expect(screen.queryByTestId('material-media-floor', { includeHiddenElements: true })).toBeNull()
    on('android')
    await draw('media')
    expect(screen.queryByTestId('material-media-floor', { includeHiddenElements: true })).toBeNull()
  })

  it('is a blur tinted harder on older iOS, at the full system material', async () => {
    on('ios')
    await draw('sheet')
    expect(screen.getByTestId('blur').props).toMatchObject({ tint: 'systemChromeMaterialDark', intensity: 100 })
    expect(screen.getByText('Pulse')).toBeTruthy()
  })

  it('falls back to blur when the glass API is missing or throws (iOS 26 betas, an older binary)', async () => {
    on('ios', { glass: true })
    glassApi.mockReturnValueOnce(false)
    await draw('bar')
    expect(screen.queryByTestId('glass')).toBeNull()
    expect(screen.getByTestId('blur')).toBeTruthy()
  })

  it('falls back to blur, not a crash, when the native module is absent', async () => {
    on('ios', { glass: true })
    glassApi.mockImplementationOnce(() => {
      throw new Error("Cannot find native module 'ExpoGlassEffect'")
    })
    await draw('bar')
    expect(screen.getByTestId('blur')).toBeTruthy()
  })

  it('keeps its children mounted when Reduce Transparency switches tiers', async () => {
    on('ios')
    let changed: (value: boolean) => void = () => {}
    const remove = jest.fn()
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((_: string, handler: (v: boolean) => void) => {
      changed = handler
      return { remove }
    }) as never)
    const input = React.createRef<TextInput>()
    const { unmount } = await render(
      <Material role="bar" testID="material">
        <TextInput ref={input} />
      </Material>
    )
    const before = input.current
    await act(async () => changed(true))
    expect(flat('material').backgroundColor).toBe(MATERIAL.solidBar)
    expect(input.current).toBe(before)
    await act(async () => changed(false))
    expect(screen.getByTestId('blur')).toBeTruthy()
    expect(input.current).toBe(before)
    await unmount()
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('turns solid under Reduce Transparency on older iOS', async () => {
    on('ios', { reduceTransparency: true })
    await draw('bar')
    await waitFor(() => expect(screen.queryByTestId('blur')).toBeNull())
    expect(flat('material').backgroundColor).toBe(MATERIAL.solidBar)
  })

  it('is Tier B solid on Android: near-opaque, a top hairline and the inner highlight', async () => {
    on('android')
    await draw('sheet')
    expect(flat('material')).toMatchObject({ backgroundColor: MATERIAL.solidSheet, borderTopColor: MATERIAL.solidTopHairline })
    expect(screen.getByTestId('highlight').props.colors).toEqual(MATERIAL.solidInnerHighlight.colors)
    expect(screen.queryByTestId('glass')).toBeNull()
    expect(screen.queryByTestId('blur')).toBeNull()
  })

  it.each(['control', 'media'] as const)('a solid %s circle is rimmed all round, not a top arc that reads as a half-moon (r7 L14, L13)', async (role) => {
    on('android')
    await draw(role)
    expect(flat('material')).toMatchObject({ borderWidth: 1, borderColor: MATERIAL.solidTopHairline })
  })

  it('a solid bar keeps its top hairline only', async () => {
    on('android')
    await draw('bar')
    expect(flat('material').borderWidth).toBeUndefined()
    expect(flat('material').borderTopWidth).toBe(1)
  })

  it.each(['ios', 'android'] as const)('never sets an opacity of its own (%s)', async (os) => {
    on(os)
    await draw('toast')
    expect(flat('material').opacity).toBeUndefined()
  })
})

describe('the solid tier is opaque (visual QA r5: white text ghosted through the Android tab bar, the Scene dock and the Plus dock)', () => {
  const alpha = (css: string) => {
    if (/^#[0-9a-f]{6}$/i.test(css)) return 1
    const m = css.match(/^rgba\([^)]*,\s*([\d.]+)\)$/)
    return m ? Number(m[1]) : 1
  }

  it('every solid role is fully opaque: "solid" is the tier’s whole contract', async () => {
    const { SOLID } = jest.requireActual('../components/ui/Material') as typeof import('../components/ui/Material')
    for (const [role, css] of Object.entries(SOLID)) expect([role, alpha(css)]).toEqual([role, 1])
  })

  it('the token itself, in the design source and in the generated file, is #1A1818', () => {
    expect(MATERIAL.solidBar).toBe('#1A1818')
    expect(require('fs').readFileSync(require('path').join(__dirname, '..', 'design', 'tokens.json'), 'utf8')).toContain('"solid-bar": "#1A1818"')
  })
})

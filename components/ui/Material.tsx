import { BlurView, type BlurTint } from 'expo-blur'
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect'
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useState } from 'react'
import { AccessibilityInfo, Platform, StyleSheet, View, type ViewProps } from 'react-native'

import { COLOR, MATERIAL } from '../../lib/design/tokens'
import { tint } from '../../lib/theme'

/**
 * What a surface is for (DESIGN-BRIEF §5.4): `bar` (tab bar, top bar, docks,
 * the composer), `sheet` (quick views at a partial detent), `control`
 * (floating circle buttons), `media` (controls over one hero photo), `toast`.
 */
export type MaterialRole = 'bar' | 'sheet' | 'control' | 'media' | 'toast'
/** glass: iOS 26+. blur: iOS 16.4–25. solid: Android (Tier B) and Reduce Transparency. */
export type MaterialTier = 'glass' | 'blur' | 'solid'

/*
 * Ink under each role, so text and icons on it pass at the clearest glass
 * setting (§5.2 rule 5). bar/sheet/control are the tokens; media and toast are
 * the Material component page's values, which tokens.json does not carry yet
 * (its `glass-tint-text`, 0.60, is lower than the page's toast at 0.80).
 */
const MEDIA_GLASS_INK = 0.25
const TOAST_GLASS_INK = 0.8

export const GLASS: Record<MaterialRole, string> = {
  bar: MATERIAL.glassTintBar,
  sheet: MATERIAL.glassTintSheet,
  control: MATERIAL.glassTintIcon,
  media: tint(COLOR.ink, MEDIA_GLASS_INK),
  toast: tint(COLOR.ink, TOAST_GLASS_INK),
}

/** The blur tier cannot saturate the backdrop, so it tints harder (§5.3). */
export const BLUR: Record<MaterialRole, { material: BlurTint; tint: string }> = {
  bar: { material: 'systemChromeMaterialDark', tint: MATERIAL.blurTintBar },
  toast: { material: 'systemChromeMaterialDark', tint: MATERIAL.blurTintBar },
  sheet: { material: 'systemChromeMaterialDark', tint: MATERIAL.blurTintSheet },
  control: { material: 'systemThinMaterialDark', tint: MATERIAL.blurMaterial },
  media: { material: 'systemUltraThinMaterialDark', tint: MATERIAL.blurMaterial },
}

export const SOLID: Record<MaterialRole, string> = {
  bar: MATERIAL.solidBar,
  toast: MATERIAL.solidBar,
  sheet: MATERIAL.solidSheet,
  control: MATERIAL.solidControl,
  media: MATERIAL.solidControl,
}

/** Which tier draws. iOS 26+ glass handles Reduce Transparency itself; every fallback must (§14). */
export function materialTier({
  os,
  liquidGlass,
  reduceTransparency,
}: {
  os: string
  liquidGlass: boolean
  reduceTransparency: boolean
}): MaterialTier {
  if (os !== 'ios') return 'solid'
  if (liquidGlass) return 'glass'
  return reduceTransparency ? 'solid' : 'blur'
}

/** False on a binary built before expo-glass-effect was added, rather than a crash. */
function liquidGlassAvailable() {
  if (Platform.OS !== 'ios') return false
  try {
    return isGlassEffectAPIAvailable() && isLiquidGlassAvailable()
  } catch {
    return false
  }
}

function useReduceTransparency() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    let live = true
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((value) => {
        if (live) setOn(value)
      })
      .catch(() => {})
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setOn)
    return () => {
      live = false
      sub.remove()
    }
  }, [])
  return on
}

/**
 * The one glass surface (§5): glass on iOS 26+, blur on older iOS, solid on
 * Android and under Reduce Transparency. Chrome only — never cards, rows or
 * anything inside a scroll — and nothing glass sits on it (a control on it is
 * a fill: `MATERIAL.fillOnGlass`).
 *
 * It never animates opacity, and nothing containing it should: glass fades
 * wrong (§5.2 rule 6). Show and hide it by mounting it; press it by scale.
 * Shape is the caller's (`borderRadius` in `style`); content is clipped to it.
 * `role` is the material's, not ARIA's: a material carries no meaning.
 *
 * ponytail: no Increase Contrast hairline and no Tier B noise tile yet; they
 * come with the first screen that adopts this.
 */
export function Material({ role, style, children, ...rest }: Omit<ViewProps, 'role'> & { role: MaterialRole }) {
  const reduceTransparency = useReduceTransparency()
  const tier = materialTier({ os: Platform.OS, liquidGlass: liquidGlassAvailable(), reduceTransparency })

  if (tier === 'glass') {
    return (
      <GlassView
        {...rest}
        glassEffectStyle={role === 'media' ? 'clear' : 'regular'}
        tintColor={GLASS[role]}
        colorScheme="dark"
        style={[styles.clip, style]}
      >
        {children}
      </GlassView>
    )
  }

  if (tier === 'blur') {
    return (
      <View {...rest} style={[styles.clip, styles.edge, style]}>
        <BlurView tint={BLUR[role].material} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: BLUR[role].tint }]} />
        {children}
      </View>
    )
  }

  return (
    <View {...rest} style={[styles.clip, styles.solid, { backgroundColor: SOLID[role] }, style]}>
      <LinearGradient colors={MATERIAL.solidInnerHighlight.colors} style={styles.highlight} />
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  edge: { borderWidth: MATERIAL.glassEdge.width, borderColor: MATERIAL.glassEdge.color },
  /** Tier B (§13): a 1pt top hairline and a 0 → 6% white highlight over the top 12pt. */
  solid: { borderTopWidth: 1, borderTopColor: MATERIAL.solidTopHairline },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: MATERIAL.solidInnerHighlight.height,
    pointerEvents: 'none',
  },
})

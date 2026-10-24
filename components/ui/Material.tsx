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
 * setting (§5.2 rule 5) — every one a token (tokens.json R4-0 B10: text and
 * toast 0.80, media 0.25).
 */
export const GLASS: Record<MaterialRole, string> = {
  bar: MATERIAL.glassTintBar,
  sheet: MATERIAL.glassTintSheet,
  control: MATERIAL.glassTintIcon,
  media: MATERIAL.glassTintMedia,
  toast: MATERIAL.glassTintToast,
}

/**
 * Clear glass over one hero photo has no floor of its own: over a bright photo the circle vanished and its white glyph
 * with it (B-S9). The media role lays the token's dim (`glassDimMedia`, 45% ink) under its content, which alone holds a
 * white glyph at 3:1 over pure white; the glass's own 25% tint only darkens it further.
 */
const MEDIA_FLOOR = tint(COLOR.ink, MATERIAL.glassDimMedia)

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

/*
 * The last Reduce Transparency value seen, shared by every Material, so one
 * mounted after the first answer starts right instead of drawing a frame of
 * blur and then switching. Asked once when this module loads, which is long
 * before the first chrome renders.
 */
let lastReduceTransparency = false
function remember(value: boolean) {
  lastReduceTransparency = value
}
AccessibilityInfo.isReduceTransparencyEnabled?.().then(remember, () => {})

function useReduceTransparency() {
  const [on, setOn] = useState(lastReduceTransparency)
  useEffect(() => {
    let live = true
    const update = (value: boolean) => {
      remember(value)
      if (live) setOn(value)
    }
    AccessibilityInfo.isReduceTransparencyEnabled().then(update, () => {})
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', update)
    return () => {
      live = false
      sub.remove()
    }
  }, [])
  return on
}

/*
 * expo-blur's intensity is 0–100, a fraction of the system material; its web
 * build maps one unit to 0.2px. The token's 24px is past that ceiling, so the
 * blur tier draws the system material at full strength, as §5.3 asks.
 */
const EXPO_BLUR_PX_PER_UNIT = 0.2
const EXPO_BLUR_MAX = 100
const BLUR_INTENSITY = Math.min(EXPO_BLUR_MAX, MATERIAL.blurRadius / EXPO_BLUR_PX_PER_UNIT)

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
/** The tier this phone draws now: what `<Material>` will be, for a neighbour that has to match it (a dock's fade). */
export function useMaterialTier(): MaterialTier {
  const reduceTransparency = useReduceTransparency()
  return materialTier({ os: Platform.OS, liquidGlass: liquidGlassAvailable(), reduceTransparency })
}

export function Material({ role, style, children, ...rest }: Omit<ViewProps, 'role'> & { role: MaterialRole }) {
  const tier = useMaterialTier()

  if (tier === 'glass') {
    return (
      <GlassView
        {...rest}
        glassEffectStyle={role === 'media' ? 'clear' : 'regular'}
        tintColor={GLASS[role]}
        colorScheme="dark"
        style={[styles.clip, style]}
      >
        {role === 'media' ? <View testID="material-media-floor" pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: MEDIA_FLOOR }]} /> : null}
        {children}
      </GlassView>
    )
  }

  /*
   * Blur and solid share one shape — a View, its layers in one slot, the
   * children in the next — so Reduce Transparency switching between them
   * swaps the layers and keeps the children mounted (a focused TextInput in
   * the composer stays focused).
   */
  const layers =
    tier === 'blur' ? (
      <>
        <BlurView tint={BLUR[role].material} intensity={BLUR_INTENSITY} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: BLUR[role].tint }]} />
      </>
    ) : (
      <LinearGradient colors={MATERIAL.solidInnerHighlight.colors} style={styles.highlight} />
    )
  // A bar or sheet keeps a top hairline; a circle (control, media) takes it all round, or on a ground of its own tone it
  // reads as a half-moon (r7 L14: Home's filter circle) or not at all (L13: the profile's circles on the creature hero).
  const round = role === 'control' || role === 'media'
  const surface = tier === 'blur' ? styles.edge : [round ? styles.solidRim : styles.solid, { backgroundColor: SOLID[role] }]

  return (
    <View {...rest} style={[styles.clip, surface, style]}>
      {layers}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  edge: { borderWidth: MATERIAL.glassEdge.width, borderColor: MATERIAL.glassEdge.color },
  /** Tier B (§13): a 1pt top hairline and a 0 → 6% white highlight over the top 12pt. */
  solid: { borderTopWidth: 1, borderTopColor: MATERIAL.solidTopHairline },
  solidRim: { borderWidth: 1, borderColor: MATERIAL.solidTopHairline },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: MATERIAL.solidInnerHighlight.height,
    pointerEvents: 'none',
  },
})

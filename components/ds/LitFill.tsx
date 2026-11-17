import type { ReactNode } from 'react'
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated from 'react-native-reanimated'

import { GradientFill } from '../ui/GradientFill'
import { COLOR, MATERIAL } from '../../lib/design/tokens'
import { OPACITY } from '../../lib/theme'

/** The positive look's rim: the hold's 1.5 pt gradient (board C, `inset: 1.5px`), shared by Button, IconButton and the hold. */
export const LIT_RIM = 1.5

/**
 * Direction C's positive look (buttons board, owner 2026-11-17): the full gradient as a 1.5 pt rim, and inside it the tinted
 * gradient (`GRADIENT.lit`, the brand stops at 46% over surface). Fills its parent, which clips to its own shape; `inset` is
 * the inner shape's (animated) corner, so the tint follows an Android press squaring the pill off. `children` draw inside
 * the tint (the press pour).
 *
 * The hold's two other tracks are the same two layers in solid colours (board `.hold.far`, `.hold.neutral`): `rim` instead
 * of the gradient rim, `ground` instead of the tint.
 */
export function LitFill({
  radius,
  inset,
  rim,
  ground,
  testID,
  children,
}: {
  radius: number
  inset?: StyleProp<ViewStyle>
  rim?: string
  ground?: string
  testID?: string
  children?: ReactNode
}) {
  return (
    <View testID={testID} pointerEvents="none" style={[StyleSheet.absoluteFill, rim ? { backgroundColor: rim } : null]}>
      {rim ? null : <GradientFill style={StyleSheet.absoluteFill} />}
      <Animated.View testID={testID && `${testID}-inset`} style={[styles.inset, { borderRadius: Math.max(radius - LIT_RIM, 0) }, ground ? { backgroundColor: ground } : null, inset]}>
        {ground ? null : <GradientFill gradient="lit" style={StyleSheet.absoluteFill} />}
        {children}
      </Animated.View>
    </View>
  )
}

const [GLOW] = MATERIAL.glowHero
/**
 * The iOS underlay sits this far inside the button, so its ink never shows past the gradient while the button presses to
 * 0.97 (a 533 pt button loses 4 a side); its spread gives the distance back, so the glow is the board's exactly.
 */
const UNDER_INSET = 4
/** The board's glow (`0 8px 22px -6px`) as RN's `boxShadow`, from the inset underlay. */
const HERO_SHADOW = [{ offsetX: 0, offsetY: GLOW.offsetY, blurRadius: GLOW.radius, spreadDistance: GLOW.spread + UNDER_INSET, color: GLOW.color }]
/** Android draws the glow as the gradient itself, blurred, at 35% (board C: "Android: a blurred GradientFill at 35%"). */
const ANDROID_GLOW_ALPHA = 0.35
/** RenderEffect blur (RN `filter`) exists from Android 12; below it the slab would draw sharp, so there is no glow. */
const ANDROID_BLUR_API = 31
/** The blur spills this far past the slab; the box it is drawn in is that much larger, or the blur would be cut at its edge. */
const SPILL = GLOW.radius

/**
 * The hero's soft rose glow under the one `primary` (board C `.b.hero`). iOS: an ink underlay inside the button casting the
 * glow (RN `boxShadow`, spread inward). Android: the gradient slab, blurred, at 35%. It dims with the button when disabled.
 */
export function HeroGlow({ radius, disabled, testID }: { radius: number; disabled: boolean; testID?: string }) {
  const dim = disabled ? OPACITY.disabled : 1
  if (Platform.OS !== 'android') {
    return <View testID={testID} pointerEvents="none" style={[styles.under, { borderRadius: Math.max(radius - UNDER_INSET, 0), opacity: dim }]} />
  }
  if (typeof Platform.Version === 'number' && Platform.Version < ANDROID_BLUR_API) return null
  const spread = -GLOW.spread
  return (
    <View
      testID={testID}
      pointerEvents="none"
      style={[styles.spill, { top: GLOW.offsetY - SPILL, bottom: -GLOW.offsetY - SPILL, opacity: ANDROID_GLOW_ALPHA * dim, filter: [{ blur: GLOW.radius / 2 }] }]}
    >
      <GradientFill style={[styles.slab, { top: SPILL + spread, bottom: SPILL + spread, left: SPILL + spread, right: SPILL + spread, borderRadius: Math.max(radius - spread, 0) }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  inset: { position: 'absolute', top: LIT_RIM, left: LIT_RIM, right: LIT_RIM, bottom: LIT_RIM, overflow: 'hidden' },
  under: { position: 'absolute', top: UNDER_INSET, left: UNDER_INSET, right: UNDER_INSET, bottom: UNDER_INSET, backgroundColor: COLOR.ink, boxShadow: HERO_SHADOW },
  spill: { position: 'absolute', left: -SPILL, right: -SPILL },
  slab: { position: 'absolute' },
})

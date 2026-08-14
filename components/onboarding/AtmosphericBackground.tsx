import { StyleSheet, View } from 'react-native'

import { EMBER } from '../../lib/theme'

/**
 * The two blurred smears behind every onboarding screen.
 *
 * The design is two heavily-blurred rounded rectangles:
 *
 *     warm  156 × 444.8  at left -42.9,  top -122.31,  blur 60px, #FF906D @ 5%
 *     cool  117 × 333.59 at right -15.6, top  211.27,  blur 50px, #FF6D8D @ 5%
 *
 * ## Four attempts, and why this one
 *
 * A flat `backgroundColor` on a rounded View has a hard *edge* even at 5%
 * alpha, so it reads as a shape sitting on the page. A `LinearGradient` fading
 * to transparent removed the edge in one direction and left it in the other
 * three — a blurred ellipse fades outward on every axis and a linear gradient
 * cannot express that.
 *
 * `react-native-svg` gives a true radial gradient and was the third attempt. It
 * is also a **native module**, so it renders as "Unimplemented component" in any
 * dev client built before it was installed — which is every build in existence
 * at the moment somebody pulls this branch. Correct output, unusable delivery.
 *
 * So: concentric ellipses at decreasing opacity, in plain Views. This
 * approximates a radial falloff by stacking, and at 5% peak alpha the steps are
 * far below the threshold where banding is visible — the whole effect spans
 * five hundredths of full opacity, and eight layers divide that into slices no
 * screen can resolve as edges.
 *
 * No dependency, no rebuild, and it works in the build you already have.
 * `expo-blur` remains the wrong tool throughout: it blurs what is *behind* a
 * view, not the view itself.
 */

/** How many shells. More is smoother and costs more views; eight is invisible. */
const LAYERS = 8

/**
 * Each shell's geometry and alpha.
 *
 * A Gaussian blur of radius `b` spreads a shape's visible extent by roughly `b`
 * in every direction, with the original edge near the half-intensity point — so
 * the outermost shell is `size + 2b` and the alpha ramps toward the middle
 * rather than the rim.
 *
 * Alpha per shell is `peak / LAYERS` so the *stack* sums to the design's 5%
 * at the core: eight overlapping shells at 0.625% each. Painting every shell at
 * the full 5% would give a solid centre with a stepped edge, which is the
 * problem this exists to solve.
 */
function shells(size: { width: number; height: number }, blur: number, color: string) {
  return Array.from({ length: LAYERS }, (_, i) => {
    // 1 at the outside, shrinking inward.
    const t = 1 - i / LAYERS
    const w = size.width + 2 * blur * t
    const h = size.height + 2 * blur * t
    return {
      key: `${color}-${i}`,
      style: {
        position: 'absolute' as const,
        width: w,
        height: h,
        borderRadius: 9999,
        backgroundColor: color,
        opacity: 0.05 / LAYERS,
        // Each shell is centred on the same point, so growing it has to pull
        // the offset back by half the growth or the stack drifts up-left.
        left: -(w - size.width) / 2,
        top: -(h - size.height) / 2,
      },
    }
  })
}

/*
 * `width`/`height`, spelled the way a style expects.
 *
 * These were `{ w, h }` and spread straight into a style object, which is not
 * a type error — React Native ignores keys it does not know — so both
 * containers silently collapsed to zero size. The left smear still looked
 * roughly right because it is anchored by `left` and grows rightward from
 * there; the right one is anchored by `right`, so a zero-width container put
 * its whole stack off the edge of the screen. That is the reported symptom, and
 * it is why the two looked differently broken.
 */
const WARM = { width: 156, height: 444.8 }
const COOL = { width: 117, height: 333.59 }

export function AtmosphericBackground() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Positioned exactly as the frame has them, bleeding off both edges. */}
      <View style={{ position: 'absolute', left: -42.9, top: -122.31, ...WARM }}>
        {shells(WARM, 60, EMBER.gradientFrom).map((s) => (
          <View key={s.key} style={s.style} />
        ))}
      </View>

      <View style={{ position: 'absolute', right: -15.6, top: 211.27, ...COOL }}>
        {shells(COOL, 50, EMBER.gradientTo).map((s) => (
          <View key={s.key} style={s.style} />
        ))}
      </View>
    </View>
  )
}

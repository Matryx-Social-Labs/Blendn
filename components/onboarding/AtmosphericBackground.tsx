import { StyleSheet, View } from 'react-native'
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg'

import { EMBER } from '../../lib/theme'

/**
 * The two blurred smears behind every onboarding screen.
 *
 * ## Why this is SVG and not a styled View
 *
 * The design is two heavily-blurred rounded rectangles:
 *
 *     warm  156 × 444.8  at left -42.9,  top -122.31,  blur 60px, #FF906D @ 5%
 *     cool  117 × 333.59 at right -15.6, top  211.27,  blur 50px, #FF6D8D @ 5%
 *
 * Two earlier attempts got this wrong in instructive ways. A flat
 * `backgroundColor` on a rounded View has a hard *edge* even at 5% alpha, so it
 * reads as a shape on the page. A `LinearGradient` fading to transparent fixed
 * the edge in one direction and left it in the other three — a blurred ellipse
 * fades outward on every axis, and a linear gradient cannot.
 *
 * A radial gradient is the primitive that actually matches, which is what
 * `react-native-svg` is here for. `expo-blur` is not an option: it blurs what is
 * *behind* a view, not the view itself.
 *
 * ## The blur-to-gradient conversion
 *
 * A Gaussian blur of radius `b` spreads a shape's visible extent by roughly `b`
 * in every direction, with the original edge landing near the half-intensity
 * point. So each ellipse is drawn at `size/2 + blur` and the colour stop that
 * corresponds to the original edge sits partway out, fading to fully
 * transparent at the rim.
 *
 * Rendered once per screen behind everything, non-interactive. Exact values
 * live here rather than in `theme.ts` because they are positions in a specific
 * composition, not tokens anything else reuses.
 */

/** Warm smear, top-left, bleeding off both edges. */
const WARM = {
  cx: -42.9 + 156 / 2,
  cy: -122.31 + 444.8 / 2,
  rx: 156 / 2 + 60,
  ry: 444.8 / 2 + 60,
  color: EMBER.gradientFrom,
}

/** Cool smear, right side, lower down. Positioned from the right edge. */
const COOL = {
  rightInset: -15.6 + 117 / 2,
  cy: 211.27 + 333.59 / 2,
  rx: 117 / 2 + 50,
  ry: 333.59 / 2 + 50,
  color: EMBER.gradientTo,
}

export function AtmosphericBackground({ width }: { width: number }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          {/*
            0.05 at the core is the design's alpha. It holds to 35% of the
            radius before falling away, which is what keeps the shape readable
            as a shape rather than dissolving into an even wash.
          */}
          <RadialGradient id="warm" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={WARM.color} stopOpacity={0.05} />
            <Stop offset="35%" stopColor={WARM.color} stopOpacity={0.038} />
            <Stop offset="100%" stopColor={WARM.color} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="cool" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={COOL.color} stopOpacity={0.05} />
            <Stop offset="35%" stopColor={COOL.color} stopOpacity={0.038} />
            <Stop offset="100%" stopColor={COOL.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        <Ellipse cx={WARM.cx} cy={WARM.cy} rx={WARM.rx} ry={WARM.ry} fill="url(#warm)" />
        <Ellipse
          cx={width - COOL.rightInset}
          cy={COOL.cy}
          rx={COOL.rx}
          ry={COOL.ry}
          fill="url(#cool)"
        />
      </Svg>
    </View>
  )
}

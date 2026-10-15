import { LinearGradient } from 'expo-linear-gradient'
import type { ViewProps } from 'react-native'

import { GRADIENT } from '../../lib/design/tokens'

/** 135°, top-left → bottom-right (DESIGN-BRIEF §4.3). */
const START = { x: 0, y: 0 }
const END = { x: 1, y: 1 }

/**
 * The brand gradients, and the only way the app draws one.
 *
 * - `fill` (default): any surface with white text on it — the screen's one
 *   primary action, the hold pill's fill, the Send disc. White is ≥4.5:1 at
 *   every point of it.
 * - `brand`: the mark, large graphics, the centre disc's fill. Never under
 *   text: white on its orange end is 3.50:1.
 *
 * At most one thing per screen wears `fill` (§4.7). A gradient anywhere else
 * — a hand-rolled `LinearGradient` — fails `scripts/check-design-tokens.js`.
 */
export function GradientFill({ gradient = 'fill', ...rest }: ViewProps & { gradient?: keyof typeof GRADIENT }) {
  const { colors, locations } = GRADIENT[gradient]
  return <LinearGradient {...rest} colors={colors} locations={locations} start={START} end={END} />
}

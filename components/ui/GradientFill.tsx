import { LinearGradient } from 'expo-linear-gradient'
import type { ViewProps } from 'react-native'

import { COLOR, GRADIENT } from '../../lib/design/tokens'
import { tint } from '../../lib/theme'

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

/** The scrim's ink at the photo's foot (the EventCard page: 0 → 88%); Increase Contrast adds 20% (§14), to solid. */
export const PHOTO_SCRIM = { foot: 0.88, contrast: 0.2 } as const

/**
 * The ink fade that carries words on a photo (EventCard, TonightCard): clear
 * at its top, `PHOTO_SCRIM.foot` ink at its foot, top → bottom. Never a brand
 * colour, never under anything but text on a photo (DESIGN-BRIEF §4.5: white
 * text over at least 60%). The caller places it (its height is the page's).
 */
export function PhotoScrim({ contrast = false, ...rest }: ViewProps & { contrast?: boolean }) {
  const foot = Math.min(1, PHOTO_SCRIM.foot + (contrast ? PHOTO_SCRIM.contrast : 0))
  return <LinearGradient {...rest} colors={[tint(COLOR.ink, 0), tint(COLOR.ink, foot)]} />
}

/** A photo's head under the status bar (Flow 5 Room info hero: 45% → 0), so the clock reads over any cover. */
export const STATUS_SCRIM = 0.45
export function StatusScrim(props: ViewProps) {
  return <LinearGradient {...props} colors={[tint(COLOR.ink, STATUS_SCRIM), tint(COLOR.ink, 0)]} />
}

/** The page's wash under the hero (fullpages.js: 300 tall, the hero's warm 50% fading to the page ink). */
export const PAGE_WASH = { height: 300, alpha: 0.5 } as const
export function PageWash({ color, ...rest }: ViewProps & { color: string }) {
  return <LinearGradient {...rest} colors={[tint(color, PAGE_WASH.alpha), COLOR.ink]} />
}

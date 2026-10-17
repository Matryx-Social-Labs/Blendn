import { useEffect, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { cancelAnimation, Easing, useAnimatedProps, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated'
import Svg, { ClipPath, Circle, Defs, G, Path } from 'react-native-svg'

import { COLOR } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { tint } from '../../lib/theme'
import { BrandGradient, DiscMark } from './DiscMark'

const AnimatedPath = Animated.createAnimatedComponent(Path)
const AnimatedCircle = Animated.createAnimatedComponent(Circle)

/** The surface wave: one full cycle in about four seconds (Flow 13 pass.js: `Math.PI * 2 / 4`). */
const WAVE_MS = 4000
/** The bubbles rise through the liquid on a slower loop. */
const BUBBLE_MS = 6000
/** Wave height as a share of the disc, and its wavelength; the surface is drawn every `STEP` pt. */
const WAVE_AMPLITUDE = 0.012
const WAVE_LENGTH = 0.9
const STEP = 6
/** The mark's height as a share of the disc, white where it is empty and ink where the liquid is. */
const MARK_SHARE = 0.42
/** Bubbles: x as a share of the disc, radius in pt, and speed as loops per bubble loop. A fixed set, so a render is pure. */
const BUBBLES = [
  { x: 0.18, r: 2.5, speed: 1, from: 0.1 },
  { x: 0.32, r: 1.6, speed: 2, from: 0.55 },
  { x: 0.45, r: 3.2, speed: 1, from: 0.8 },
  { x: 0.56, r: 2, speed: 2, from: 0.3 },
  { x: 0.66, r: 3, speed: 1, from: 0.65 },
  { x: 0.74, r: 1.8, speed: 2, from: 0.05 },
  { x: 0.82, r: 2.6, speed: 1, from: 0.45 },
  { x: 0.26, r: 2.2, speed: 2, from: 0.9 },
  { x: 0.6, r: 1.5, speed: 1, from: 0.2 },
] as const
const BUBBLE_ALPHA = 0.35
const EDGE_ALPHA = 0.16

export type LiquidDiscProps = {
  size: number
  /** 0 empty · 1 full. */
  level: number
  /** Stops the wave and the bubbles (a spent pass); Reduce Motion stops them too. */
  still?: boolean
  /** Over the disc, centred at the foot: the stamp. */
  stamp?: ReactNode
  testID?: string
}

/** The surface as a closed path: a sine at `phase`, rotated nowhere (the tilt is the phone's, not drawn). */
function surface(size: number, level: number, amplitude: number, phase: number) {
  'worklet'
  const y0 = size * (1 - level)
  const length = size * WAVE_LENGTH
  let d = `M${-size} ${y0}`
  for (let x = -size; x <= 2 * size; x += STEP) d += ` L${x} ${y0 + amplitude * Math.sin((x / length) * Math.PI * 2 + phase)}`
  return `${d} L${2 * size} ${2 * size} L${-size} ${2 * size} Z`
}

function Bubble({ size, level, bubble, clock, moving }: { size: number; level: number; bubble: (typeof BUBBLES)[number]; clock: SharedValue<number>; moving: boolean }) {
  const top = size * (1 - level)
  const props = useAnimatedProps(() => {
    // Rises from just under the foot to the surface, then starts again.
    const t = moving ? (clock.get() * bubble.speed + bubble.from) % 1 : bubble.from
    return { cy: size + 4 - t * (size + 4 - top) }
  })
  return <AnimatedCircle cx={size * bubble.x} r={bubble.r} fill={tint(COLOR.textPrimary, BUBBLE_ALPHA)} animatedProps={props} />
}

/**
 * The pass's disc (guidelines/round2/pass.js `liquidDisc`; Flow 13 · 13.2, the
 * "pour"): a ring of `surfaceSunken` with the brand gradient filling it to
 * `level`, the monogram white above the liquid and ink in it, a surface that
 * waves over about four seconds and bubbles that rise. A pass being live is
 * visible at a glance: a screenshot does not move.
 *
 * Reduce Motion (or `still`) stops the wave and the bubbles; the level stays.
 * The tilt that keeps the liquid level (the phone's gyroscope) is not drawn:
 * it needs a motion-sensor module this app does not carry. The disc is
 * decorative and hidden from a screen reader; the stamp over it is not.
 */
export function LiquidDisc({ size, level, still = false, stamp, testID }: LiquidDiscProps) {
  const reduceMotion = useReducedMotion()
  const moving = !still && !reduceMotion && level > 0 && level < 1
  const wave = useSharedValue(0)
  const clock = useSharedValue(0)
  useEffect(() => {
    if (!moving) return
    wave.set(withRepeat(withTiming(Math.PI * 2, { duration: WAVE_MS, easing: Easing.linear }), -1))
    clock.set(withRepeat(withTiming(1, { duration: BUBBLE_MS, easing: Easing.linear }), -1))
    return () => {
      cancelAnimation(wave)
      cancelAnimation(clock)
    }
  }, [moving, wave, clock])

  const r = size / 2
  const amplitude = moving ? size * WAVE_AMPLITUDE : 0
  const liquid = useAnimatedProps(() => ({ d: surface(size, level, amplitude, wave.get()) }))
  const markHeight = size * MARK_SHARE
  const filled = size * level

  return (
    <View testID={testID} style={{ width: size, height: size }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={styles.overflow}>
          <Defs>
            <BrandGradient id="liquid" x1={0} y1={0} x2={size} y2={size} gradientUnits="userSpaceOnUse" />
            <ClipPath id="disc">
              <Circle cx={r} cy={r} r={r} />
            </ClipPath>
          </Defs>
          <G clipPath="url(#disc)">
            <Circle cx={r} cy={r} r={r} fill={COLOR.surfaceSunken} />
            {level > 0 ? <AnimatedPath fill="url(#liquid)" animatedProps={liquid} /> : null}
            {moving ? BUBBLES.map((b) => <Bubble key={b.x} size={size} level={level} bubble={b} clock={clock} moving />) : null}
          </G>
          <Circle cx={r} cy={r} r={r - 0.5} fill="none" stroke={tint(COLOR.textPrimary, EDGE_ALPHA)} strokeWidth={1} />
        </Svg>
        {/* The mark twice: white over the whole disc, ink in the part the liquid fills. */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.centre]}>
          <DiscMark height={markHeight} fill="white" />
        </View>
        {filled > 0 ? (
          <View pointerEvents="none" style={[styles.liquidMark, { height: filled }]}>
            <View style={[styles.centre, styles.inkBox, { width: size, height: size }]}>
              <DiscMark height={markHeight} fill="ink" />
            </View>
          </View>
        ) : null}
      </View>
      {stamp ? <View style={styles.stamp}>{stamp}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  overflow: { overflow: 'visible' },
  centre: { alignItems: 'center', justifyContent: 'center' },
  inkBox: { position: 'absolute', bottom: 0, left: 0 },
  liquidMark: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  stamp: { position: 'absolute', left: 0, right: 0, bottom: 8, alignItems: 'center' },
})

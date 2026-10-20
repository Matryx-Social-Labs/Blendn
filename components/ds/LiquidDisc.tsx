import { useEffect, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import Svg, { ClipPath, Circle, Defs, G, Path } from 'react-native-svg'

import { COLOR, DURATION, SPRING } from '../../lib/design/tokens'
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
/** Under Reduce Motion the level moves, plainly, in this long (the audit: "200 ms linear-ish, no spring"). */
const REDUCED_LEVEL_MS = 200
/** The stamp lands down onto the disc from this scale (a stamp, never scale-from-nothing). */
const STAMP_FROM_SCALE = 1.12
/** The wave and the bubbles fade over this much of the level at each end (empty, full): a full disc is still. */
const ENDS = 1 / 8

export type LiquidDiscProps = {
  size: number
  /** 0 empty · 1 full. A change settles there (M.settle); Reduce Motion moves it over 200 ms. */
  level: number
  /** Stops the wave and the bubbles (a spent pass); Reduce Motion stops them too. */
  still?: boolean
  /** Over the disc, centred at the foot: the stamp. It lands when it mounts. */
  stamp?: ReactNode
  testID?: string
}

/** How alive the surface is at a level: 1 through the middle, fading to 0 at empty and at full. */
function aliveAt(level: number) {
  'worklet'
  return Math.max(0, Math.min(1, level / ENDS, (1 - level) / ENDS))
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

function Bubble({ size, level, bubble, clock }: { size: number; level: SharedValue<number>; bubble: (typeof BUBBLES)[number]; clock: SharedValue<number> }) {
  const props = useAnimatedProps(() => {
    // Rises from just under the foot to the surface (wherever it is now), then starts again; gone with the liquid's ends.
    const l = level.get()
    const t = (clock.get() * bubble.speed + bubble.from) % 1
    return { cy: size + 4 - t * (size + 4 - size * (1 - l)), opacity: aliveAt(l) }
  })
  return <AnimatedCircle cx={size * bubble.x} r={bubble.r} fill={tint(COLOR.textPrimary, BUBBLE_ALPHA)} animatedProps={props} />
}

/**
 * The stamp lands (Flow 13 · 13.2: "stamp · liquid settles to a solid fill"):
 * down onto the disc from 1.12 as it fades in, on M.settle; under Reduce Motion
 * it only fades. Plays when the stamp mounts, which is the render the server's
 * "redeemed" arrives in, the same one that starts the liquid.
 */
export function stampIn(reduceMotion: boolean) {
  return () => {
    'worklet'
    return {
      initialValues: { opacity: 0, transform: [{ scale: reduceMotion ? 1 : STAMP_FROM_SCALE }] },
      animations: {
        opacity: withTiming(1, { duration: reduceMotion ? REDUCED_LEVEL_MS : DURATION.base, reduceMotion: ReduceMotion.Never }),
        transform: [{ scale: reduceMotion ? 1 : withSpring(1, { ...SPRING.settle, reduceMotion: ReduceMotion.Never }) }],
      },
    }
  }
}

/**
 * The pass's disc (guidelines/round2/pass.js `liquidDisc`; Flow 13 · 13.2, the
 * "pour"): a ring of `surfaceSunken` with the brand gradient filling it to
 * `level`, the monogram white above the liquid and ink in it, a surface that
 * waves over about four seconds and bubbles that rise. A pass being live is
 * visible at a glance: a screenshot does not move.
 *
 * The level is a shared value: a new `level` (a pass redeemed) settles the
 * liquid there on M.settle, the surface, the bubbles and the ink mark moving
 * with it on the UI thread; Reduce Motion moves it over 200 ms instead. The
 * wave and the bubbles fade out as it fills, so a full disc is solid. Reduce
 * Motion (or `still`) stops the wave and the bubbles; the level still moves.
 * The tilt that keeps the liquid level (the phone's gyroscope) is not drawn:
 * it needs a motion-sensor module this app does not carry. The disc is
 * decorative and hidden from a screen reader; the stamp over it is not.
 */
export function LiquidDisc({ size, level, still = false, stamp, testID }: LiquidDiscProps) {
  const reduceMotion = useReducedMotion()
  const moving = !still && !reduceMotion
  const wave = useSharedValue(0)
  const clock = useSharedValue(0)
  const lvl = useSharedValue(level)
  useEffect(() => {
    lvl.set(
      reduceMotion
        ? withTiming(level, { duration: REDUCED_LEVEL_MS, easing: Easing.linear, reduceMotion: ReduceMotion.Never })
        : withSpring(level, { ...SPRING.settle, reduceMotion: ReduceMotion.Never })
    )
  }, [level, reduceMotion, lvl])
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
  const amplitude = size * WAVE_AMPLITUDE
  const liquid = useAnimatedProps(() => {
    const l = lvl.get()
    return { d: surface(size, l, moving ? amplitude * aliveAt(l) : 0, wave.get()) }
  })
  // The ink half of the mark: absolute and childless in its clip, so its height is free to animate (no sibling re-lays out).
  const inkClip = useAnimatedStyle(() => ({ height: size * lvl.get() }))
  const markHeight = size * MARK_SHARE

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
            <AnimatedPath fill="url(#liquid)" animatedProps={liquid} />
            {moving ? BUBBLES.map((b) => <Bubble key={b.x} size={size} level={lvl} bubble={b} clock={clock} />) : null}
          </G>
          <Circle cx={r} cy={r} r={r - 0.5} fill="none" stroke={tint(COLOR.textPrimary, EDGE_ALPHA)} strokeWidth={1} />
        </Svg>
        {/* The mark twice: white over the whole disc, ink in the part the liquid fills. */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.centre]}>
          <DiscMark height={markHeight} fill="white" />
        </View>
        <Animated.View pointerEvents="none" style={[styles.liquidMark, inkClip]}>
          <View style={[styles.centre, styles.inkBox, { width: size, height: size }]}>
            <DiscMark height={markHeight} fill="ink" />
          </View>
        </Animated.View>
      </View>
      {stamp ? (
        <Animated.View testID={testID && `${testID}-stamp`} entering={stampIn(reduceMotion)} style={styles.stamp}>
          {stamp}
        </Animated.View>
      ) : null}
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

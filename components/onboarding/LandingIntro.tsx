import { useEffect } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import Animated, { Easing, Extrapolation, interpolate, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated'
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg'

import { BrandGradient, MONOGRAM_ASPECT, MONOGRAM_BOX, MONOGRAM_PATH } from '../ds/DiscMark'
import { Grain } from '../ds/Grain'
import { COLOR } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { assetAspect } from './authForm'

const WORDMARK = require('../../assets/logo/wordmark-white.png')
// Cut from the official lockup, so the letters are the logo's and never live text. Fallback only: the bundler has the ratio.
const WORDMARK_ASPECT = assetAspect(WORDMARK, 476 / 133)
const WORDMARK_HEIGHT = 34

/** The whole opening, once. Everything below is a slice of it, so one value drives the lot and it cannot drift. */
export const INTRO_MS = 2000
/** When the ways in start to rise: the person can act before the last light has settled. */
export const INTRO_DOCK_AT_MS = 1600

export const LIGHT_SIZE = 460
const HEART_SIZE = 320
/** The mark's outline in its own units, measured with getTotalLength: the light's dash runs exactly once round it. */
const MARK_OUTLINE = 1654
const AnimatedPath = Animated.createAnimatedComponent(Path)

// Slices of the opening, in ms, and how far the lights travel. Both come from the prototype the owner chose (direction 1).
const MEET: readonly [number, number] = [0, 820]
const BLOOM: readonly [number, number] = [640, 1270]
const SETTLE: readonly [number, number] = [1270, 1950]
const TRACE: readonly [number, number] = [600, 1200]
const TRACE_OUT: readonly [number, number] = [1270, 1540]
const FILL: readonly [number, number] = [1000, 1420]
const WORD: readonly [number, number] = [1300, 1650]
const LINE: readonly [number, number] = [1420, 1760]
const DOCK: readonly [number, number] = [INTRO_DOCK_AT_MS, 1950]
/** Far enough to start below any screen's foot, whatever the dock's height. */
const DOCK_FROM = 420
const REST_OFFSET = { x: 118, y: 92 }
const FROM_OFFSET = { x: 290, y: 330 }

/** 0 to 1 across a slice of the opening. A worklet: the styles below read it on the UI thread. */
function slice(progress: number, [from, to]: readonly [number, number]): number {
  'worklet'
  return interpolate(progress * INTRO_MS, [from, to], [0, 1], Extrapolation.CLAMP)
}

/** Runs the opening once. Under Reduce Motion it starts at the end, so the resting frame is there with no callback to wait for. */
export function useIntroProgress(): SharedValue<number> {
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(reduceMotion ? 1 : 0)
  useEffect(() => {
    if (reduceMotion) return progress.set(1)
    progress.set(withTiming(1, { duration: INTRO_MS, easing: Easing.linear }))
  }, [progress, reduceMotion])
  return progress
}

/** A light's falloff, centre to edge. Shared with the onboarding steps' lights, which measure their text against it. */
export const LIGHT_STOPS = [
  { offset: 0, alpha: 0.9 },
  { offset: 0.45, alpha: 0.42 },
  { offset: 1, alpha: 0 },
] as const

export function Light({ id, color, size = LIGHT_SIZE }: { id: string; color: string; size?: number }) {
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          {LIGHT_STOPS.map((stop) => (
            <Stop key={stop.offset} offset={stop.offset} stopColor={color} stopOpacity={stop.alpha} />
          ))}
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
    </Svg>
  )
}

/**
 * Two lights, the brand's two ends, drift in from opposite corners and meet behind the mark (owner's pick, 2026-11-01). The heart
 * stays dark so the mark reads as lit from behind rather than sitting on a cloud. L0: untouchable, hidden from a screen reader.
 */
export function IntroLights({ progress, centre }: { progress: SharedValue<number>; centre: { x: number; y: number } }) {
  const placed = (sign: 1 | -1) => ({ left: centre.x - LIGHT_SIZE / 2, top: centre.y - LIGHT_SIZE / 2 - (sign * REST_OFFSET.y) / 2 })
  const ember = useAnimatedStyle(() => {
    const meet = slice(progress.get(), MEET)
    const m = meet * meet * (3 - 2 * meet)
    return {
      opacity: slice(progress.get(), [0, 240]) * (1 - 0.3 * slice(progress.get(), SETTLE)),
      transform: [{ translateX: -REST_OFFSET.x - (FROM_OFFSET.x - REST_OFFSET.x) * (1 - m) }, { translateY: REST_OFFSET.y + (FROM_OFFSET.y - REST_OFFSET.y) * (1 - m) }],
    }
  })
  const violet = useAnimatedStyle(() => {
    const meet = slice(progress.get(), MEET)
    const m = meet * meet * (3 - 2 * meet)
    return {
      opacity: slice(progress.get(), [0, 240]) * (1 - 0.3 * slice(progress.get(), SETTLE)),
      transform: [{ translateX: REST_OFFSET.x + (FROM_OFFSET.x - REST_OFFSET.x) * (1 - m) }, { translateY: -REST_OFFSET.y - (FROM_OFFSET.y - REST_OFFSET.y) * (1 - m) }],
    }
  })
  const heart = useAnimatedStyle(() => ({ opacity: slice(progress.get(), BLOOM) }))
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.light, placed(1), ember]}>
        <Light id="intro-ember" color={COLOR.brandOrange} />
      </Animated.View>
      <Animated.View style={[styles.light, placed(-1), violet]}>
        <Light id="intro-violet" color={COLOR.brandViolet} />
      </Animated.View>
      <Animated.View style={[styles.light, { left: centre.x - HEART_SIZE / 2, top: centre.y - HEART_SIZE / 2 }, heart]}>
        <Light id="intro-heart" color={COLOR.ink} size={HEART_SIZE} />
      </Animated.View>
      <Grain />
    </View>
  )
}

/** The official mark: a thin light traces its outline, then its colour comes up and the light goes. */
export function IntroMark({ progress, height }: { progress: SharedValue<number>; height: number }) {
  const fill = useAnimatedProps(() => ({ opacity: slice(progress.get(), FILL) }))
  const trace = useAnimatedProps(() => {
    const drawn = slice(progress.get(), TRACE)
    return { strokeDashoffset: MARK_OUTLINE * (1 - drawn), opacity: (drawn > 0 ? 1 : 0) * (1 - slice(progress.get(), TRACE_OUT)) }
  })
  return (
    <View testID="landing-mark" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={height * MONOGRAM_ASPECT} height={height} viewBox={`${MONOGRAM_BOX.x} ${MONOGRAM_BOX.y} ${MONOGRAM_BOX.width} ${MONOGRAM_BOX.height}`}>
        <Defs>
          <BrandGradient id="intro-mark" x1={MONOGRAM_BOX.x} y1={MONOGRAM_BOX.y} x2={MONOGRAM_BOX.x + MONOGRAM_BOX.width} y2={MONOGRAM_BOX.y + MONOGRAM_BOX.height} gradientUnits="userSpaceOnUse" />
        </Defs>
        <AnimatedPath d={MONOGRAM_PATH} fill="url(#intro-mark)" fillRule="nonzero" animatedProps={fill} />
        <AnimatedPath
          d={MONOGRAM_PATH}
          fill="none"
          stroke={COLOR.textPrimary}
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${MARK_OUTLINE} ${MARK_OUTLINE}`}
          animatedProps={trace}
        />
      </Svg>
    </View>
  )
}

export function IntroWordmark({ progress }: { progress: SharedValue<number> }) {
  const shown = useAnimatedStyle(() => ({ opacity: slice(progress.get(), WORD) }))
  return (
    <Animated.View testID="landing-wordmark" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={shown}>
      <Image source={WORDMARK} resizeMode="contain" style={{ height: WORDMARK_HEIGHT, width: WORDMARK_HEIGHT * WORDMARK_ASPECT }} />
    </Animated.View>
  )
}

/** The dock comes up from below rather than fading: it is glass, and an empty panel should never wait on screen. */
export function useIntroDock(progress: SharedValue<number>) {
  return useAnimatedStyle(() => {
    const p = slice(progress.get(), DOCK)
    return { transform: [{ translateY: DOCK_FROM * (1 - p) * (1 - p) * (1 - p) }] }
  })
}

/** The tagline's slice, for whoever draws the line: it is the screen's own words, so it stays with the screen. */
export function useIntroLine(progress: SharedValue<number>) {
  return useAnimatedStyle(() => ({ opacity: slice(progress.get(), LINE) }))
}

const styles = StyleSheet.create({
  light: { position: 'absolute' },
})

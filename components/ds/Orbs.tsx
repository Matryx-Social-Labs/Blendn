import { useEffect, useState } from 'react'
import { AppState, Platform, StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg'

import { COLOR, DURATION } from '../../lib/design/tokens'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { useIncreaseContrast } from './shared'

/** `brand`: landing, onboarding, the Blend'n overlay, Recap. `feed`: about half strength, top only, behind a header. `moment`: the L4 moments. */
export type OrbSet = 'brand' | 'feed' | 'moment'
/** Motion #53: early (before 21:00), night (21:00–01:00), late (01:00 until morning). */
export type OrbTime = 'early' | 'night' | 'late'

type Orb = { color: string; alpha: number; cx: number; cy: number; r: number }

/** The board every set is drawn on (assets/orbs-*.svg); it covers the box as CSS `cover` does. */
const BOARD = { width: 402, height: 874 }
/** The early sets' second orb is amber, the warning hue's value (#FFBC5C). */
const AMBER = COLOR.warning
const { brandOrange: ORANGE, brandViolet: VIOLET, brandRose: ROSE, orbOrangeAlpha, orbVioletAlpha, orbRoseAlpha, orbFeedScale } = COLOR

const orb = (color: string, alpha: number, cx: number, cy: number, r: number): Orb => ({ color, alpha, cx, cy, r })
const MOMENT = [orb(ORANGE, orbOrangeAlpha, 80, 140, 180), orb(ROSE, orbRoseAlpha, 330, 700, 160)]

/**
 * The pre-rendered sets, as drawn in assets/orbs-{brand,feed}-{early,night,late}.svg
 * and orbs-moment.svg: two radial orbs each, at the asset's place, radius and
 * centre alpha. Night is the tokens; early and late have no tokens yet, so
 * their alphas are the assets'.
 */
export const ORB_SETS: Record<OrbSet, Record<OrbTime, readonly Orb[]>> = {
  brand: {
    early: [orb(ORANGE, 0.32, 70, 90, 180), orb(AMBER, 0.2, 350, 180, 160)],
    night: [orb(ORANGE, orbOrangeAlpha, 70, 110, 180), orb(VIOLET, orbVioletAlpha, 350, 200, 160)],
    late: [orb(VIOLET, orbVioletAlpha, 90, 140, 180), orb(ROSE, 0.18, 330, 230, 160)],
  },
  feed: {
    early: [orb(ORANGE, 0.16, 60, 20, 170), orb(AMBER, 0.1, 330, 60, 150)],
    night: [orb(ORANGE, orbOrangeAlpha * orbFeedScale, 60, 40, 170), orb(VIOLET, orbVioletAlpha * orbFeedScale, 360, 90, 150)],
    late: [orb(VIOLET, 0.16, 80, 60, 170), orb(ROSE, 0.1, 340, 110, 140)],
  },
  moment: { early: MOMENT, night: MOMENT, late: MOMENT },
}

const NIGHT_FROM = 21
const LATE_FROM = 1
/** The design names no morning edge for "late"; the night is over by six. */
const LATE_UNTIL = 6

/** Which time-of-night set the clock asks for. */
export function orbTime(date: Date): OrbTime {
  const h = date.getHours()
  if (h >= NIGHT_FROM || h < LATE_FROM) return 'night'
  return h < LATE_UNTIL ? 'late' : 'early'
}

/** Each orb's gradient: its alpha at the centre, half at 45%, clear at the edge (the assets' three stops). */
const HALF_AT = 0.45
const HALF = 0.5
/** guidelines/backdrop/grain.html: "Under Increase Contrast, halve the orb alpha." */
const CONTRAST_SCALE = 0.5
/** Motion #22: the orbs travel ±24 pt across and ±16 pt down (8 of the card's 12). */
const DRIFT_Y = 2 / 3

const SINE = Easing.inOut(Easing.sin)

/**
 * Ease-in-out back and forth for ever, one leg per half period. It starts from
 * wherever the orb paused, so a pause and resume never jumps (motion #49).
 *
 * ponytail: a resume always heads for the far end first, so an orb paused on
 * its way back turns round; on a 14 s leg nobody sees it.
 */
function drift(p: SharedValue<number>, leg: number) {
  p.set(withSequence(withTiming(1, { duration: (1 - p.get()) * leg, easing: SINE }), withRepeat(withTiming(0, { duration: leg, easing: SINE }), -1, true)))
}

/** Foreground or not, and the time-of-night set the clock asked for at launch or the last foreground (#53: never live). */
function useForeground() {
  const [state, setState] = useState(() => ({ active: AppState.currentState !== 'background', time: orbTime(new Date()) }))
  useEffect(() => {
    const sub = AppState.addEventListener('change', (status) =>
      setState((prev) => {
        const active = status === 'active'
        const time = active ? orbTime(new Date()) : prev.time
        return prev.active === active && prev.time === time ? prev : { active, time }
      })
    )
    return () => sub.remove()
  }, [])
  return state
}

/**
 * The set on screen, and the one it is crossfading from: the new one fades
 * in as the old one fades out, over `long` (iOS only, never under Reduce
 * Motion); then the old one, at 0, goes.
 */
function useCrossfade(time: OrbTime, fade: boolean) {
  const [shown, setShown] = useState<{ now: OrbTime; before: OrbTime | null }>({ now: time, before: null })
  // The previous set, remembered during render (React's "storing information from previous renders").
  if (shown.now !== time) setShown({ now: time, before: fade ? shown.now : null })
  const incoming = useSharedValue(1)
  useEffect(() => {
    if (!shown.before) return
    incoming.set(0)
    incoming.set(withTiming(1, { duration: DURATION.long }))
    const timer = setTimeout(() => setShown((s) => ({ ...s, before: null })), DURATION.long)
    return () => clearTimeout(timer)
  }, [shown.before, incoming])
  const nowStyle = useAnimatedStyle(() => ({ opacity: incoming.get() }))
  const beforeStyle = useAnimatedStyle(() => ({ opacity: 1 - incoming.get() }))
  return { ...shown, nowStyle, beforeStyle }
}

export type OrbsProps = {
  set: OrbSet
  /** Pin a time-of-night set; by default the clock's, read at launch and on each foreground. */
  time?: OrbTime
  /** Hold the drift: the keyboard is up, the list is scrolling under glass, a chat is open, the screen is not focused. */
  paused?: boolean
  testID?: string
}

/**
 * L0, the backdrop (DESIGN-BRIEF §4, guidelines/backdrop/orbs.html): two huge
 * feathered orbs behind everything, never behind the disc or a primary button.
 * Every frame must also work without them. Fills its parent; put `<Grain>`
 * over it.
 *
 * Motion #22: the slow ambient drift, one of the three loops the app allows —
 * transform only, ±24 pt and 0.96–1.04, periods 28 s and 36 s (incommensurate,
 * so the pattern never visibly repeats). Still on Android, under Reduce Motion,
 * in the background and while `paused`. Increase Contrast halves the alpha.
 * Motion #53: the time-of-night set swaps at launch or on a foreground that
 * crosses 21:00 or 01:00, crossfading over `long` on iOS (instant on Android
 * and under Reduce Motion); never while the app is in front.
 *
 * Decorative and untouchable. No haptic.
 *
 * ponytail: Low Power Mode is not read (no installed module reports it); the
 * screen can pass `paused` once one is.
 */
export function Orbs({ set, time: pinned, paused = false, testID }: OrbsProps) {
  const android = Platform.OS === 'android'
  const reduceMotion = useReducedMotion()
  const contrast = useIncreaseContrast()
  const { active, time: clock } = useForeground()
  const [box, setBox] = useState<{ width: number; height: number } | null>(null)
  const shown = useCrossfade(set === 'moment' ? 'night' : (pinned ?? clock), !android && !reduceMotion)

  const a = useSharedValue(HALF)
  const b = useSharedValue(HALF)
  const still = android || reduceMotion || paused || !active
  useEffect(() => {
    if (still) return
    drift(a, DURATION.ambientA / 2)
    drift(b, DURATION.ambientB / 2)
    return () => {
      cancelAnimation(a)
      cancelAnimation(b)
    }
  }, [still, a, b])

  const tokens = motionTokens(reduceMotion).orbs
  const styleA = useDrift(a, 1, tokens)
  const styleB = useDrift(b, -1, tokens)

  const layer = (time: OrbTime, current: boolean) =>
    box ? (
      <Animated.View
        key={time}
        testID={testID && `${testID}-${time}`}
        style={[StyleSheet.absoluteFill, current ? shown.nowStyle : shown.beforeStyle]}
      >
        {ORB_SETS[set][time].map((o, i) => (
          <OrbView key={i} orb={o} box={box} alpha={o.alpha * (contrast ? CONTRAST_SCALE : 1)} style={i ? styleB : styleA} testID={current && testID ? `${testID}-${i}` : undefined} />
        ))}
      </Animated.View>
    ) : null

  return (
    <View
      testID={testID}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      style={[StyleSheet.absoluteFill, styles.clip]}
    >
      {shown.before ? layer(shown.before, false) : null}
      {layer(shown.now, true)}
    </View>
  )
}

/** Progress 0–1 → the drift; 0.5 is the orb at rest. `sign` sends the second orb the other way. */
function useDrift(p: SharedValue<number>, sign: 1 | -1, o: { drift: number; scaleMin: number; scaleMax: number }) {
  return useAnimatedStyle(() => {
    const k = sign * (2 * p.get() - 1)
    return {
      transform: [{ translateX: k * o.drift }, { translateY: -k * o.drift * DRIFT_Y }, { scale: o.scaleMin + ((o.scaleMax - o.scaleMin) * (k + 1)) / 2 }],
    }
  })
}

function OrbView({ orb: o, box, alpha, style, testID }: { orb: Orb; box: { width: number; height: number }; alpha: number; style: object; testID?: string }) {
  const s = Math.max(box.width / BOARD.width, box.height / BOARD.height)
  const size = 2 * o.r * s
  const place = {
    position: 'absolute' as const,
    left: (box.width - BOARD.width * s) / 2 + (o.cx - o.r) * s,
    top: (box.height - BOARD.height * s) / 2 + (o.cy - o.r) * s,
    width: size,
    height: size,
  }
  return (
    <Animated.View testID={testID} style={[place, style]}>
      <Svg width={size} height={size} viewBox="0 0 2 2">
        <Defs>
          <RadialGradient id="orb" cx="50%" cy="50%" r="50%">
            <Stop offset={0} stopColor={o.color} stopOpacity={1} />
            <Stop offset={HALF_AT} stopColor={o.color} stopOpacity={HALF} />
            <Stop offset={1} stopColor={o.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle testID={testID && `${testID}-circle`} cx={1} cy={1} r={1} fill="url(#orb)" opacity={alpha} />
      </Svg>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  /** The board covers the box and the orbs reach past it; Android does not clip by default. */
  clip: { overflow: 'hidden' },
})

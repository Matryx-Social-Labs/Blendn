import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { COLOR, DURATION, FONT_FAMILY, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { GradientFill } from '../ui/GradientFill'
import { fade, MomentStage, spring, useBeats } from './MomentStage'
import { font, useBoldText } from './shared'

/*
 * Motion card #9 (guidelines/motion/09-check-in-success-the-pour.html,
 * defs-a.js `defs[9]`). Values with no token are named here, once.
 */
/** #9: the panel's top, under the overlay's top bar (no SPACE step is 40). */
export const PANEL_TOP = 40
/** #9: "You're in." fades in from here, over `DURATION.base`. */
export const YOURE_IN_AT = 200
/** #9: the orbs lift once, `sin(πp)` over this long, to this peak. */
export const ORBS_LIFT_MS = 600
const ORBS_PEAK = 0.6
/** A rect in the stage's frame: the docked pass the pour fills (Flow 4 delta R2-D1, "success"). */
export type PourFrame = { x: number; y: number; width: number; height: number }

/** #9: Tonight crossfades to the Room here, over `DURATION.base`. */
export const ROOM_AT = 700
/** #9: "You're in." is 900 28/32, −0.8: no TYPE role is (`moment` is 44/48). */
const YOURE_IN_TYPE = {
  fontFamily: FONT_FAMILY.brand[900],
  // design-exception: motion #9 sets "You're in." at 28/32, between the heading and moment roles
  fontSize: 28,
  // design-exception: motion #9, with the size above
  lineHeight: 32,
  letterSpacing: -0.8,
} as const

/**
 * The pour (motion #9, DESIGN-BRIEF §9.3 #9): the check-in succeeded. On the
 * server's OK, `H.success` once (the check-in plays none of its own). The
 * pass is a panel inset under the top bar and above the home indicator, the
 * venue at its top left; the brand fill floods up through it on `M.settle`
 * (a fill is an effect: no bounce), contained in the panel; "You're in." fades
 * in at its bottom left at 200 ms; the orbs lift once.
 *
 * At 700 ms it hands off: `onDone`, and it crossfades away over `D.base` while
 * the caller's Room crossfades in. `ready={false}` holds it, filled, until the
 * Room is there to hand off to, so it never clears onto Tonight. A tap skips
 * to the hand-off, ready or not. Drawn in place, not in a Modal: mount it over
 * Tonight; it lets every touch through once it has handed off.
 *
 * Reduce Motion: the panel crossfades to filled with "You're in." in 200 ms;
 * the same hand-off at 700 ms, over 200 ms; the same haptic.
 */
export function MomentPour({
  venue,
  onDone,
  ready = true,
  frame,
  testID,
}: {
  venue: string
  onDone: () => void
  ready?: boolean
  /**
   * Where the pass is. The Tonight door passes its docked pass, so the flood
   * fills exactly it (Flow 4); without one (the event screen has no pass) the
   * panel is #9's own, inset under the top bar and over the home indicator.
   */
  frame?: PourFrame
  testID?: string
}) {
  const reduceMotion = useReducedMotion()
  const bold = useBoldText()
  const insets = useSafeAreaInsets()
  const { height: screenHeight } = useWindowDimensions()
  const { duration } = motionTokens(reduceMotion)

  const scrim = useSharedValue(0)
  const lift = useSharedValue(0)
  const orbs = useDerivedValue(() => Math.sin(lift.get() * Math.PI) * ORBS_PEAK)
  // Off the panel until it has measured itself.
  const panelHeight = useSharedValue(frame?.height ?? screenHeight)
  const flood = useSharedValue(reduceMotion ? 1 : 0)
  const floodOpacity = useSharedValue(reduceMotion ? 0 : 1)
  const text = useSharedValue(0)
  const shown = useSharedValue(1)
  const [timeUp, setTimeUp] = useState(false)
  const [done, setDone] = useState(false)
  const latestOnDone = useRef(onDone)
  useEffect(() => {
    latestOnDone.current = onDone
  })

  useEffect(() => {
    if (reduceMotion) {
      floodOpacity.set(fade(1, duration.base))
      text.set(fade(1, duration.base))
      return
    }
    flood.set(spring(1, 'settle'))
    lift.set(fade(1, ORBS_LIFT_MS))
    text.set(fade(1, DURATION.base, YOURE_IN_AT))
    // Once, as it appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handedOff = useRef(false)
  const handOff = () => {
    if (handedOff.current) return
    handedOff.current = true
    shown.set(fade(0, duration.base))
    setDone(true)
    latestOnDone.current()
  }
  useEffect(() => {
    if (timeUp && ready) handOff()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp, ready])

  const skipBeats = useBeats([
    { at: 0, run: () => H.success({ important: true }) },
    { at: ROOM_AT, run: () => setTimeUp(true) },
  ])
  const skip = () => {
    flood.set(1)
    floodOpacity.set(1)
    lift.set(1)
    text.set(1)
    skipBeats()
    handOff()
  }

  const stageStyle = useAnimatedStyle(() => ({ opacity: shown.get() }))
  const floodStyle = useAnimatedStyle(() => ({ opacity: floodOpacity.get(), transform: [{ translateY: (1 - flood.get()) * panelHeight.get() }] }))
  const textStyle = useAnimatedStyle(() => ({ opacity: text.get() }))

  return (
    <MomentStage testID={testID} modal={false} done={done} label={`You’re in. ${venue}.`} scrimAlpha={0} scrim={scrim} orbs="moment" orbsOpacity={orbs} onSkip={skip}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, stageStyle]}>
        <View
          testID={testID && `${testID}-panel`}
          onLayout={(e) => panelHeight.set(e.nativeEvent.layout.height)}
          style={[
            styles.panel,
            frame
              ? { left: frame.x, top: frame.y, width: frame.width, height: frame.height }
              : { left: SPACE.md, right: SPACE.md, top: insets.top + PANEL_TOP, bottom: insets.bottom + SPACE.xl },
          ]}
        >
          <Animated.View testID={testID && `${testID}-flood`} style={[StyleSheet.absoluteFill, floodStyle]}>
            <GradientFill gradient="fill" style={StyleSheet.absoluteFill} />
          </Animated.View>
          <Text testID={testID && `${testID}-venue`} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.heading} style={[font('heading', bold), styles.venue]}>
            {venue}
          </Text>
          <Animated.Text testID={testID && `${testID}-youre-in`} maxFontSizeMultiplier={MAX_FONT_SCALE.moment} style={[YOURE_IN_TYPE, styles.youreIn, textStyle]}>
            You’re in.
          </Animated.Text>
        </View>
      </Animated.View>
    </MomentStage>
  )
}

const styles = StyleSheet.create({
  /** The pass: radius 24, the surface; the flood stays inside it. #9's own is inset 12 at the sides. */
  panel: { position: 'absolute', borderRadius: RADIUS.sheet, backgroundColor: COLOR.surface, overflow: 'hidden' },
  /** #9: top left, 16 in. White on the surface and on the fill alike. */
  venue: { position: 'absolute', left: SPACE.lg, right: SPACE.lg, top: SPACE.lg, color: COLOR.textOnGradient },
  /** #9: bottom left, 16 in and 24 up. */
  youreIn: { position: 'absolute', left: SPACE.lg, right: SPACE.lg, bottom: SPACE.xl, color: COLOR.textOnGradient },
})

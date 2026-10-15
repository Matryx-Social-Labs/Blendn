import { useEffect, useState } from 'react'
import { StyleSheet, Text, useWindowDimensions } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSequence } from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Mask, Rect, Stop } from 'react-native-svg'

import { COLOR, DURATION, MAX_FONT_SCALE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { BrandGradient } from './DiscMark'
import { fade, MomentStage, spring, useBeats } from './MomentStage'
import { font, useBoldText } from './shared'

/** journey/moments.js `flood`: the top edge feathers from clear to full over 180 pt. */
const FEATHER = 180
/** "You're in." sits at 40% of the height, on the flood. */
const HEADLINE_AT = '40%'
/** #9: the orbs lift once (~600 ms: up 300, back 300) to half; "You're in." at 300; the Room takes over at ~700; the flood clears from 760. */
const ORBS_PEAK = 0.5
const ORBS_HALF_MS = 300
const TEXT_AT = 300
const ROOM_AT = 700
const CLEAR_AT = 760

/**
 * The pour (guidelines/components/MomentPour.html, DESIGN-BRIEF §9.3 #9): the
 * check-in succeeded, and the gradient floods up through the screen under
 * "You're in." on `M.settle` (a fill is an effect: no bounce) while the orbs
 * lift once. At 700 ms `onDone`: crossfade Tonight to the Room under it then.
 * The flood clears itself by ~920 ms and lets every touch through from 700,
 * so it can stay mounted until the overlay changes.
 *
 * Drawn in place, not in a Modal: mount it over Tonight, inside the overlay.
 * A tap skips to the Room. `H.success` (important) on the server's answer,
 * which is the moment it mounts: the check-in plays none of its own. The
 * hold's `H.commit` is the hold's.
 *
 * Reduce Motion: a 200 ms crossfade to the filled state and away; same haptic,
 * same hand-off.
 */
export function MomentPour({ venue, onDone, testID }: { venue: string; onDone: () => void; testID?: string }) {
  const reduceMotion = useReducedMotion()
  const bold = useBoldText()
  const { height: screenHeight } = useWindowDimensions()
  const { duration } = motionTokens(reduceMotion)

  const scrim = useSharedValue(0)
  const orbs = useSharedValue(0)
  const height = useSharedValue(screenHeight)
  const flood = useSharedValue(reduceMotion ? 1 : 0)
  const shown = useSharedValue(reduceMotion ? 0 : 1)
  const text = useSharedValue(reduceMotion ? 1 : 0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (reduceMotion) {
      shown.set(withSequence(fade(1, duration.base), fade(0, duration.base, ROOM_AT - duration.base)))
      return
    }
    flood.set(spring(1, 'settle'))
    orbs.set(withSequence(fade(ORBS_PEAK, ORBS_HALF_MS), fade(0, ORBS_HALF_MS)))
    text.set(fade(1, DURATION.base, TEXT_AT))
    shown.set(fade(0, DURATION.quick, CLEAR_AT, 'exit'))
    // Once, as it appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const skipBeats = useBeats([
    { at: 0, run: () => H.success({ important: true }) },
    {
      at: ROOM_AT,
      run: () => {
        setDone(true)
        onDone()
      },
    },
  ])
  const skip = () => {
    flood.set(1)
    orbs.set(0)
    text.set(1)
    shown.set(fade(0, DURATION.quick, 0, 'exit'))
    skipBeats()
  }

  const floodStyle = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ translateY: (1 - flood.get()) * height.get() }] }))
  const textStyle = useAnimatedStyle(() => ({ opacity: text.get() }))

  return (
    <MomentStage testID={testID} modal={false} done={done} label={`You’re in. ${venue}.`} scrimAlpha={0} scrim={scrim} orbs="moment" orbsOpacity={orbs} onSkip={skip}>
      <Animated.View
        pointerEvents="none"
        onLayout={(e) => height.set(e.nativeEvent.layout.height)}
        style={[StyleSheet.absoluteFill, floodStyle]}
      >
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Defs>
            <BrandGradient id="fill" gradient="fill" x1="0" y1="0" x2="1" y2="1" />
            <LinearGradient id="feather" x1="0" y1="0" x2="0" y2={FEATHER} gradientUnits="userSpaceOnUse">
              <Stop offset={0} stopColor={COLOR.textPrimary} stopOpacity={0} />
              <Stop offset={1} stopColor={COLOR.textPrimary} stopOpacity={1} />
            </LinearGradient>
            <Mask id="edge" x="0" y="0" width="100%" height="100%">
              <Rect width="100%" height="100%" fill="url(#feather)" />
            </Mask>
          </Defs>
          <Rect testID={testID && `${testID}-flood`} width="100%" height="100%" fill="url(#fill)" mask="url(#edge)" />
        </Svg>
        <Animated.View style={[styles.headline, textStyle]}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.moment} style={[font('moment', bold), styles.onFill]}>
            You’re in.
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.onFill]}>
            {venue}
          </Text>
        </Animated.View>
      </Animated.View>
    </MomentStage>
  )
}

const styles = StyleSheet.create({
  headline: { position: 'absolute', top: HEADLINE_AT, left: SPACE.gutter, right: SPACE.gutter, alignItems: 'center', gap: SPACE.xs },
  /** White on the `fill` gradient: ≥ 4.5:1 at every point of it. */
  onFill: { color: COLOR.textOnGradient, textAlign: 'center' },
})

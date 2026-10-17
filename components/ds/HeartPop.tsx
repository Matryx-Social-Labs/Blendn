import { useEffect } from 'react'
import { StyleSheet } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated'

import { Icon } from '../ui/Icon'
import { COLOR, DURATION, EASING, SPRING } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'

/** #15: from 0.4, held 260 ms at full size before it fades. */
const FROM = 0.4
const HOLD_MS = 260
/** #15 under Reduce Motion: fade 180, hold 300, fade 180. */
const RM_FADE_MS = 180
const RM_HOLD_MS = 300

/**
 * The like's heart over a face (motion #15, SCREENS Flow 4 Room: "an outlined
 * heart, scaled, in brand orange"): it pops 0.4 → 1 on `M.pop`, holds 260 ms
 * and fades over `quick`. Bump `trigger` to play it; 0 draws nothing. The
 * haptic (`H.like`) is the gesture's. Reduce Motion: fade 180, hold 300,
 * fade 180, in place. Decorative.
 */
export function HeartPop({ trigger, size, testID }: { trigger: number; size: number; testID?: string }) {
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(FROM)
  const opacity = useSharedValue(0)

  useEffect(() => {
    if (trigger === 0) return
    const out = { duration: reduceMotion ? RM_FADE_MS : DURATION.quick, easing: Easing.bezier(...EASING.exit) }
    if (reduceMotion) {
      scale.set(1)
      opacity.set(withSequence(withTiming(1, { duration: RM_FADE_MS }), withDelay(RM_HOLD_MS, withTiming(0, out))))
      return
    }
    scale.set(FROM)
    scale.set(withSpring(1, SPRING.pop))
    opacity.set(withSequence(withTiming(1, { duration: DURATION.press }), withDelay(HOLD_MS, withTiming(0, out))))
  }, [trigger, reduceMotion, scale, opacity])

  const style = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ scale: scale.get() }] }))
  if (trigger === 0) return null
  return (
    <Animated.View
      testID={testID}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.centre, style]}
    >
      <Icon name="heart" size={size} color={COLOR.brandOrange} />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
})

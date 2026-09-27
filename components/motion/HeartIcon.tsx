import { Ionicons } from '@expo/vector-icons'
import { useEffect, useRef } from 'react'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1)

/**
 * A heart that swells once when it fills.
 *
 * Saving an event is occasional and the icon swap alone is small — 18–20pt,
 * outline to solid. The swell says "that registered" on the frame it happens,
 * next to the haptic the handler already fires. Timed 1 → 1.2 → 1 (120 +
 * 180ms), not sprung: a tap carries no momentum to overshoot with.
 *
 * Only on filling. Un-saving is not an achievement, and a heart that pops on
 * the way out reads as a second save. Never on first paint either — a list of
 * saved cards would all pop as they mount.
 *
 * Reduce Motion: the icon just swaps.
 */
export function HeartIcon({
  on,
  size,
  onColor,
  offColor,
}: {
  on: boolean
  size: number
  onColor: string
  offColor: string
}) {
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)
  const was = useRef(on)

  useEffect(() => {
    const filled = on && !was.current
    was.current = on
    if (!filled || reduceMotion) return
    scale.set(
      withSequence(
        withTiming(1.2, { duration: 120, easing: EASE_OUT }),
        withTiming(1, { duration: 180, easing: EASE_IN_OUT })
      )
    )
  }, [on, reduceMotion, scale])

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }))

  return (
    <Animated.View style={style}>
      <Ionicons name={on ? 'heart' : 'heart-outline'} size={size} color={on ? onColor : offColor} />
    </Animated.View>
  )
}

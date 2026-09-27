import { Ionicons } from '@expo/vector-icons'
import React, { useEffect } from 'react'
import { StyleSheet } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

import { EMBER } from '../../lib/theme'

/**
 * A heart that pops over a face when you like it, then goes.
 *
 * Instagram's double-tap heart, kept small and flat: it springs up from 0.4
 * (never from 0 — a thing growing out of nothing reads as a glitch) with a
 * little overshoot, holds a beat, then shrinks and fades. It is the *receipt*
 * for a gesture that otherwise has no visible target — you tapped a face, not
 * a button.
 *
 * `trigger` is a counter: each increment plays it once. 0 never plays, so a
 * fresh mount is silent.
 *
 * Reduce Motion: a 180ms fade in and out, no scale.
 */
export function HeartPop({ trigger, size }: { trigger: number; size: number }) {
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(0.4)
  const opacity = useSharedValue(0)

  useEffect(() => {
    if (trigger === 0) return
    if (reduceMotion) {
      scale.set(1)
      opacity.set(withSequence(withTiming(1, { duration: 180 }), withDelay(300, withTiming(0, { duration: 180 }))))
      return
    }
    scale.set(0.4)
    scale.set(
      withSequence(
        withSpring(1, { damping: 9, stiffness: 320, mass: 0.6 }),
        withDelay(260, withTiming(0.6, { duration: 180 }))
      )
    )
    opacity.set(withSequence(withTiming(1, { duration: 90 }), withDelay(380, withTiming(0, { duration: 180 }))))
  }, [trigger, reduceMotion, scale, opacity])

  const style = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ scale: scale.get() }],
  }))

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.centre, style]} pointerEvents="none">
      <Ionicons name="heart" size={size} color={EMBER.accent} />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
})

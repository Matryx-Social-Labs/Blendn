import React, { useEffect } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import Animated, {
  Easing,
  useReducedMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { EASING, RISE } from '../../lib/design/tokens'
import { motionTokens } from '../../lib/motion'

type FadeInUpProps = {
  children: React.ReactNode
  delay?: number
  distance?: number
  duration?: number
  /** Bezier control points; defaults to `EASING.entrance`. */
  easing?: readonly [number, number, number, number]
  style?: StyleProp<ViewStyle>
}

export default function FadeInUp({
  children,
  delay = 0,
  distance = RISE.list,
  duration,
  easing = EASING.entrance,
  style,
}: FadeInUpProps) {
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(0)
  // DS #16 / #1: a rise of RISE.list on base. Reduce Motion is opacity only (no rise), over its own 200: a fade, not a cut.
  const rise = reduceMotion ? 0 : distance
  const ms = duration ?? motionTokens(reduceMotion).duration.base

  useEffect(() => {
    progress.set(
      withDelay(
        Math.max(0, delay),
        withTiming(1, {
          duration: ms,
          easing: Easing.bezier(...easing),
        })
      )
    )
  }, [delay, ms, easing, progress])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: rise * (1 - progress.get()) }],
  }))

  return <Animated.View style={[{ opacity: 0 }, style, animatedStyle]}>{children}</Animated.View>
}

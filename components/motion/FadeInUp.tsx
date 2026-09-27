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
import { MOTION_DURATION, MOTION_EASING } from '../../lib/motion'

type FadeInUpProps = {
  children: React.ReactNode
  delay?: number
  distance?: number
  duration?: number
  style?: StyleProp<ViewStyle>
}

export default function FadeInUp({
  children,
  delay = 0,
  distance = 10,
  duration = MOTION_DURATION.normal,
  style,
}: FadeInUpProps) {
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(0)

  useEffect(() => {
    if (reduceMotion) {
      progress.set(1)
      return
    }
    progress.set(
      withDelay(
        Math.max(0, delay),
        withTiming(1, {
          duration,
          easing: Easing.bezier(...MOTION_EASING.entrance),
        })
      )
    )
  }, [delay, duration, progress, reduceMotion])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: distance * (1 - progress.get()) }],
  }))

  return <Animated.View style={[{ opacity: reduceMotion ? 1 : 0 }, style, animatedStyle]}>{children}</Animated.View>
}

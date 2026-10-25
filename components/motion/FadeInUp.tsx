import React, { useEffect, useState } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { EASING, RISE } from '../../lib/design/tokens'
import { motionTokens, useReducedMotion } from '../../lib/motion'

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
  const [settled, setSettled] = useState(false)
  // DS #16 / #1: a rise of RISE.list on base. Reduce Motion is opacity only (no rise), over its own 200: a fade, not a cut.
  const rise = reduceMotion ? 0 : distance
  const ms = duration ?? motionTokens(reduceMotion).duration.base

  useEffect(() => {
    progress.set(
      withDelay(
        Math.max(0, delay),
        withTiming(
          1,
          {
            duration: ms,
            easing: Easing.bezier(...easing),
          },
          (finished) => {
            'worklet'
            if (finished) scheduleOnRN(setSettled, true)
          }
        )
      )
    )
  }, [delay, ms, easing, progress])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: rise * (1 - progress.get()) }],
  }))

  /*
   * At rest the wrapper drops the animated style, so React's own props say "drawn" (r7 H1: the iOS Scene's tiles and byline
   * stayed invisible behind a 330 pt band). Until then React's props hold the start, opacity 0, and the end lives only in
   * Reanimated's native registry. Reanimated 4 hands a settled value back to React from a 500 ms interval and erases it,
   * unsent, once it is two seconds old (`getSettledUpdates`); miss that window and the next React commit of the view (the
   * fetch landing, a tap on Going) writes opacity 0 back. Settling here, on the animation's own end, needs no window.
   */
  return <Animated.View style={settled ? style : [{ opacity: 0 }, style, animatedStyle]}>{children}</Animated.View>
}

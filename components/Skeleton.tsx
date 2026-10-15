import React, { useEffect } from 'react'
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'

import { EMBER, EMBER_RADIUS } from '../lib/theme'

type SkeletonProps = {
  width?: number | string
  height?: number
  borderRadius?: number
  style?: StyleProp<ViewStyle>
}

/*
 * One clock for every skeleton on screen.
 *
 * Each instance used to run its own pulse *and* its own shimmer, so a loading
 * screen of twelve blocks was twenty-four loops mounting a few frames apart and
 * drifting out of step — the page shimmered unevenly instead of reading as one
 * "loading" state. Now the first skeleton to mount starts a single native loop,
 * every other one binds to the same value, and the last to unmount stops it.
 *
 * The shimmer bar is gone: a 72pt band that only ever travelled 240pt never
 * crossed a full-width block, and a pulse alone says "loading" just as well.
 */
const PULSE_LOW = 0.6
const pulse = new Animated.Value(PULSE_LOW)
let pulseUsers = 0
let pulseLoop: Animated.CompositeAnimation | null = null

function useSharedPulse(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    pulseUsers += 1
    if (pulseUsers === 1) {
      const step = (toValue: number) =>
        Animated.timing(pulse, { toValue, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true })
      pulseLoop = Animated.loop(Animated.sequence([step(1), step(PULSE_LOW)]))
      pulseLoop.start()
    }
    return () => {
      pulseUsers -= 1
      if (pulseUsers === 0) {
        pulseLoop?.stop()
        pulseLoop = null
        pulse.setValue(PULSE_LOW)
      }
    }
  }, [enabled])
}

export const Skeleton: React.FC<SkeletonProps> = ({ width = '100%', height = 12, borderRadius = EMBER_RADIUS.sm, style }) => {
  // Reduce Motion: a still block at the pulse's resting opacity.
  const reduceMotion = useReducedMotion()
  useSharedPulse(!reduceMotion)

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          opacity: reduceMotion ? PULSE_LOW : pulse,
          backgroundColor: EMBER.skeleton,
        } as any,
        style,
      ]}
    />
  )
}

export const SkeletonLine: React.FC<Pick<SkeletonProps, 'width' | 'style'>> = ({ width = '100%', style }) => (
  <Skeleton width={width} height={12} borderRadius={EMBER_RADIUS.pill} style={style} />
)

export const SkeletonCircle: React.FC<Pick<SkeletonProps, 'width' | 'style'>> = ({ width = 40, style }) => (
  <Skeleton width={width} height={Number(width)} borderRadius={EMBER_RADIUS.pill} style={style} />
)

export const SkeletonBlock = Skeleton


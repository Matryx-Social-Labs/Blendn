import { useEffect } from 'react'
import { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'

import { EASING, SPRING } from '../../lib/design/tokens'
import { motionTokens, useReducedMotion } from '../../lib/motion'

/** Motion #1: the landing's lockup starts a little small (0.96) and settles to full size. */
export const LOCKUP_FROM_SCALE = 0.96

/**
 * An entrance that settles (Flow 1 prototype): it fades in on `base` and grows from `from` (the lockup's 0.96, the envelope's
 * 0.8) to 1 on `M.settle`. Reduce Motion is the fade alone, on its own 200 ms. Once, at mount.
 */
export function useSettleIn(from: number = LOCKUP_FROM_SCALE) {
  const reduceMotion = useReducedMotion()
  const shown = useSharedValue(0)
  const scale = useSharedValue(reduceMotion ? 1 : from)
  useEffect(() => {
    shown.set(withTiming(1, { duration: motionTokens(reduceMotion).duration.base, easing: Easing.bezier(...EASING.entrance) }))
    if (!reduceMotion) scale.set(withSpring(1, SPRING.settle))
    // Once, as it appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ scale: scale.get() }] }))
}

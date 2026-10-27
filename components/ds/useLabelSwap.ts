import { useEffect, useState } from 'react'
import { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

import { EASING } from '../../lib/design/tokens'
import { motionTokens, useReducedMotion } from '../../lib/motion'

/**
 * The async primary's label swap (motion #45): when a button's words change ("Make the crew" to "Continue", "Join" to
 * "Joined"), the old label exits up `rise.list` over `quick`, then the new one enters over `base`. Reduce Motion: no rise,
 * the two crossfade. `shown` is what the label draws; read the new `label` at once for anything that is spoken.
 *
 * `swapped` turns on with the first change: the width follows on `SPRING.settle` from then on (a `layout` on the button),
 * and not before, so a button that never changes its words never carries a layout animation, in a list or out of it.
 */
export function useLabelSwap(label: string, enabled = true) {
  const reduceMotion = useReducedMotion()
  const { duration, rise } = motionTokens(reduceMotion)
  const [shown, setShown] = useState(label)
  const [swapped, setSwapped] = useState(false)
  const lift = useSharedValue(0)
  const fade = useSharedValue(1)

  useEffect(() => {
    if (!enabled || label === shown) {
      // Back to the words that never left: undo a half-played exit.
      fade.set(1)
      lift.set(0)
      return
    }
    fade.set(withTiming(0, { duration: duration.quick, easing: Easing.bezier(...EASING.exit) }))
    lift.set(withTiming(-rise.list, { duration: duration.quick, easing: Easing.bezier(...EASING.exit) }))
    const timer = setTimeout(() => {
      setShown(label)
      setSwapped(true)
      lift.set(0)
      fade.set(withTiming(1, { duration: duration.base, easing: Easing.bezier(...EASING.entrance) }))
    }, duration.quick)
    return () => clearTimeout(timer)
  }, [label, shown, enabled, duration.quick, duration.base, rise.list, fade, lift])

  const style = useAnimatedStyle(() => ({ opacity: fade.get(), transform: [{ translateY: lift.get() }] }))
  return { shown: enabled ? shown : label, swapped: swapped && !reduceMotion, style }
}

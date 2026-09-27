import * as Haptics from 'expo-haptics'
import React, { useCallback, useState } from 'react'
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { cubicBezier, useReducedMotion } from 'react-native-reanimated'

type ScalePressProps = PressableProps & {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  pressedScale?: number
  haptic?: boolean
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/** Strong ease-out: the shrink lands on the frame the finger does. */
const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1)

/** A finger drifting this far off the control mid-press still counts. */
const RETENTION = { top: 16, bottom: 16, left: 16, right: 16 }

/**
 * Press feedback for anything tappable: it shrinks under the finger.
 *
 * Feedback on press-in, not on release. Waiting for the tap to complete
 * before anything moves is the dead-button latency people actually feel.
 * `scale` takes the label and icons with it, which is what reads as physical.
 *
 * A two-state change, so it's a CSS transition on the UI thread (120ms,
 * ease-out), not a spring on a shared value. There's no gesture to carry
 * velocity, so a spring would add nothing but overshoot. Releasing mid-shrink
 * retargets from wherever the scale is.
 *
 * Reduce Motion: no scale. The haptic and the press itself still happen.
 */
export default function ScalePress({
  children,
  style,
  onPressIn,
  onPressOut,
  pressedScale = 0.97,
  haptic = true,
  pressRetentionOffset = RETENTION,
  ...rest
}: ScalePressProps) {
  const reduceMotion = useReducedMotion()
  const [pressed, setPressed] = useState(false)

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      setPressed(true)
      if (haptic) {
        Haptics.selectionAsync().catch(() => {})
      }
      onPressIn?.(event)
    },
    [haptic, onPressIn]
  )

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      setPressed(false)
      onPressOut?.(event)
    },
    [onPressOut]
  )

  return (
    <AnimatedPressable
      {...rest}
      pressRetentionOffset={pressRetentionOffset}
      style={[
        style,
        {
          transform: [{ scale: pressed && !reduceMotion ? pressedScale : 1 }],
          transitionProperty: 'transform',
          transitionDuration: 120,
          transitionTimingFunction: EASE_OUT,
        },
      ]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      {children}
    </AnimatedPressable>
  )
}

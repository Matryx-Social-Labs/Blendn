import React, { useCallback } from 'react'
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'

import { notePressed } from '../../lib/focusReturn'
import { PRESS, SPRING } from '../../lib/motion'

type ScalePressProps = PressableProps & {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  /** `PRESS.scale` (0.97) by default; the centre disc uses `PRESS.scaleDisc`. */
  pressedScale?: number
  /**
   * A haptic from the vocabulary to play on press-in — `H.primary` on the
   * screen's one primary, `H.disc` on the centre disc. None by default: most
   * taps are silent (DESIGN-BRIEF §10.1 rule 5). `false` reads the same.
   */
  haptic?: false | (() => void)
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/** `M.press`, run even under Reduce Motion: the squash is feedback, not decoration. */
const PRESS_SPRING = { ...SPRING.press, reduceMotion: ReduceMotion.Never }

/** A finger drifting this far off the control mid-press still counts. */
const RETENTION = { top: 16, bottom: 16, left: 16, right: 16 }

/**
 * Press feedback for anything tappable: it shrinks under the finger.
 *
 * Feedback on press-in, not on release. Waiting for the tap to complete
 * before anything moves is the dead-button latency people actually feel.
 * `scale` takes the label and icons with it, which is what reads as physical,
 * and never opacity: a dim would fade any glass inside (§5.2 rule 6).
 *
 * The scale is a shared value on `M.press` (critically damped, no overshoot),
 * so the animation runs on the UI thread and a press re-renders nothing.
 * Releasing mid-shrink retargets from wherever the scale is.
 *
 * Reduce Motion keeps the squash: it is a 3% answer to a finger, not a
 * transition.
 */
export default function ScalePress({
  children,
  style,
  onPress,
  onPressIn,
  onPressOut,
  pressedScale = PRESS.scale,
  haptic,
  pressRetentionOffset = RETENTION,
  ...rest
}: ScalePressProps) {
  const scale = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }))

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      scale.set(withSpring(pressedScale, PRESS_SPRING))
      if (haptic) haptic()
      onPressIn?.(event)
    },
    [scale, pressedScale, haptic, onPressIn]
  )

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      scale.set(withSpring(1, PRESS_SPRING))
      onPressOut?.(event)
    },
    [scale, onPressOut]
  )

  // Noted as the opener of whatever this press opens, so an overlay can hand focus back to it (lib/focusReturn).
  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      notePressed(event?.currentTarget)
      onPress?.(event)
    },
    [onPress]
  )

  return (
    <AnimatedPressable
      {...rest}
      onPress={onPress ? handlePress : undefined}
      pressRetentionOffset={pressRetentionOffset}
      style={[style, animatedStyle]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      {children}
    </AnimatedPressable>
  )
}

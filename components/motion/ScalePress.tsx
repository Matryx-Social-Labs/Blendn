import * as Haptics from 'expo-haptics'
import React, { useCallback } from 'react'
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { MOTION_SPRING } from '../../lib/motion'

type ScalePressProps = PressableProps & {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  pressedScale?: number
  haptic?: boolean
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export default function ScalePress({
  children,
  style,
  onPressIn,
  onPressOut,
  pressedScale = 0.97,
  haptic = true,
  ...rest
}: ScalePressProps) {
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)

  const handlePressIn: PressableProps['onPressIn'] = useCallback(
    (event: GestureResponderEvent) => {
      if (!reduceMotion) {
        scale.value = withSpring(pressedScale, MOTION_SPRING.snappy)
      }
      if (haptic) {
        Haptics.selectionAsync().catch(() => {})
      }
      onPressIn?.(event)
    },
    [haptic, onPressIn, pressedScale, reduceMotion, scale]
  )

  const handlePressOut: PressableProps['onPressOut'] = useCallback(
    (event: GestureResponderEvent) => {
      if (!reduceMotion) {
        scale.value = withSpring(1, MOTION_SPRING.gentle)
      }
      onPressOut?.(event)
    },
    [onPressOut, reduceMotion, scale]
  )

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : scale.value }],
  }))

  return (
    <AnimatedPressable
      {...rest}
      style={[style, animatedStyle]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      {children}
    </AnimatedPressable>
  )
}

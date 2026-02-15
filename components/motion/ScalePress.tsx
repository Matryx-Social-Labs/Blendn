import React, { useCallback } from 'react'
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
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
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export default function ScalePress({
  children,
  style,
  onPressIn,
  onPressOut,
  pressedScale = 0.97,
  ...rest
}: ScalePressProps) {
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)

  const handlePressIn: PressableProps['onPressIn'] = useCallback(
    (event) => {
      if (!reduceMotion) {
        scale.value = withSpring(pressedScale, MOTION_SPRING.snappy)
      }
      onPressIn?.(event)
    },
    [onPressIn, pressedScale, reduceMotion, scale]
  )

  const handlePressOut: PressableProps['onPressOut'] = useCallback(
    (event) => {
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

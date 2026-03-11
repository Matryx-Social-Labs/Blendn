import React, { useEffect, useRef } from 'react'
import { Animated, StyleProp, StyleSheet, ViewStyle } from 'react-native'

type SkeletonProps = {
  width?: number | string
  height?: number
  borderRadius?: number
  style?: StyleProp<ViewStyle>
  color?: string
}

export const Skeleton: React.FC<SkeletonProps> = ({ width = '100%', height = 12, borderRadius = 8, style, color }) => {
  const opacity = useRef(new Animated.Value(0.6)).current
  const shimmer = useRef(new Animated.Value(-1)).current

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.6, duration: 800, useNativeDriver: true })
      ])
    )
    const shimmerLoop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1100,
        useNativeDriver: true,
      })
    )
    pulseLoop.start()
    shimmerLoop.start()
    return () => {
      pulseLoop.stop()
      shimmerLoop.stop()
    }
  }, [opacity, shimmer])

  const shimmerTranslate = shimmer.interpolate({
    inputRange: [-1, 1],
    outputRange: [-80, 240],
  })

  return (
    <Animated.View
      style={[
        styles.base,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { width, height, borderRadius, opacity, backgroundColor: color || 'rgba(255,255,255,0.12)' } as any,
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.shimmer,
          {
            transform: [{ translateX: shimmerTranslate }],
            opacity: 0.42,
          },
        ]}
      />
    </Animated.View>
  )
}

export const SkeletonLine: React.FC<Pick<SkeletonProps, 'width' | 'style' | 'color'>> = ({ width = '100%', style, color }) => (
  <Skeleton width={width} height={12} borderRadius={6} style={style} color={color} />
)

export const SkeletonCircle: React.FC<Pick<SkeletonProps, 'width' | 'style' | 'color'>> = ({ width = 40, style, color }) => (
  <Skeleton width={width} height={Number(width)} borderRadius={999} style={style} color={color} />
)

export const SkeletonBlock: React.FC<SkeletonProps> = (props) => (
  <Skeleton {...props} />
)

const styles = StyleSheet.create({
  base: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 72,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
})

export default Skeleton


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

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.6, duration: 800, useNativeDriver: true })
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [opacity])

  return (
    <Animated.View
      style={[
        styles.base,
        { width, height, borderRadius, opacity, backgroundColor: color || 'rgba(255,255,255,0.12)' },
        style,
      ]}
    />
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
    backgroundColor: 'rgba(255,255,255,0.12)'
  }
})

export default Skeleton



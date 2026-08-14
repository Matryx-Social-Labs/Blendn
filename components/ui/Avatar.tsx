import React from 'react'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { OptimizedImage } from '../OptimizedImage'
import { APP_COLORS } from '../../lib/theme'

interface AvatarProps {
  source: string | undefined
  size?: number
  ringColor?: string
  ringWidth?: number
  statusDot?: boolean
  statusColor?: string
  style?: StyleProp<ViewStyle>
}

// Circular avatar with optional accent ring (e.g. chat header, profile hero) and
// optional bottom-right presence status dot (matches Figma's online indicator).
export default function Avatar({
  source,
  size = 40,
  ringColor,
  ringWidth = 2,
  statusDot = false,
  statusColor = APP_COLORS.accent,
  style,
}: AvatarProps) {
  const dotSize = Math.max(10, Math.round(size * 0.3))

  return (
    <View style={[{ width: size, height: size }, style]}>
      <View
        style={[
          styles.imageWrap,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: ringColor ? ringWidth : 0,
            borderColor: ringColor,
          },
        ]}
      >
        <OptimizedImage
          source={source || ''}
          style={{ width: '100%', height: '100%', borderRadius: size / 2 }}
          contentFit="cover"
        />
      </View>
      {statusDot ? (
        <View
          style={[
            styles.dot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: statusColor,
              borderColor: APP_COLORS.backgroundBase,
            },
          ]}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  imageWrap: {
    overflow: 'hidden',
    backgroundColor: APP_COLORS.backgroundCard,
  },
  dot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    borderWidth: 2,
  },
})

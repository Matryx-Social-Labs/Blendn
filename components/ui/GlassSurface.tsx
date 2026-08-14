import React from 'react'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'
import { APP_COLORS, APP_RADIUS } from '../../lib/theme'

interface GlassSurfaceProps {
  children?: React.ReactNode
  style?: StyleProp<ViewStyle>
  /** expo-blur intensity, 0-100. Figma's panels range from a light 10px blur (chips) to a heavy 20px blur (nav bars). */
  intensity?: number
  /** Translucent tint layered over the blur, e.g. 'rgba(15,14,14,0.8)'. */
  tint?: string
  borderRadius?: number
  bordered?: boolean
}

// "Liquid Glass" panel: BlurView + translucent tint + hairline border, matching
// Figma's recurring backdrop-blur surfaces (headers, footers, chips, overlay cards).
export default function GlassSurface({
  children,
  style,
  intensity = 20,
  tint = 'rgba(33,31,31,0.6)',
  borderRadius = APP_RADIUS.lg,
  bordered = true,
}: GlassSurfaceProps) {
  return (
    <View style={[styles.container, { borderRadius }, style]}>
      <BlurView
        intensity={intensity}
        tint="dark"
        style={[
          StyleSheet.absoluteFill,
          { borderRadius, backgroundColor: tint },
          bordered && styles.border,
        ]}
      />
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  border: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
  },
})

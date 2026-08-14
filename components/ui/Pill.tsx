import React from 'react'
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import { APP_COLORS, APP_CTA, APP_RADIUS, APP_SPACING } from '../../lib/theme'

export type PillVariant = 'glass' | 'gradient'

interface PillProps {
  label: string
  variant?: PillVariant
  style?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
}

// Chip/tag used for interests, filters, and status labels. `glass` matches Figma's
// translucent blurred pill (default/unselected); `gradient` matches the active/selected state.
export default function Pill({ label, variant = 'glass', style, textStyle }: PillProps) {
  if (variant === 'gradient') {
    return (
      <LinearGradient
        colors={APP_CTA.primary.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.pill, style]}
      >
        <Text style={[styles.text, { color: APP_CTA.primary.text }, textStyle]}>{label}</Text>
      </LinearGradient>
    )
  }

  return (
    <View style={[styles.pill, styles.glassContainer, style]}>
      <BlurView intensity={10} tint="dark" style={StyleSheet.absoluteFill} />
      <Text style={[styles.text, styles.glassText, textStyle]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: APP_RADIUS.pill,
    paddingHorizontal: APP_SPACING.md,
    paddingVertical: APP_SPACING.xxs + 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glassContainer: {
    backgroundColor: 'rgba(45,44,44,0.4)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(73,71,71,0.4)',
  },
  text: {
    fontSize: 14,
    fontWeight: '700',
  },
  glassText: {
    color: APP_COLORS.textPrimary,
    fontWeight: '400',
  },
})

import React from 'react'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Typography from '../Typography'
import { APP_COLORS, APP_SPACING } from '../../lib/theme'

interface SectionHeaderProps {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  iconColor?: string
  style?: StyleProp<ViewStyle>
}

// Icon + tracked uppercase heading pairing used across bento-grid section cards
// (e.g. "ABOUT", "INTERESTS", "CIRCLE PRESENCE").
export default function SectionHeader({ icon, title, iconColor = APP_COLORS.accent, style }: SectionHeaderProps) {
  return (
    <View style={[styles.row, style]}>
      <Ionicons name={icon} size={20} color={iconColor} />
      <Typography variant="h3" style={styles.title}>
        {title}
      </Typography>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: APP_SPACING.sm,
  },
  title: {
    color: APP_COLORS.textPrimary,
  },
})

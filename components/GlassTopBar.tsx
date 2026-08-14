import { Ionicons } from '@expo/vector-icons'
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native'
import GlassSurface from './ui/GlassSurface'
import { APP_COLORS, APP_FONTS } from '../lib/theme'

const HIT_SLOP = { top: 8, right: 8, bottom: 8, left: 8 }

interface GlassTopBarProps {
  onMenuPress?: () => void
  onBellPress?: () => void
  /** Wordmark font size — Pulse uses 16, Grid uses 24 per Figma. */
  wordmarkSize?: number
  topInset?: number
  style?: StyleProp<ViewStyle>
}

export default function GlassTopBar({
  onMenuPress,
  onBellPress,
  wordmarkSize = 16,
  topInset = 0,
  style,
}: GlassTopBarProps) {
  return (
    <GlassSurface intensity={20} tint="rgba(15,14,14,0.8)" borderRadius={0} bordered={false} style={style}>
      <View style={[styles.row, { paddingTop: topInset + 8 }]} accessibilityRole="header">
        <View style={styles.left}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Open menu"
            hitSlop={HIT_SLOP}
            onPress={onMenuPress}
          >
            <Ionicons name="menu" size={22} color={APP_COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.wordmark, { fontSize: wordmarkSize }]}>Blend&apos;n</Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Notifications"
          accessibilityRole="button"
          hitSlop={HIT_SLOP}
          onPress={onBellPress}
        >
          <Ionicons name="notifications-outline" size={22} color={APP_COLORS.textPrimary} />
        </TouchableOpacity>
      </View>
    </GlassSurface>
  )
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  wordmark: {
    fontFamily: APP_FONTS.heading,
    color: APP_COLORS.accent,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
})

import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { StyleSheet, View } from 'react-native'

import ScalePress from '../motion/ScalePress'
import { Text } from '../ui/Text'
import { CONTROL, EMBER, EMBER_RADIUS, ICON, SPACE } from '../../lib/theme'

/**
 * "Requests (3)": the way to people waiting on an answer from you.
 *
 * On the Me tab and at the top of Friends. Before it, the only place a request
 * showed was Add friends — a screen you open to send your link, not to check
 * for answers — so a request could sit unseen for as long as nobody went there.
 * Drawn only when there is at least one; the count is a badge per the design
 * system (`textPrimary` fill, `bg` text), not the accent.
 */
export function RequestsRow({ count }: { count: number }) {
  const label = `${count} friend request${count === 1 ? '' : 's'}`
  return (
    <ScalePress
      onPress={() => router.push('/friends/requests')}
      haptic={false}
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens your friend requests"
      style={styles.row}
    >
      <Ionicons name="person-add-outline" size={ICON.md} color={EMBER.textPrimary} />
      <Text variant="bodyStrong" style={styles.label} maxFontSizeMultiplier={1.4}>Friend requests</Text>
      <View style={styles.badge}>
        <Text variant="caption" color={EMBER.bg} maxFontSizeMultiplier={1.2}>{count > 99 ? '99+' : count}</Text>
      </View>
      <Ionicons name="chevron-forward" size={ICON.sm} color={EMBER.textSecondary} />
    </ScalePress>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    minHeight: CONTROL.lg,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surfaceSunken,
  },
  label: { flex: 1 },
  badge: {
    minWidth: CONTROL.badge,
    height: CONTROL.badge,
    paddingHorizontal: SPACE.xs,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

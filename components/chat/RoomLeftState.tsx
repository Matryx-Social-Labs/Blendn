import { Ionicons } from '@expo/vector-icons'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

import { CONTROL, EMBER, EMBER_RADIUS, SPACE, TYPE } from '../../lib/theme'
import ScalePress from '../motion/ScalePress'

/**
 * The room, for somebody who is not in it.
 *
 * `left` is a leave you made yourself (the server's `LEFT_ROOM`, or one made
 * on this phone), and says so. `out` is the server's plain "not a member",
 * which it also answers for a leave made on another phone — so it offers the
 * rejoin too, and says what else might get you in.
 *
 * It replaces the feed and the composer rather than sitting over them: the
 * history is not yours to read any more, and a composer would invite a message
 * the server will refuse.
 *
 * Rejoin is the accent: with the composer gone, it is this state's one action.
 */
export function RoomLeftState({
  kind,
  rejoining,
  onRejoin,
}: {
  kind: 'left' | 'out'
  rejoining: boolean
  onRejoin: () => void
}) {
  return (
    <View style={styles.root}>
      <View style={styles.glyph}>
        {/* design-exception: the empty-state glyph tile's 36pt illustration size */}
        <Ionicons name="exit-outline" size={36} color={EMBER.textTertiary} />
      </View>
      <Text style={styles.title} maxFontSizeMultiplier={1.4} accessibilityRole="header">
        {kind === 'left' ? 'You left this room' : "You're not in this room"}
      </Text>
      <Text style={styles.body} maxFontSizeMultiplier={1.4}>
        {kind === 'left'
          ? "You won't get its messages or notifications. Rejoin to read and post again, or check in at the event."
          : 'If you left it, you can rejoin. Otherwise, check in at the event to join its room.'}
      </Text>
      <ScalePress
        style={styles.cta}
        onPress={onRejoin}
        disabled={rejoining}
        pressedScale={0.97}
        accessibilityRole="button"
        accessibilityLabel="Rejoin"
        accessibilityState={{ busy: rejoining, disabled: rejoining }}
      >
        {rejoining ? (
          <ActivityIndicator color={EMBER.onGradient} />
        ) : (
          <Text style={styles.ctaText}>Rejoin</Text>
        )}
      </ScalePress>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.xxl, gap: SPACE.sm },
  // The glyph tile every empty and failed state in the app uses (ChatLoadFailed).
  glyph: {
    width: 80,
    height: 80,
    borderRadius: EMBER_RADIUS.lg,
    backgroundColor: EMBER.surface,
    borderWidth: 1,
    borderColor: EMBER.separator,
    marginBottom: SPACE.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...TYPE.title, textAlign: 'center' },
  body: { ...TYPE.body, color: EMBER.textSecondary, textAlign: 'center' },
  cta: {
    marginTop: SPACE.sm,
    backgroundColor: EMBER.accent,
    borderRadius: EMBER_RADIUS.pill,
    height: CONTROL.md,
    minWidth: CONTROL.lg * 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.xl,
  },
  ctaText: { ...TYPE.button, color: EMBER.onGradient },
})

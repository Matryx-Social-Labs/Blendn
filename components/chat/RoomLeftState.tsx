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
 * `not_live` is a place's room after your Go Live ended (the server's
 * `NOT_LIVE`, or `live:ended`): the room is for the people live there, so the
 * way back is going live again at the place, not a rejoin.
 *
 * Rejoin is the accent: with the composer gone, it is this state's one action.
 */
const COPY = {
  left: {
    title: 'You left this room',
    body: "You won't get its messages or notifications. Rejoin to read and post again, or check in at the event.",
    cta: 'Rejoin',
  },
  out: {
    title: "You're not in this room",
    body: 'If you left it, you can rejoin. Otherwise, check in at the event to join its room.',
    cta: 'Rejoin',
  },
  not_live: {
    title: "You're not live here any more",
    body: "Today's room is for the people live at this place. Go live there again to rejoin it.",
    cta: 'Go live again',
  },
} as const

export function RoomLeftState({
  kind,
  rejoining,
  onRejoin,
}: {
  kind: keyof typeof COPY
  rejoining: boolean
  onRejoin: () => void
}) {
  const copy = COPY[kind]
  return (
    <View style={styles.root}>
      <View style={styles.glyph}>
        {/* design-exception: the empty-state glyph tile's 36pt illustration size */}
        <Ionicons name="exit-outline" size={36} color={EMBER.textTertiary} />
      </View>
      <Text style={styles.title} maxFontSizeMultiplier={1.4} accessibilityRole="header">
        {copy.title}
      </Text>
      <Text style={styles.body} maxFontSizeMultiplier={1.4}>
        {copy.body}
      </Text>
      <ScalePress
        style={styles.cta}
        onPress={onRejoin}
        disabled={rejoining}
        pressedScale={0.97}
        accessibilityRole="button"
        accessibilityLabel={copy.cta}
        accessibilityState={{ busy: rejoining, disabled: rejoining }}
      >
        {rejoining ? (
          <ActivityIndicator color={EMBER.onGradient} />
        ) : (
          <Text style={styles.ctaText}>{copy.cta}</Text>
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

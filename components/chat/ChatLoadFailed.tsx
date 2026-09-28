import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'

import { CONTROL, EMBER, EMBER_RADIUS, SPACE, TYPE } from '../../lib/theme'
import ScalePress from '../motion/ScalePress'

/**
 * The thread did not load — said as that, with a way to try again.
 *
 * Both chat screens used to fall through to their empty state when history
 * failed to load, so a network error read "Start the conversation! Say hi" over
 * a thread that might hold a month of messages — an invitation to talk into a
 * conversation the screen had simply failed to fetch.
 *
 * Try again is `surface`, not the accent: the composer's send stays the
 * screen's one accent, the same reason the empty state's button is neutral.
 */
export function ChatLoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <View style={styles.root}>
      <View style={styles.glyph}>
        {/* design-exception: the empty-state glyph tile's 36pt illustration size */}
        <Ionicons name="cloud-offline-outline" size={36} color={EMBER.textTertiary} />
      </View>
      <Text style={styles.title} maxFontSizeMultiplier={1.4}>
        Couldn&apos;t load {what}
      </Text>
      <Text style={styles.body} maxFontSizeMultiplier={1.4}>
        Check your connection and try again.
      </Text>
      <ScalePress style={styles.cta} onPress={onRetry} pressedScale={0.97} accessibilityRole="button">
        <Text style={styles.ctaText}>Try again</Text>
      </ScalePress>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', paddingHorizontal: SPACE.xxl, paddingTop: SPACE.xxxl, gap: SPACE.sm },
  // The glyph tile every empty and failed state in the app uses.
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
    backgroundColor: EMBER.surface,
    borderRadius: EMBER_RADIUS.pill,
    height: CONTROL.md,
    justifyContent: 'center',
    paddingHorizontal: SPACE.xl,
  },
  ctaText: { ...TYPE.button, color: EMBER.textPrimary },
})

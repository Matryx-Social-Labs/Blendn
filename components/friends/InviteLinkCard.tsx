import { Ionicons } from '@expo/vector-icons'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { Text } from '../ui/Text'
import { EMBER, EMBER_RADIUS, ICON, SPACE } from '../../lib/theme'

/**
 * Your invite link, shown as what it is: a link.
 *
 * Shown in full rather than hidden behind the Share button, so it is plain
 * what is being handed out — and that it is the only way anybody can reach
 * you, since there is no search. Sharing goes through the OS sheet, which
 * already offers Copy, Messages, WhatsApp, Instagram and the rest.
 */
export function InviteLinkCard({ url, failed }: { url?: string | null; failed?: boolean }) {
  return (
    <View style={styles.card}>
      <Ionicons name="link" size={ICON.md} color={EMBER.textSecondary} />
      {url ? (
        <Text variant="bodyStrong" style={styles.url} numberOfLines={2} selectable maxFontSizeMultiplier={1.3}>
          {url.replace(/^https:\/\//, '')}
        </Text>
      ) : failed ? (
        <Text variant="body" color={EMBER.textSecondary} style={styles.url}>
          Your link didn&apos;t load. Check your connection and try again.
        </Text>
      ) : (
        <ActivityIndicator color={EMBER.textSecondary} accessibilityLabel="Loading your link" />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    padding: SPACE.lg,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surfaceSunken,
  },
  url: { flex: 1 },
})

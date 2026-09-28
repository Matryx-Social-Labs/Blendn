import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, View } from 'react-native'

import { EmberButton } from './onboarding/EmberControls'
import { Text } from './ui/Text'
import { EMBER, ICON, SPACE } from '../lib/theme'

/**
 * Something didn't load: what, and "Try again".
 *
 * For a request that failed, never for a thing that is gone (`lib/loadFailure`
 * tells them apart). It says nothing about the thing itself, because nothing is
 * known about it yet — only that the phone couldn't reach it. "Try again" is
 * this state's one primary action, so it takes the accent.
 */
export function LoadError({
  title,
  message = 'Check your connection and try again.',
  onRetry,
  retrying,
}: {
  title: string
  message?: string
  onRetry: () => void
  retrying?: boolean
}) {
  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      <Ionicons name="cloud-offline-outline" size={ICON.lg} color={EMBER.textTertiary} />
      <Text variant="title" style={styles.center} accessibilityRole="header">{title}</Text>
      <Text variant="body" color={EMBER.textSecondary} style={styles.center}>{message}</Text>
      <View style={styles.action}>
        <EmberButton label="Try again" onPress={onRetry} busy={retrying} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignSelf: 'stretch', alignItems: 'center', gap: SPACE.lg },
  center: { textAlign: 'center' },
  action: { alignSelf: 'stretch' },
})

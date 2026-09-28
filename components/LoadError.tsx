import { Ionicons } from '@expo/vector-icons'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import ScalePress from './motion/ScalePress'
import { Text } from './ui/Text'
import { CONTROL, EMBER, EMBER_RADIUS, SPACE } from '../lib/theme'

/** The glyph tile's box: every empty and failed state in the app draws this one. */
const TILE = 80

/**
 * An empty or failed state: an 80pt glyph tile on `surface`, a title, a line,
 * and at most one action.
 *
 * One component, because four screens had drawn four of them — the Banter's
 * `InboxLoadFailed` (a tile on `surfaceSunken`, "Retry" in the accent), the
 * chats' `ChatLoadFailed` (a tile on `surface`, "Try again" in grey), this
 * file's bare icon over a full-width button, and the Me tab's red sentence over
 * a "Retry" pill. Same fact, four looks.
 *
 * The action is the state's one primary action (docs/DESIGN_SYSTEM.md: "the
 * empty or error state's single action is the primary action of that state"),
 * so it takes the accent — a `CONTROL.md` pill, as wide as its words.
 */
export function LoadState({
  icon,
  title,
  message,
  action,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  title: string
  message?: string
  action?: { label: string; onPress: () => void; busy?: boolean; accessibilityHint?: string }
}) {
  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      <View style={styles.tile}>
        {/* design-exception: the glyph tile's 36pt illustration, sized to the 80pt tile */}
        <Ionicons name={icon} size={36} color={EMBER.textTertiary} />
      </View>
      <Text variant="title" style={styles.center} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
        {title}
      </Text>
      {message ? (
        <Text variant="body" color={EMBER.textSecondary} style={styles.center} maxFontSizeMultiplier={1.4}>
          {message}
        </Text>
      ) : null}
      {action ? (
        <ScalePress
          onPress={action.onPress}
          disabled={action.busy}
          haptic={false}
          pressedScale={0.97}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityHint={action.accessibilityHint}
          accessibilityState={{ busy: !!action.busy }}
          style={styles.action}
        >
          {action.busy ? (
            <ActivityIndicator color={EMBER.onGradient} />
          ) : (
            // `onGradient`, not white — white fails contrast on the accent fill.
            <Text variant="button" color={EMBER.onGradient} maxFontSizeMultiplier={1.3} numberOfLines={1}>
              {action.label}
            </Text>
          )}
        </ScalePress>
      ) : null}
    </View>
  )
}

/**
 * Something didn't load: what, and "Try again".
 *
 * For a request that failed, never for a thing that is gone (`lib/loadFailure`
 * tells them apart). It says nothing about the thing itself, because nothing is
 * known about it yet — only that the phone couldn't reach it.
 */
export function LoadError({
  title,
  message = 'Check your connection and try again.',
  onRetry,
  retrying,
  icon = 'cloud-offline-outline',
}: {
  title: string
  message?: string
  onRetry: () => void
  retrying?: boolean
  icon?: React.ComponentProps<typeof Ionicons>['name']
}) {
  return <LoadState icon={icon} title={title} message={message} action={{ label: 'Try again', onPress: onRetry, busy: retrying }} />
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.xxxl,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: EMBER_RADIUS.lg,
    backgroundColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.sm,
  },
  center: { textAlign: 'center' },
  action: {
    marginTop: SPACE.sm,
    minWidth: CONTROL.lg * 2,
    height: CONTROL.md,
    paddingHorizontal: SPACE.xl,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

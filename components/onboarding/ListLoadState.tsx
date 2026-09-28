import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { EMBER, SPACE, TYPE } from '../../lib/theme'

export type ListStatus = 'loading' | 'error' | 'ready'

/**
 * What a server-fed picker shows before it has chips to show.
 *
 * The interest and work-field pickers rendered nothing until the server
 * answered, and nothing for ever when it did not: a section missing without
 * a word, on a screen whose Continue still worked. Now the wait is a spinner
 * and a failure says what did not load, with Try again. Inline rather than a
 * toast, because it belongs to the section that is missing.
 */
export function ListLoadState({
  status,
  what,
  onRetry,
}: {
  status: Exclude<ListStatus, 'ready'>
  /** "interests", "fields of work". */
  what: string
  onRetry: () => void
}) {
  if (status === 'loading') {
    return (
      <View style={styles.row} accessibilityLabel={`Loading ${what}`}>
        <ActivityIndicator color={EMBER.textSecondary} />
      </View>
    )
  }
  return (
    <View style={styles.row}>
      <Text style={styles.message} accessibilityRole="alert">
        Couldn&apos;t load the {what}.
      </Text>
      <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={8}>
        <Text style={styles.action}>TRY AGAIN</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: SPACE.xxl },
  message: { ...TYPE.meta, color: EMBER.textSecondary, flexShrink: 1 },
  // A text action (DESIGN_SYSTEM.md): `label` in `textPrimary`, not the accent,
  // which on these screens belongs to Continue.
  action: { ...TYPE.label, color: EMBER.textPrimary },
})

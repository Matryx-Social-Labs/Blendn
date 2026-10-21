import { StyleSheet, Text, View } from 'react-native'

import { Button } from '../ds/Button'
import { Spinner } from '../ds/Loader'
import { font, useBoldText } from '../ds/shared'
import { COLOR, SPACE } from '../../lib/design/tokens'

export type ListStatus = 'loading' | 'error' | 'ready'

/**
 * What a server-fed picker shows before it has chips to show (Flow 2 journey 03 · 04, details 03 · 04).
 *
 * The interest and work-field pickers rendered nothing until the server answered, and nothing for ever when it did not: a
 * section missing without a word, on a screen whose Continue still worked. Now the wait is the design's spinner and a line
 * that says what it is waiting for, and a failure says what did not load, with Try again. Inline rather than a toast,
 * because it belongs to the section that is missing.
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
  const bold = useBoldText()
  if (status === 'loading') {
    return (
      <View testID="list-loading" style={styles.row} accessibilityRole="progressbar" accessibilityLabel={`Loading ${what}`} accessibilityState={{ busy: true }}>
        <Spinner size={18} />
        <Text style={[font('meta', bold), styles.muted]}>{`Loading ${what}`}</Text>
      </View>
    )
  }
  return (
    <View style={styles.row}>
      <Text accessibilityRole="alert" style={[font('meta', bold), styles.message]}>{`Couldn’t load the ${what}.`}</Text>
      <Button label="Try again" kind="tertiary" size="sm" onPress={onRetry} />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md },
  muted: { color: COLOR.textSecondary, flex: 1 },
  message: { color: COLOR.textPrimary, flex: 1 },
})

import { StyleSheet, View } from 'react-native'

import { Button } from '../ds/Button'
import { Spinner } from '../ds/Loader'
import { SPACE } from '../../lib/design/tokens'

/**
 * The end of a list that pages (SCRUM-760): the DS spinner while the next page is on its way, and when it did not come, the
 * DS tertiary button that asks again. Nothing when there is nothing to say. Shared by the Banter, the Board and Room info.
 */
export function PageFooter({
  loading,
  failed,
  onRetry,
  what,
  testID,
}: {
  loading: boolean
  failed: boolean
  onRetry: () => void
  /** What is being loaded, for the reader: "chats", "posts", "people". */
  what: string
  testID?: string
}) {
  if (loading) {
    return (
      <View accessible accessibilityRole="progressbar" accessibilityLabel={`Loading more ${what}`} style={styles.footer}>
        <Spinner size={20} />
      </View>
    )
  }
  if (!failed) return null
  return (
    <View style={styles.footer}>
      <Button
        kind="tertiary"
        size="sm"
        label="Couldn’t load more · Try again"
        accessibilityLabel={`Couldn’t load more ${what}. Try again`}
        onPress={onRetry}
        testID={testID}
      />
    </View>
  )
}

const styles = StyleSheet.create({ footer: { alignItems: 'center', paddingVertical: SPACE.lg } })

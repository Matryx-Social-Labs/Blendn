import { StyleSheet, Text, View } from 'react-native'

import { COLOR, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { Button } from '../ds/Button'
import { Spinner } from '../ds/Loader'
import { font, useBoldText } from '../ds/shared'

/** The foot of a list that is read a page at a time: nothing when idle. The same two states every paged people list has. */
export const PAGED_FOOTER_HEIGHT = 64

/**
 * What stands under the last row while the next page is on its way, or when it did not come. A failed page keeps every
 * row above it and says so, with Try again: it is never drawn as the end of the list. Loading is a still spinner, not a
 * skeleton: the rows above are already real.
 */
export function PagedFooter({ loading, failed, onRetry, testID }: { loading: boolean; failed: boolean; onRetry: () => void; testID?: string }) {
  const bold = useBoldText()
  if (!loading && !failed) return null
  return (
    <View testID={testID} style={styles.foot}>
      {loading ? (
        <View accessible accessibilityLabel="Loading more" accessibilityState={{ busy: true }}>
          <Spinner size={20} />
        </View>
      ) : (
        <View style={styles.failed}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>Couldn’t load more.</Text>
          <Button kind="secondary" size="sm" label="Try again" onPress={onRetry} testID={testID && `${testID}-retry`} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  foot: { minHeight: PAGED_FOOTER_HEIGHT, alignItems: 'center', justifyContent: 'center', paddingVertical: SPACE.sm },
  failed: { alignItems: 'center', gap: SPACE.sm },
  secondary: { color: COLOR.textSecondary },
})

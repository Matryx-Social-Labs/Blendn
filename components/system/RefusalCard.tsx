import { StyleSheet, View } from 'react-native'

import { StateScreen, type StateScreenProps } from '../ds/StateScreen'
import { COLOR, RADIUS, SPACE } from '../../lib/design/tokens'

/**
 * A refusal drawn as a card (guidelines/flow-15 `refusalCard`: an event link that cannot open, an event taken down): a
 * solid surface, a 56 pt glyph well, the title, one paragraph, one full-width action. It is `StateScreen`'s inline
 * pattern on a card, never a screen of its own, so it sits under the screen's own back button.
 */
export function RefusalCard(props: Omit<StateScreenProps, 'variant'>) {
  return (
    <View style={styles.card}>
      <StateScreen {...props} variant="inline" />
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.sheet,
    backgroundColor: COLOR.surface,
    paddingTop: SPACE.xl,
    paddingHorizontal: SPACE.lg + SPACE.xs,
    paddingBottom: SPACE.lg + SPACE.xs,
  },
})

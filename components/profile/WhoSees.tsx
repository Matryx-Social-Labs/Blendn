import { StyleSheet, Text, View } from 'react-native'

import { COLOR, ICON, MAX_FONT_SCALE, SPACE } from '../../lib/design/tokens'
import { whoSees, type MatchingField } from '../../lib/matchingTiers'
import { font, useBoldText } from '../ds/shared'
import { Icon } from '../ui/Icon'

/** The "who sees this" line under a field (14.0): a glyph and the tier's sentence, wrapping rather than cutting at any text size. */
export function WhoSees({ field, testID }: { field: MatchingField; testID?: string }) {
  const bold = useBoldText()
  const { text, icon } = whoSees(field)
  return (
    <View testID={testID ?? `who-sees-${field}`} accessible accessibilityLabel={text} style={styles.row}>
      <Icon name={icon} size={ICON.inline} color={COLOR.textSecondary} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.text]}>
        {text}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.xs, paddingHorizontal: SPACE.xs, paddingTop: SPACE.xs },
  text: { flex: 1, color: COLOR.textSecondary },
})

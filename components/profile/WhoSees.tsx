import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'

import { COLOR, ICON, MAX_FONT_SCALE, SPACE, TYPE } from '../../lib/design/tokens'
import { whoSees, type MatchingField } from '../../lib/matchingTiers'
import { font, useBoldText } from '../ds/shared'
import { Icon } from '../ui/Icon'

/** The "who sees this" line under a field (14.0): a glyph and the tier's sentence, wrapping rather than cutting at any text size. */
export function WhoSees({ field, testID }: { field: MatchingField; testID?: string }) {
  const bold = useBoldText()
  const { text, icon } = whoSees(field)
  // The glyph is centred on the first line, which grows with the text up to the text's own cap (as Banner's glyph slot).
  const line = TYPE.meta.lineHeight * Math.min(useWindowDimensions().fontScale || 1, MAX_FONT_SCALE.meta)
  const id = testID ?? `who-sees-${field}`
  return (
    <View testID={id} accessible accessibilityLabel={text} style={styles.row}>
      <View testID={`${id}-glyph`} style={[styles.glyph, { height: line }]}>
        <Icon name={icon} size={ICON.inline} color={COLOR.textSecondary} />
      </View>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.text]}>
        {text}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.xs, paddingHorizontal: SPACE.xs, paddingTop: SPACE.xs },
  glyph: { justifyContent: 'center' },
  text: { flex: 1, color: COLOR.textSecondary },
})

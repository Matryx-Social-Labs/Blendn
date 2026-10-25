import { StyleSheet, Text, View } from 'react-native'

import { COLOR, FONT_FAMILY, SPACE, TYPE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { font, useBoldText } from './shared'

/**
 * Between the day groups of a list (guidelines/components/DayHeading.html):
 * the date at 17 in 700 ("Sat 4 Oct", or Today / Tomorrow) and the weekday in
 * meta beside it. The caller formats both in the one date grammar (SCREENS
 * Flow 3). Never a sticky bar; the chat's day pill is a different thing.
 *
 * One heading for a screen reader: "Today, Friday", or `accessibilityLabel`
 * for the long form ("Saturday 4 October"). Scales freely; no haptic.
 */
export function DayHeading({
  date,
  weekday,
  accessibilityLabel,
  testID,
}: {
  date: string
  weekday?: string
  accessibilityLabel?: string
  testID?: string
}) {
  const bold = useBoldText()
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="header"
      accessibilityLabel={accessibilityLabel ?? (weekday ? `${date}, ${weekday}` : date)}
      style={styles.row}
    >
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold, FONT_FAMILY.brand[700]), styles.date]}>{date}</Text>
      {weekday ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.weekday]}>{weekday}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.sm },
  date: { color: COLOR.textPrimary, letterSpacing: TYPE.heading.letterSpacing },
  weekday: { color: COLOR.textSecondary },
})

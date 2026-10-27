import { StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, FadeOut, ReduceMotion } from 'react-native-reanimated'

import { COLOR, EASING, MATERIAL, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import { useMotion } from '../../lib/motion'
import { font, useBoldText, useIncreaseContrast } from './shared'

/**
 * Where your unread messages start (guidelines/components/UnreadDivider.html):
 * a hairline with "NEW" (or "3 NEW") in Geist Mono, read as a heading. Drawn
 * once on open; the screen unmounts it when you reach the bottom and it fades
 * out over `base` (the page's "M.fade"). Increase Contrast: the hairline at
 * 50% and the word white. No haptic.
 */
export function UnreadDivider({
  count,
  word = 'new',
  testID,
}: {
  count?: number
  /** The flow's word: the DM frame says "2 UNREAD" (Flow 5 DM #11). */
  word?: 'new' | 'unread'
  testID?: string
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const { duration } = useMotion()
  const line = [
    styles.line,
    contrast
      ? { height: 1, backgroundColor: MATERIAL.hairlineIncreaseContrast }
      : { height: StyleSheet.hairlineWidth, backgroundColor: COLOR.hairlineStrong },
  ]

  return (
    <Animated.View
      testID={testID}
      exiting={FadeOut.duration(duration.base).easing(Easing.bezier(...EASING.gentle)).reduceMotion(ReduceMotion.Never)}
      accessible
      accessibilityRole="header"
      accessibilityLabel={count ? `${count} ${word} messages` : word === 'new' ? 'New messages' : 'Unread messages'}
      style={styles.row}
    >
      <View testID={testID && `${testID}-line`} style={line} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.label} style={[font('label', bold), { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>
        {(count ? `${count} ${word}` : word).toUpperCase()}
      </Text>
      <View style={line} />
    </Animated.View>
  )
}

/**
 * The day, centred in the feed (the same page): a 24 pt surface capsule with
 * Today, Yesterday or a short date in the one date grammar (the screen formats
 * it). Read as a heading; it never sticks. Its text caps at 1.3× inside 24 pt.
 */
export function DayPill({ text, testID }: { text: string; testID?: string }) {
  const bold = useBoldText()
  return (
    <View testID={testID} accessible accessibilityRole="header" accessibilityLabel={text} style={styles.pill}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[font('caption', bold), styles.day]}>
        {text}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, alignSelf: 'stretch' },
  line: { flex: 1 },
  pill: {
    alignSelf: 'center',
    height: SPACE.xl,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.surface,
    justifyContent: 'center',
  },
  day: { color: COLOR.textSecondary },
})

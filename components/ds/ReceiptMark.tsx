import { StyleSheet, Text } from 'react-native'
import Animated, { Easing, FadeIn, LayoutAnimationConfig, ReduceMotion } from 'react-native-reanimated'

import { Icon } from '../ui/Icon'
import { COLOR, EASING, ICON, MAX_FONT_SCALE, SPACE } from '../../lib/design/tokens'
import { useMotion } from '../../lib/motion'
import { font, useBoldText } from './shared'

export type Receipt = 'sent' | 'delivered' | 'read'

export const RECEIPT_WORD: Record<Receipt, string> = { sent: 'Sent', delivered: 'Delivered', read: 'Read' }

/**
 * Where your message got to, in a DM (guidelines/components/ReceiptMark.html):
 * one check and "Sent", two and "Delivered", two in white and "Read". Only on
 * your last message in a DM, never in a room (the screen decides). Read as the
 * word, never the glyph. No haptic.
 *
 * It never animates on its own; a new state crosses in over `base` (the page's
 * "M.fade"), a fade under Reduce Motion too. The glyph is the inline 16 (the
 * page draws 14, off the icon scale).
 */
export function ReceiptMark({ state, testID }: { state: Receipt; testID?: string }) {
  const bold = useBoldText()
  const { duration } = useMotion()
  const color = state === 'read' ? COLOR.textPrimary : COLOR.textTertiary
  const fade = FadeIn.duration(duration.base).easing(Easing.bezier(...EASING.gentle)).reduceMotion(ReduceMotion.Never)

  return (
    <LayoutAnimationConfig skipEntering>
      <Animated.View key={state} entering={fade} testID={testID} accessible accessibilityLabel={RECEIPT_WORD[state]} style={styles.row}>
        <Icon name={state === 'sent' ? 'check' : 'check-check'} size={ICON.inline} color={color} />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[font('caption', bold), { color }]}>
          {RECEIPT_WORD[state]}
        </Text>
      </Animated.View>
    </LayoutAnimationConfig>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
})

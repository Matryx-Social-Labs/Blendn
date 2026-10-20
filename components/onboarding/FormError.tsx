import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { Icon } from '../ui/Icon'
import { announceOutcome, font, useBoldText } from '../ds/shared'
import { COLOR, ICON, RADIUS, SPACE } from '../../lib/design/tokens'

/**
 * The server's refusal of a whole form (Flow 1 sign-in 08 · 10 · 12, forgot 06 · 07): a 16% destructive tint card, radius 16,
 * the glyph and the sentence in white, a clock for "the wait is N minutes" and the alert glyph for everything else.
 * Persistent, and told once as it arrives (iOS announces, Android reads the live region). `H.error` is the submit button's
 * (its `refused`), once, never this card's.
 */
export function FormError({ message, waiting = false, testID }: { message: string; waiting?: boolean; testID?: string }) {
  const bold = useBoldText()
  useEffect(() => announceOutcome(message), [message])
  return (
    <View testID={testID} accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.card}>
      <Icon name={waiting ? 'clock' : 'circle-alert'} size={ICON.control} color={COLOR.textPrimary} />
      <Text style={[font('meta', bold), styles.text]}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE.sm,
    borderRadius: RADIUS.rowInCard,
    backgroundColor: COLOR.destructiveTint,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
  },
  text: { flex: 1, color: COLOR.textPrimary },
})

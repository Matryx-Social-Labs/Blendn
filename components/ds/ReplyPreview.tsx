import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, FadeInUp, ReduceMotion } from 'react-native-reanimated'

import { Icon } from '../ui/Icon'
import { COLOR, EASING, ICON, RADIUS, SPACE } from '../../lib/design/tokens'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { font, minTarget, useBoldText } from './shared'

/** The composer's rule is as tall as the two lines beside it (the page's 28). */
const COMPOSER_RULE_HEIGHT = 28

export type ReplyPreviewProps = {
  /** Who is quoted, as the conversation names them. */
  name: string
  text: string
  /** In a bubble: shows the original (the screen scrolls to it on `M.travel`). */
  onPress?: () => void
  /** Given: the composer's form, with × to cancel. */
  onCancel?: () => void
  testID?: string
}

/**
 * A reply quotes one line (guidelines/components/ReplyPreview.html).
 *
 * - In the reply's bubble: a 2 pt `textTertiary` rule, the name and one line
 *   of the text, above the message. Tapping it shows the original.
 * - Above the composer (`onCancel`): a white rule, "Replying to {name}", the
 *   line, and × ("Cancel reply"). It rises 8 pt over `base` as it appears
 *   (#35); under Reduce Motion it fades in.
 *
 * Both lines scale; the quote stays one line and truncates. Silent.
 */
export function ReplyPreview({ name, text, onPress, onCancel, testID }: ReplyPreviewProps) {
  const bold = useBoldText()
  const reduceMotion = useReducedMotion()

  if (!onCancel) {
    const quote = (
      <View testID={testID} style={styles.quote}>
        <Text numberOfLines={1} style={[font('caption', bold), styles.secondary]}>
          {name}
        </Text>
        <Text numberOfLines={1} style={[font('meta', bold), styles.secondary]}>
          {text}
        </Text>
      </View>
    )
    if (!onPress) return quote
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Replying to ${name}: ${text}`}
        accessibilityHint="Shows the original message"
        onPress={onPress}
        hitSlop={SPACE.xs}
      >
        {quote}
      </Pressable>
    )
  }

  // #35: 8 pt (the list rise) over `base`; nothing under Reduce Motion, so it fades.
  const motion = motionTokens(reduceMotion)
  const rise = FadeInUp.duration(motion.duration.base)
    .easing(Easing.bezier(...EASING.entrance))
    .withInitialValues({ opacity: 0, transform: [{ translateY: motion.rise.list }] })
    .reduceMotion(ReduceMotion.Never)

  return (
    <Animated.View testID={testID} entering={rise} style={styles.bar}>
      <View testID={testID && `${testID}-rule`} style={styles.rule} />
      <View style={styles.lines} accessible accessibilityLabel={`Replying to ${name}: ${text}`}>
        <Text numberOfLines={1} style={[font('caption', bold), styles.secondary]}>
          Replying to {name}
        </Text>
        <Text numberOfLines={1} style={[font('meta', bold), styles.primary]}>
          {text}
        </Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Cancel reply" onPress={onCancel} style={styles.cancel}>
        <Icon name="x" size={ICON.control} color={COLOR.textSecondary} />
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  quote: { borderLeftWidth: 2, borderLeftColor: COLOR.textTertiary, paddingLeft: SPACE.sm, marginBottom: SPACE.xs },
  bar: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingTop: SPACE.sm, paddingLeft: SPACE.lg },
  rule: { width: 2, height: COMPOSER_RULE_HEIGHT, borderRadius: RADIUS.capsule, backgroundColor: COLOR.textPrimary },
  lines: { flex: 1 },
  cancel: { width: minTarget(), height: minTarget(), alignItems: 'center', justifyContent: 'center' },
  primary: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
})

import { Pressable, StyleSheet, Text, View } from 'react-native'

import { Icon, type IconName } from '../ui/Icon'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SPACE, TYPE } from '../../lib/design/tokens'
import { font, IC_HAIRLINE, minTarget, useBoldText, useIncreaseContrast } from './shared'

/**
 * The room narrating something nobody needs to act on (the SystemNotice page,
 * chat.js `systemLine`): one centred sentence in `textTertiary`. Never "{name}
 * walked in" (ROUND3 C1): arrivals are the count and the grid.
 */
export function SystemLine({ text, testID }: { text: string; testID?: string }) {
  const bold = useBoldText()
  return (
    <Text testID={testID} style={[font('meta', bold), styles.line]}>
      {text}
    </Text>
  )
}

export type SystemNoticeProps = {
  /** One sentence; the server's, verbatim, when it is the server speaking. */
  text: string
  icon?: IconName
  kind?: 'info' | 'warn'
  /** At most one text action. */
  action?: { label: string; onPress: () => void }
  testID?: string
}

/**
 * A sentence in the feed that matters (guidelines/components/SystemNotice.html):
 * a guideline, a moderation result, a refusal that stays. A solid surface card
 * (warn: the warning tint) with one glyph, the sentence and at most one text
 * action; never a bubble, never a banner. Read as the sentence, then the
 * action as a button. No haptic: a notice is read, not felt. Increase
 * Contrast: the 50% hairline.
 */
export function SystemNotice({ text, icon = 'info', kind = 'info', action, testID }: SystemNoticeProps) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  return (
    <View
      testID={testID}
      style={[styles.card, { backgroundColor: kind === 'warn' ? COLOR.warningTint : COLOR.surface }, contrast && IC_HAIRLINE]}
    >
      <Icon name={icon} size={ICON.control} />
      <View style={styles.body}>
        <Text style={[font('meta', bold), styles.text]}>{text}</Text>
        {action ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={(minTarget() - TYPE.meta.lineHeight) / 2}
            onPress={action.onPress}
            style={styles.action}
          >
            <Text style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.text]}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  line: { alignSelf: 'center', textAlign: 'center', color: COLOR.textTertiary },
  card: {
    borderRadius: RADIUS.rowInCard,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE.md,
  },
  body: { flex: 1, gap: SPACE.sm },
  text: { color: COLOR.textPrimary },
  action: { alignSelf: 'flex-start' },
})

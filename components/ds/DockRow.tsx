import type { Ref } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { Button } from './Button'
import { font, useBoldText, useLargeText } from './shared'
import type { IconName } from '../ui/Icon'
import { COLOR, FONT_FAMILY, MAX_FONT_SCALE, SPACE } from '../../lib/design/tokens'

/** `.ax .dock4`: at the largest text the state stands over a full-width button, 10 apart. */
// design-exception: the board restacks with a 10 pt gap (`.ax .dock4{gap:10px}`), between SPACE.sm and SPACE.md.
const STACK_GAP = 10

export type DockRowAction = {
  label: string
  kind: 'primary' | 'lit'
  icon?: IconName
  onPress?: () => void
  loading?: boolean
  /** `false` where the action's own answer plays the haptic (I’m going, §10.2). */
  pressHaptic?: boolean | (() => void)
  accessibilityHint?: string
  testID?: string
}

/**
 * The board's largest text (`.ax .dock4`) grows the state as body and its line as meta (2×), not as their 17 and 13 pt roles.
 *
 * Flow 4's dock line (`.dock4`, the event and venue pages): the state on the left in its own slot, a second line under
 * it, and one action on the right. State is never glued to a variable value: each line ellipsizes in its own slot. With
 * `onPressState` the state is a control ("You’re going · Change"), read as one. At the largest text the two stack.
 * Inside a `<Dock line>`.
 */
export function DockRow({
  state,
  sub,
  subIsLink = false,
  onPressState,
  stateHint,
  stateRef,
  action,
  testID,
}: {
  state: string
  sub?: string
  /** The second line is the state's own action ("Change"): white, bold. */
  subIsLink?: boolean
  onPressState?: () => void
  stateHint?: string
  /** The state's control, for focus to come back to when what it opened closes (the check-out sheet). */
  stateRef?: Ref<View>
  action?: DockRowAction
  testID?: string
}) {
  const bold = useBoldText()
  const large = useLargeText()
  const lines = large ? undefined : 1
  const words = (
    <>
      <Text testID={testID && `${testID}-state`} numberOfLines={lines} maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('group', bold), styles.ink]}>
        {state}
      </Text>
      {sub ? (
        <Text
          testID={testID && `${testID}-sub`}
          numberOfLines={lines}
          maxFontSizeMultiplier={MAX_FONT_SCALE.meta}
          style={subIsLink ? [font('note', bold, FONT_FAMILY.brand[700]), styles.ink] : [font('note', bold), styles.secondary]}
        >
          {sub}
        </Text>
      ) : null}
    </>
  )
  const label = [state, sub].filter(Boolean).join('. ')
  return (
    <View testID={testID} style={[styles.row, large && styles.stack]}>
      {onPressState ? (
        <Pressable ref={stateRef} testID={testID && `${testID}-left`} onPress={onPressState} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={stateHint} hitSlop={SPACE.sm} style={styles.state}>
          {words}
        </Pressable>
      ) : (
        <View testID={testID && `${testID}-left`} accessible accessibilityLabel={label} style={styles.state}>
          {words}
        </View>
      )}
      {action ? (
        <Button
          label={action.label}
          kind={action.kind}
          size="dock"
          icon={action.icon}
          onPress={action.onPress}
          loading={action.loading}
          pressHaptic={action.pressHaptic}
          accessibilityHint={action.accessibilityHint}
          testID={action.testID}
          style={large ? styles.full : null}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  stack: { flexDirection: 'column', alignItems: 'stretch', gap: STACK_GAP },
  state: { flex: 1, minWidth: 0 },
  full: { alignSelf: 'stretch' },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
})

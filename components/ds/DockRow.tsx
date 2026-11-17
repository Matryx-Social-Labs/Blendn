import type { Ref } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { Button } from './Button'
import { PresenceDot } from './MonoFamily'
import { font, useBoldText, useLargeText, useTwoLineNames } from './shared'
import type { IconName } from '../ui/Icon'
import { COLOR, FONT_FAMILY, MAX_FONT_SCALE, SPACE } from '../../lib/design/tokens'

/** `.ax .dock4`: at the largest text the state stands over a full-width button, 10 apart. */
// design-exception: the board restacks with a 10 pt gap (`.ax .dock4{gap:10px}`), between SPACE.sm and SPACE.md.
const STACK_GAP = 10

export type DockRowAction = {
  label: string
  kind: 'primary' | 'lit'
  /** The dock's own 52 (default), or md 48 where the board draws it (the venue's live line, beside a time). */
  size?: 'dock' | 'md'
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
 *
 * A state with a time (the venue's "● Live · 2h 45m", "● Ending · 4:59") gives the time its own slot after the word:
 * it never shrinks and has no line limit, so the word gives way first and the time is never cut. Such a row stacks from
 * `TWO_LINE_NAMES_FROM` rather than at the AX sizes: at 1.3 on a 360 phone the word was cut to "..".
 */
export function DockRow({
  state,
  sub,
  subIsLink = false,
  onPressState,
  stateHint,
  stateRef,
  action,
  dot,
  clock,
  label: spoken,
  testID,
}: {
  state: string
  /** A presence dot before the state: live green, or the warning amber of a window that is ending. */
  dot?: 'live' | 'ending'
  /** The state's time, in its own slot after "·"; Geist Mono 700 when it is a ticking clock. */
  clock?: { text: string; mono: boolean }
  /** Read instead of "state. sub", where the words leave out what they are about (the venue's place). */
  label?: string
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
  const ax = useLargeText()
  const twoLine = useTwoLineNames()
  const large = ax || (clock !== undefined && twoLine)
  const lines = large ? undefined : 1
  const stateText = (
    <Text testID={testID && `${testID}-state`} numberOfLines={lines} maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('group', bold), styles.ink, (dot || clock) && styles.give]}>
      {clock ? `${state} ·` : state}
    </Text>
  )
  const words = (
    <>
      {dot || clock ? (
        <View style={styles.head}>
          {dot ? (
            <View style={styles.dot}>
              <PresenceDot kind={dot} testID={testID && `${testID}-dot`} />
            </View>
          ) : null}
          {stateText}
          {clock ? (
            <Text
              testID={testID && `${testID}-clock`}
              maxFontSizeMultiplier={MAX_FONT_SCALE.body}
              style={[font('group', bold, clock.mono ? FONT_FAMILY.mono[700] : undefined), styles.ink, styles.keep]}
            >
              {clock.text}
            </Text>
          ) : null}
        </View>
      ) : (
        stateText
      )}
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
  const label = spoken ?? [state, sub].filter(Boolean).join('. ')
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
          size={action.size ?? 'dock'}
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
  /** The dot 8 before the words (`.s1` gap). */
  head: { flexDirection: 'row', alignItems: 'center' },
  dot: { marginRight: SPACE.sm },
  /** The state's word gives way to its time; the time keeps its whole width. */
  give: { flexShrink: 1 },
  /** The space after "·" is a margin: Android drops a trailing space from a squeezed line ("Ending ·4:16"). */
  keep: { flexShrink: 0, marginLeft: SPACE.xs, fontVariant: ['tabular-nums'] },
  full: { alignSelf: 'stretch' },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
})

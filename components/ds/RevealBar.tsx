import { StyleSheet, Text, View } from 'react-native'

import { Icon } from '../ui/Icon'
import { Material } from '../ui/Material'
import { COLOR, ICON, MATERIAL, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { Avatar } from './Avatar'
import { Button } from './Button'
import type { Face } from './Facepile'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, useBoldText, useIncreaseContrast } from './shared'

/** None revealed, you only, they only, or you asked them; at both the bar is gone, unless there is a friend to add (`both`). */
export type RevealState = 'none' | 'youOnly' | 'theyOnly' | 'asked' | 'both'
/** `both`'s one action: Add friend, or Accept friend request when one is waiting. */
export type RevealFriend = { label: string; accept?: boolean; busy?: boolean; onPress: () => void }
/** A side as the DM shows it now: the creature and pseudonym until seen, then the photo and name. */
export type RevealSide = { face: Face; name: string }

const SIDE_FACE = 36

/**
 * A DM between two anonymous people opens with this (guidelines/components/RevealBar.html),
 * on the sheet tier: you on the left, them on the right, each a face, a name
 * and an eye that says seen or anonymous. Under it the one action: "Show them
 * who you are" (lit, irreversible: a sheet confirms it) with "Ask
 * them" beside it. Once you've shown yourself it says so and waits; once both
 * have, the caller drops the bar. Designed as a moment (§12), not a setting.
 *
 * Silent: Show them opens the confirming sheet, Ask them is none; the caller
 * plays `H.success` on "Revealed · both sides". Read: "You, Night Cat,
 * anonymous. Cosmic Panda, anonymous." then the actions. Names and the eye
 * line cap at 1.3×; Increase Contrast: the 50% hairline and the eye line white.
 */
export function RevealBar({
  state,
  you,
  them,
  onShow,
  onAsk,
  friend,
  previewState,
  testID,
}: {
  state: RevealState
  you: RevealSide
  them: RevealSide
  onShow?: () => void
  onAsk?: () => void
  /** `both` only: the action that is left. */
  friend?: RevealFriend
  /** The design gallery only: Show them pressed or focused. */
  previewState?: 'pressed' | 'focused'
  testID?: string
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const youSeen = state === 'youOnly' || state === 'both'
  const themSeen = state === 'theyOnly' || state === 'both'
  const quiet = contrast ? COLOR.textPrimary : COLOR.textSecondary
  const seenWord = (seen: boolean) => (seen ? 'seen' : 'anonymous')

  const side = (who: RevealSide, label: string, seen: boolean) => (
    <View style={styles.side}>
      <Avatar size={SIDE_FACE} {...who.face} />
      <View style={styles.sideText}>
        <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold), styles.ink]}>
          {label}
        </Text>
        <View style={styles.eye}>
          <Icon name={seen ? 'eye' : 'eye-off'} size={ICON.inline} color={quiet} />
          <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold), { color: quiet }]}>
            {seenWord(seen)}
          </Text>
        </View>
      </View>
    </View>
  )

  return (
    <View testID={testID} style={styles.bar}>
      <Material role="sheet" style={[StyleSheet.absoluteFill, styles.radius]} />
      <View
        accessible
        accessibilityLabel={`You, ${you.name}, ${seenWord(youSeen)}. ${them.name}, ${seenWord(themSeen)}.`}
        style={styles.sides}
      >
        {side(you, `You · ${you.name}`, youSeen)}
        <Icon name="arrow-left-right" size={ICON.inline} color={COLOR.textSecondary} />
        {side(them, them.name, themSeen)}
      </View>
      {state === 'youOnly' ? (
        <Text style={[font('meta', bold), styles.secondary]}>They can see you. They’ll decide in their own time.</Text>
      ) : state === 'both' ? (
        <View testID={testID && `${testID}-both`} style={styles.both}>
          <View style={styles.bothLine}>
            <Icon name="eye" size={ICON.inline} color={quiet} />
            <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold), styles.secondary, styles.shrink]}>
              You can both see each other
            </Text>
          </View>
          {friend ? (
            <Button
              kind="lit"
              size="sm"
              icon={friend.accept ? 'user-check' : 'user-plus'}
              label={friend.label}
              loading={friend.busy}
              // Accepting answers a person who asked you: the press is felt, as a screen's primary is.
              pressHaptic={friend.accept ? () => H.primary() : false}
              onPress={friend.onPress}
              testID={testID && `${testID}-friend`}
            />
          ) : null}
        </View>
      ) : state === 'asked' ? (
        <View testID={testID && `${testID}-asked`} style={styles.asked}>
          <Icon name="check" size={ICON.inline} color={COLOR.textSecondary} />
          <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold), styles.secondary, styles.shrink]}>
            Asked · they’ll decide in their own time
          </Text>
        </View>
      ) : (
        <View testID={testID && `${testID}-actions`} style={styles.actions}>
          <Button kind="lit" size="md" icon="eye" label="Show them who you are" onPress={onShow} previewState={previewState} style={styles.grow} testID={testID && `${testID}-show`} />
          {state === 'none' ? <Button kind="secondary" size="md" onGlass label="Ask them" onPress={onAsk} testID={testID && `${testID}-ask`} /> : null}
        </View>
      )}
      {contrast ? <View testID={testID && `${testID}-contrast`} pointerEvents="none" style={[StyleSheet.absoluteFill, styles.radius, IC_HAIRLINE]} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { borderRadius: RADIUS.sheet, paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg, gap: SPACE.md, overflow: 'hidden' },
  radius: { borderRadius: RADIUS.sheet },
  sides: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  side: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  sideText: { flex: 1, minWidth: 0 },
  eye: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  shrink: { flexShrink: 1 },
  /** Wraps rather than truncating "Show them who you are" on a narrow phone or at large text. */
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  grow: { flexGrow: 1 },
  /** The line and the action: side by side, and the action drops under it when the line needs the room. */
  both: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.sm },
  bothLine: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  asked: {
    minHeight: SIZE.control,
    paddingVertical: SPACE.sm,
    borderRadius: RADIUS.capsule,
    backgroundColor: MATERIAL.fillOnGlass,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.lg,
  },
})

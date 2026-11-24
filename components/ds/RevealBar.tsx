import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'

import { Icon } from '../ui/Icon'
import { Material } from '../ui/Material'
import type { RevealBarState } from '../../lib/conversationReveal'
import { COLOR, ICON, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { Avatar } from './Avatar'
import { Button } from './Button'
import type { Face } from './Facepile'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, ROOMY_WIDTH, useBoldText, useIncreaseContrast } from './shared'

/** Swap names (`lib/conversationReveal.ts` `RevealBarState`): neither, you tapped, they tapped; at both the bar is gone, unless there is a friend to add. */
export type RevealState = RevealBarState
/** `both`'s one action: Add friend, or Accept friend request when one is waiting. */
export type RevealFriend = { label: string; accept?: boolean; busy?: boolean; onPress: () => void }
/** A side as the DM shows it now: the creature and pseudonym until you have both swapped, then the photo and first name. */
export type RevealSide = { face: Face; name: string }

const SIDE_FACE = 36

/** Said under Swap names, wherever it is offered: what a swap shows, and that nothing shows until both tap. */
export const SWAP_NOTE = 'Nothing shows until you both tap. Then it’s your first name and one photo, in this chat only.'

/**
 * A DM between two anonymous people opens with this (Flow 5 D-A, the identity model's Swap names; board `swap-names/`,
 * advisor pick A): on the sheet tier, you on the left, them on the right, each a face, a name and an eye line. Under it
 * the state's one action, always stacked under its line:
 *
 * - `none`: Swap names (lit), and what a swap shows.
 * - `mine`: "Waiting for them to swap too", and Cancel (quiet). Nothing shows yet: your side stays your pseudonym.
 * - `theirs`: "{them} wants to swap names", Swap names (lit), and what a swap shows.
 * - `both`: "You can both see each other", and Add friend while the server offers it.
 *
 * Swap names is felt as any lit press; the caller plays `H.success` only when the server says you have both swapped.
 * `error` is a refusal said in place (heard once). Read: "You, Night Cat, anonymous. Cosmic Panda, wants to swap." then
 * the actions. Names wrap to two lines rather than cut; names and the eye line cap at 1.3×.
 */
/** Your side's name when the server sent no pseudonym of yours. */
export const YOU = 'You'

export function RevealBar({
  state,
  you,
  them,
  onSwap,
  onCancel,
  busy = false,
  error,
  friend,
  previewState,
  testID,
}: {
  state: RevealState
  you: RevealSide
  them: RevealSide
  onSwap?: () => void
  onCancel?: () => void
  /** A tap is in flight: the action shows its spinner and takes no second press. */
  busy?: boolean
  /** The last tap's refusal, in the server's words. */
  error?: string | null
  /** `both` only: the action that is left. */
  friend?: RevealFriend
  /** The design gallery only: Swap names pressed or focused. */
  previewState?: 'pressed' | 'focused'
  testID?: string
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  // At 360 dp each side had about 90 dp: "You · Aarav" cut to "You · Aa…" (C26). Narrow, "You" stacks over your name.
  const narrow = useWindowDimensions().width <= ROOMY_WIDTH
  const quiet = contrast ? COLOR.textPrimary : COLOR.textSecondary
  /** What each side's eye line says: one word while anonymous (it can only shrink), a short phrase once there is news. */
  const word = (mine: boolean) =>
    state === 'both' ? 'seen' : mine && state === 'mine' ? 'tapped' : !mine && state === 'theirs' ? 'wants to swap' : 'anonymous'
  // Your side with no pseudonym of its own reads "You", never "You · You".
  const yourName = you.name === YOU ? null : you.name

  const side = (who: RevealSide, mine: boolean) => {
    const id = testID && `${testID}-${mine ? 'you' : 'them'}`
    const names = (
      <View testID={id && `${id}-names`} style={styles.sideText}>
        {mine && narrow && yourName ? (
          <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold), styles.ink]}>
            You
          </Text>
        ) : null}
        {/* Each name may take two lines rather than be cut to a few letters (C26, C27). */}
        <Text numberOfLines={2} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold), styles.ink]}>
          {mine ? (yourName ? (narrow ? yourName : `You · ${yourName}`) : YOU) : who.name}
        </Text>
        {narrow ? null : eyeLine(mine, id)}
      </View>
    )
    const faceAndNames = (
      <View style={narrow ? styles.faceRow : styles.side}>
        <Avatar size={SIDE_FACE} {...who.face} />
        {names}
      </View>
    )
    /*
     * Narrow, the eye line goes under the face and the name, across the whole side: beside the face it had about 54 dp
     * at 1.3× / 360 dp, and "anonymous" is one word, so it read "anony…" on both sides (rc8 10d).
     */
    return narrow ? (
      <View style={styles.sideStack}>
        {faceAndNames}
        {eyeLine(mine, id)}
      </View>
    ) : (
      faceAndNames
    )
  }
  const eyeLine = (mine: boolean, id: string | undefined) => {
    const w = word(mine)
    return (
      <View testID={id && `${id}-eye`} style={styles.eye}>
        <Icon name={w === 'seen' ? 'eye' : w === 'tapped' ? 'check' : w === 'anonymous' ? 'eye-off' : 'arrow-left-right'} size={ICON.inline} color={quiet} />
        {/* One word shrinks and ends in "…" rather than run past the card at 1.3× / 360 dp (rc7 D8); a phrase may wrap. */}
        <Text numberOfLines={w.includes(' ') ? 2 : 1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold), styles.shrink, { color: quiet }]}>
          {w}
        </Text>
      </View>
    )
  }
  const swap = (
    <Button
      kind="lit"
      size="md"
      icon="arrow-left-right"
      label="Swap names"
      loading={busy}
      onPress={onSwap}
      previewState={previewState}
      testID={testID && `${testID}-swap`}
    />
  )
  const note = (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary, styles.centre]}>
      {SWAP_NOTE}
    </Text>
  )
  const line = (text: string, id: string) => (
    <Text testID={testID && `${testID}-${id}`} maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), state === 'theirs' ? styles.ink : styles.secondary]}>
      {text}
    </Text>
  )

  return (
    <View testID={testID} style={styles.bar}>
      <Material role="sheet" style={[StyleSheet.absoluteFill, styles.radius]} />
      <View
        accessible
        accessibilityLabel={`${yourName ? `You, ${yourName}` : YOU}, ${word(true)}. ${them.name}, ${word(false)}.`}
        style={styles.sides}
      >
        {side(you, true)}
        <Icon name="arrow-left-right" size={ICON.inline} color={COLOR.textSecondary} />
        {side(them, false)}
      </View>
      {state === 'both' ? (
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
      ) : (
        <View testID={testID && `${testID}-actions`} style={styles.actions}>
          {state === 'mine' ? line('Waiting for them to swap too', 'waiting') : null}
          {state === 'theirs' ? line(`${them.name} wants to swap names`, 'theirs') : null}
          {state === 'mine' ? (
            <Button kind="secondary" size="md" onGlass label="Cancel" loading={busy} onPress={onCancel} testID={testID && `${testID}-cancel`} />
          ) : (
            swap
          )}
          {state === 'mine' ? null : note}
          {error ? (
            <Text testID={testID && `${testID}-error`} accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.ink, styles.centre]}>
              {error}
            </Text>
          ) : null}
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
  /** Narrow: the face and the name in a row, the eye line under them across the side. */
  sideStack: { flex: 1, minWidth: 0, gap: SPACE.xs },
  faceRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  eye: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  shrink: { flexShrink: 1 },
  /** The state's line, its one action under it at every size (advisor pick A), then the note. */
  actions: { flexDirection: 'column', alignItems: 'stretch', gap: SPACE.sm },
  centre: { textAlign: 'center' },
  /** The line and the action: side by side, and the action drops under it when the line needs the room. */
  both: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.sm },
  bothLine: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
})

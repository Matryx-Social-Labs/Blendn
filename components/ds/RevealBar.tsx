import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { Easing, FadeIn, FadeOut } from 'react-native-reanimated'

import { Icon } from '../ui/Icon'
import { RadialWash } from '../ui/GradientFill'
import { COLOR, EASING, FONT_FAMILY, MATERIAL, MAX_FONT_SCALE, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { tint } from '../../lib/theme'
import { Avatar } from './Avatar'
import { Button } from './Button'
import type { Face } from './Facepile'
import { CONTROL_FONT_CAP, font, HueProvider, IC_HAIRLINE, ROOMY_WIDTH, useBoldText, useIncreaseContrast, useLargeText } from './shared'

/** None revealed, you only, they only, or you asked them; at both the strip is gone, unless there is a friend to add (`both`). */
export type RevealState = 'none' | 'youOnly' | 'theyOnly' | 'asked' | 'both'
/** `both`'s one action: Add friend, or Accept friend request when one is waiting. */
export type RevealFriend = {
  label: string
  accept?: boolean
  busy?: boolean
  onPress: () => void
}
/** A side as the DM shows it now: the creature and pseudonym until shown, then the photo and first name. */
export type RevealSide = { face: Face; name: string }

/** `.xrev .sd`: a 40 face, 10 to the name. */
const SIDE_FACE = 40
// design-exception: the board's side gap is 10 (`.xrev .sd` gap), between SPACE.sm and SPACE.md
const SIDE_GAP = 10
// design-exception: the strip is 14 in at the sides and the foot (`.xrev` padding 12 14 14), off the SPACE scale
const STRIP_IN = 14
/** `.xrev .mid`: a 24 pt hairline between the two sides. */
const MID = SPACE.xl
/** `.xrev`: violet from your corner, rose from theirs, each into the surface; the rim violet at 45%. */
const WASH = [
  {
    color: COLOR.brandViolet,
    alpha: 0.26,
    at: [0, 0],
    size: [70, 120],
    reach: 0.7,
  },
  {
    color: COLOR.brandRose,
    alpha: 0.24,
    at: [100, 0],
    size: [70, 120],
    reach: 0.7,
  },
] as const
const RIM = 0.45
/** D-A film: a side crossfades from creature to face in place over M.settle, no flip, no confetti; Reduce Motion 200 ms. */
export const REVEAL_CROSSFADE_MS = 700
export const REVEAL_CROSSFADE_REDUCED_MS = motionTokens(true).duration.base

/**
 * Flow 5 D-A, the reveal strip under the DM header (dm.html `xReveal`). You on the left in violet, them on the right in
 * rose, each a face, a name and an eye line ("You · Anonymous", "Shown"), a hairline between. Under them "Show who you
 * are" (lit violet: anything that is you is violet; irreversible, a sheet confirms it) and "Ask them". Once you have
 * shown yourself one line waits; once both have, the caller folds the strip away.
 *
 * Silent: Show who you are opens the confirming sheet, Ask them is none; the caller plays `H.success` on the server's
 * answer. Read: "You, Quiet Lynx, anonymous. Lunar Fox, anonymous." then the actions. Names and eye lines cap at 1.3×;
 * at the largest text the actions stack. Increase Contrast: the 50% hairline and the eye line white.
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
  /** Your side: your pseudonym in this conversation until you show, then your first name. */
  you: RevealSide
  them: RevealSide
  onShow?: () => void
  onAsk?: () => void
  /** `both` only: the action that is left. */
  friend?: RevealFriend
  /** The design gallery only: Show who you are pressed or focused. */
  previewState?: 'pressed' | 'focused'
  testID?: string
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const largeText = useLargeText()
  // At 360 dp the eye line beside the face had about 54 dp and read "anony…" (rc8 10d): narrow, it goes under the face.
  const narrow = useWindowDimensions().width <= ROOMY_WIDTH
  const youShown = state === 'youOnly' || state === 'both'
  const themShown = state === 'theyOnly' || state === 'both'
  const quiet = contrast ? COLOR.textPrimary : COLOR.textSecondary
  const said = (shown: boolean) => (shown ? 'shown' : 'anonymous')
  const id = (part: string) => testID && `${testID}-${part}`
  const reduceMotion = useReducedMotion()
  const crossfade = reduceMotion ? REVEAL_CROSSFADE_REDUCED_MS : REVEAL_CROSSFADE_MS
  // Keyed by what changed, so the old and the new cross in place (the builders run on the UI thread; no worklet of ours).
  const fadeIn = FadeIn.duration(crossfade).easing(Easing.bezier(...EASING.gentle))
  const fadeOut = FadeOut.duration(crossfade).easing(Easing.bezier(...EASING.gentle))

  const side = (who: RevealSide, mine: boolean, shown: boolean) => {
    const eye = (
      <View testID={id(`${mine ? 'you' : 'them'}-eye`)} style={[styles.eye, !mine && styles.eyeTheirs]}>
        <Icon name={shown ? 'eye' : 'eye-off'} size={EYE_GLYPH} color={quiet} />
        {/* Shrinks and ends in "…" rather than run past the strip at 1.3× / 360 dp (rc7 D8). */}
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={CONTROL_FONT_CAP}
          style={[font('caption', bold, FONT_FAMILY.brand[400]), styles.shrink, { color: quiet }]}
        >
          {`${mine ? 'You · ' : ''}${shown ? 'Shown' : 'Anonymous'}`}
        </Text>
      </View>
    )
    const names = (
      <View testID={id(`${mine ? 'you' : 'them'}-names`)} style={[styles.names, !mine && styles.namesTheirs]}>
        {/* A name may take two lines rather than be cut to a few letters (C26, C27; "Midnight Butterfly"). */}
        <Text numberOfLines={2} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('control', bold), styles.ink, !mine && styles.right]}>
          {who.name}
        </Text>
        {narrow ? null : eye}
      </View>
    )
    const row = (
      <View testID={narrow ? undefined : id(mine ? 'you' : 'them')} style={[styles.row, !mine && styles.rowTheirs]}>
        <Avatar size={SIDE_FACE} {...who.face} />
        {names}
      </View>
    )
    return (
      <Animated.View key={`${mine ? 'you' : 'them'}-${shown ? 'shown' : 'anonymous'}`} entering={fadeIn} exiting={fadeOut} style={styles.side}>
        {narrow ? (
          <View testID={id(mine ? 'you' : 'them')} style={[styles.stack, !mine && styles.stackTheirs]}>
            {row}
            {eye}
          </View>
        ) : (
          row
        )}
      </Animated.View>
    )
  }

  return (
    <View testID={testID} style={styles.strip}>
      <RadialWash layers={WASH} style={[StyleSheet.absoluteFill, styles.radius]} />
      {/* The rim is drawn over the strip, as the board's inset shadow is: it takes no room from the sides. */}
      <View testID={id('rim')} pointerEvents="none" style={[StyleSheet.absoluteFill, styles.rim]} />
      <View accessible accessibilityLabel={`You, ${you.name}, ${said(youShown)}. ${them.name}, ${said(themShown)}.`} style={styles.sides}>
        {side(you, true, youShown)}
        <View testID={id('mid')} style={styles.mid} />
        {side(them, false, themShown)}
      </View>
      <Animated.View key={state} entering={fadeIn} exiting={fadeOut}>
        {state === 'youOnly' ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.waiting, { color: quiet }]}>
            You showed them who you are. They decide when.
          </Text>
        ) : state === 'both' ? (
          <View testID={id('both')} style={styles.both}>
            <View style={styles.bothLine}>
              <Icon name="eye" size={EYE_GLYPH} color={quiet} />
              <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold), styles.shrink, { color: quiet }]}>
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
                testID={id('friend')}
              />
            ) : null}
          </View>
        ) : state === 'asked' ? (
          <View testID={id('asked')} style={styles.asked}>
            <Icon name="check" size={EYE_GLYPH} color={COLOR.textSecondary} />
            <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold), styles.shrink, { color: COLOR.textSecondary }]}>
              Asked · they’ll decide in their own time
            </Text>
          </View>
        ) : (
          <View testID={id('actions')} style={[styles.actions, largeText && styles.actionsStacked]}>
            {/* Yours, so violet, in the rose DM (Foundations C): the one place this screen lights in your hue. */}
            <HueProvider value="violet">
              <Button
                kind="lit"
                size="pill"
                icon="eye"
                label="Show who you are"
                onPress={onShow}
                previewState={previewState}
                style={largeText ? styles.full : undefined}
                testID={id('show')}
              />
            </HueProvider>
            {state === 'none' ? (
              <Button
                kind="secondary"
                size="pill"
                onGlass
                label="Ask them"
                onPress={onAsk}
                style={largeText ? styles.full : styles.rest}
                testID={id('ask')}
              />
            ) : null}
          </View>
        )}
      </Animated.View>
      {contrast ? <View testID={id('contrast')} pointerEvents="none" style={[StyleSheet.absoluteFill, styles.radius, IC_HAIRLINE]} /> : null}
    </View>
  )
}

/** `.xrev .sd span`: a 12 pt eye. */
const EYE_GLYPH = 12

const styles = StyleSheet.create({
  strip: {
    borderRadius: RADIUS.sheet,
    backgroundColor: COLOR.surface,
    paddingTop: SPACE.md,
    paddingHorizontal: STRIP_IN,
    paddingBottom: STRIP_IN,
    gap: SPACE.md,
    overflow: 'hidden',
  },
  radius: { borderRadius: RADIUS.sheet },
  rim: {
    borderRadius: RADIUS.sheet,
    borderWidth: 1,
    borderColor: tint(COLOR.brandViolet, RIM),
  },
  sides: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  side: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: SIDE_GAP },
  rowTheirs: { flexDirection: 'row-reverse' },
  names: { flex: 1, minWidth: 0 },
  namesTheirs: { alignItems: 'flex-end' },
  right: { textAlign: 'right' },
  /** Narrow: the face and the name in a row, the eye line under them across the side. */
  stack: { gap: SPACE.xs },
  stackTheirs: { alignItems: 'flex-end' },
  eye: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  eyeTheirs: { justifyContent: 'flex-end' },
  mid: { width: MID, height: 1, backgroundColor: COLOR.hairlineStrong },
  ink: { color: COLOR.textPrimary },
  shrink: { flexShrink: 1 },
  waiting: { textAlign: 'center' },
  /** Show who you are hugs its label; Ask them takes the rest (`.xrev .ac .db{flex:1}` at the label's min-content). */
  actions: { flexDirection: 'row', gap: SPACE.sm },
  actionsStacked: { flexDirection: 'column' },
  rest: { flexGrow: 1 },
  full: { alignSelf: 'stretch' },
  /** The line and the action: side by side, and the action drops under it when the line needs the room. */
  both: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.sm,
  },
  bothLine: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
  },
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

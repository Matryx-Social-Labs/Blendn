import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, type SharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Icon } from '../ui/Icon'
import { COLOR, DURATION, ICON, MAX_FONT_SCALE, RADIUS, RISE, SIZE, SPACE, TYPE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { fade, MomentStage, spring, useBeats, type MomentFace } from './MomentStage'
import { font, IC_HAIRLINE, useBoldText, useIncreaseContrast, useScreenReader } from './shared'
import { QuestionCard } from './QuestionCard'

/** M-A's label over the room's question (Flow 5 board `xMatch`). */
const START_WITH = 'Start with tonight’s question'
/** The faces, on the Avatar scale (the page draws 104; the scale's nearest is 112). They overlap by 16. */
const FACE = 112
const MEET = SPACE.lg
const ROW = 2 * FACE - MEET
/** #11: faces slide from ±120 pt on `M.pop` and meet at ~450 ms. */
const FACE_FROM = 120
/** #11: three outlined hearts arc from your face to theirs, 560 ms each, three heights so they read as thrown. */
const HEARTS = [
  { lift: 72, size: ICON.control, at: 260 },
  { lift: 104, size: ICON.nav, at: 350 },
  { lift: 56, size: ICON.inline, at: 440 },
] as const
const HEART_MS = 560
/** #11: at ~1000 ms their face bumps to 1.08 and `H.match` lands on that frame. */
const LAND_MS = 1000
const BUMP = 1.08
const BUMP_MS = 110
/** #11: the text at +420 ms; Say hi at ~1100 ms, tappable once visible. */
const TEXT_AT = 420
const ACTIONS_AT = 1100
/** journey/screens.js `matchStage`: the scrim at 78% over the orbs; the orbs lift once, then settle at 75%. */
const SCRIM = 0.78
const ORBS_REST = 0.75
/** M-A (`.xmatch`): one centred column, 32 in; the faces in a 120 band, the title 18 under it, then 8, 22, 22. */
const FACES_BAND = (120 - FACE) / 2
// design-exception: the board's title sits 18 under the faces' band (`.xmatch h3` margin-top), off the SPACE scale
const TITLE_GAP = 18
// design-exception: 22 between the line, the question and Say hi (`.xmatch .xq`, `.db` margin-top)
const BLOCK_GAP = 22
/**
 * Keep looking is a text link on the board, 12 under Say hi; here it is a 48 pt button, so its box is centred on that
 * text and its overhang is taken back, above and below, so the column centres as the board's does.
 */
const LINK_TRIM = (SIZE.control - TYPE.button.lineHeight) / 2

export type MomentMatchProps = {
  /** Your face as they know you here: a photo only if you are named to them, else your creature. */
  you: MomentFace
  /** Theirs: a photo only if they are named to you. The moment never shows what either person hid. */
  them: MomentFace
  /** The name the room shows you for them: their pseudonym unless they are named to you. */
  name: string
  /** Why you two: "Both into live music". */
  reason?: string | null
  /** A first line to try, from what you share. Not shown when the room asks a question (`question` is the opener then). */
  opener?: string | null
  /** M-A: the room's question (`lens.question`), offered as the opener; null or absent falls back to today's moment. */
  question?: string | null
  onSayHi: () => void
  /** Keep looking, and system back. */
  onClose: () => void
  testID?: string
}

/**
 * It's mutual (guidelines/components/MomentMatch.html, DESIGN-BRIEF §9.3 #11,
 * ROUND3 D · 4.4): the moment the product is built toward. L4, ≤ 1.2 s, then
 * still until you choose.
 *
 * Scrim and orbs lift; your face and theirs slide in on `M.pop` and meet;
 * three hearts arc from you into them; their face bumps as the last lands and
 * `H.match` (the app's one signature) plays on that frame. A tap anywhere
 * skips to the end, the haptic with it. Everything is in the accessibility
 * tree from t0; Say hi goes live once it shows (at once with a screen reader).
 *
 * Reduce Motion: the faces placed, no hearts, `H.match` at once, a 200 ms fade.
 */
export function MomentMatch({ you, them, name, reason, opener, question, onSayHi, onClose, testID }: MomentMatchProps) {
  const reduceMotion = useReducedMotion()
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const screenReader = useScreenReader()
  const insets = useSafeAreaInsets()
  const { duration } = motionTokens(reduceMotion)

  const scrim = useSharedValue(0)
  const orbs = useSharedValue(0)
  const youX = useSharedValue(reduceMotion ? 0 : -FACE_FROM)
  const themX = useSharedValue(reduceMotion ? 0 : FACE_FROM)
  const bump = useSharedValue(1)
  const heart0 = useSharedValue(0)
  const heart1 = useSharedValue(0)
  const heart2 = useSharedValue(0)
  const hearts = [heart0, heart1, heart2]
  const text = useSharedValue(0)
  const rise = useSharedValue(reduceMotion ? 0 : RISE.list)
  const actions = useSharedValue(0)
  const [live, setLive] = useState(false)

  const [onStage, setOnStage] = useState(false)
  useEffect(() => {
    if (!onStage) return
    if (reduceMotion) {
      scrim.set(fade(1, duration.base))
      orbs.set(fade(ORBS_REST, duration.base))
      text.set(fade(1, duration.base))
      actions.set(fade(1, duration.base, duration.base))
      return
    }
    scrim.set(fade(1, DURATION.base))
    orbs.set(withSequence(fade(1, DURATION.medium), fade(ORBS_REST, DURATION.long)))
    youX.set(spring(0, 'pop'))
    themX.set(spring(0, 'pop'))
    HEARTS.forEach(({ at }, i) => hearts[i].set(fade(1, HEART_MS, at, 'standard')))
    bump.set(withDelay(LAND_MS, withSequence(fade(BUMP, BUMP_MS, 0, 'standard'), spring(1, 'snap'))))
    text.set(fade(1, DURATION.base, TEXT_AT))
    rise.set(spring(0, 'celebrate', TEXT_AT))
    actions.set(fade(1, DURATION.quick, ACTIONS_AT))
    // Once, as it appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onStage])

  const skipBeats = useBeats([
    { at: reduceMotion ? 0 : LAND_MS, run: () => H.match() },
    // Live once fully shown, so a skip tap at the foot of the screen never lands on a half-faded Say hi.
    { at: reduceMotion ? 2 * duration.base : ACTIONS_AT + DURATION.quick, run: () => setLive(true) },
  ], onStage)
  const skip = () => {
    scrim.set(1)
    orbs.set(ORBS_REST)
    youX.set(0)
    themX.set(0)
    bump.set(1)
    hearts.forEach((h) => h.set(1))
    text.set(1)
    rise.set(0)
    actions.set(1)
    skipBeats()
  }

  const youStyle = useAnimatedStyle(() => ({ transform: [{ translateX: youX.get() }] }))
  const themStyle = useAnimatedStyle(() => ({ transform: [{ translateX: themX.get() }, { scale: bump.get() }] }))
  const textStyle = useAnimatedStyle(() => ({ opacity: text.get(), transform: [{ translateY: rise.get() }] }))
  const actionsStyle = useAnimatedStyle(() => ({ opacity: actions.get() }))

  // M-A: with the room's question, the board's line and the question as the opener; without, today's (M-B).
  const why = question ? `You and ${name} liked each other.` : `You and ${name} matched${reason ? ` · ${reason}` : ''}`
  const label = question
    ? `It’s mutual. ${why} ${START_WITH}: ${question}`
    : `It’s mutual. You and ${name} matched${reason ? `, ${reason}` : ''}.${opener ? ` Try: ${opener}` : ''}`
  const secondary = contrast ? COLOR.textPrimary : COLOR.textSecondary

  return (
    <MomentStage testID={testID} onShown={() => setOnStage(true)} label={label} scrimAlpha={SCRIM} scrim={scrim} orbs="moment" orbsOpacity={orbs} onSkip={skip} onBack={() => {
        skip()
        onClose()
      }}>
      {/* Even insets above and below, so the column centres on the screen as the board's does. */}
      <View pointerEvents="box-none" style={[styles.page, { paddingVertical: Math.max(insets.top, insets.bottom) }]}>
        <View pointerEvents="box-none" style={styles.body}>
          {/* Nothing here is a button: a tap on the faces or the words falls through to skip. */}
          <View testID={testID && `${testID}-faces`} pointerEvents="none" style={styles.faces}>
            <Animated.View style={[styles.you, youStyle]}>
              <Avatar {...you} size={FACE} ring={COLOR.ink} testID={testID && `${testID}-you`} />
            </Animated.View>
            <Animated.View style={[styles.them, themStyle]}>
              <Avatar {...them} size={FACE} ring={COLOR.ink} testID={testID && `${testID}-them`} />
            </Animated.View>
            {reduceMotion ? null : HEARTS.map((h, i) => <Heart key={i} progress={hearts[i]} lift={h.lift} size={h.size} testID={testID && `${testID}-heart-${i}`} />)}
          </View>
          <Animated.View testID={testID && `${testID}-copy`} pointerEvents="none" style={[styles.copy, textStyle]}>
            <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE.display} style={[font('display', bold), styles.centre]}>
              It’s mutual
            </Text>
            <Text testID={testID && `${testID}-why`} maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.centre, { color: secondary }]}>
              {why}
            </Text>
            {question ? (
              <View style={styles.question}>
                <QuestionCard label={START_WITH} text={question} testID={testID && `${testID}-question`} />
              </View>
            ) : opener ? (
              <View testID={testID && `${testID}-opener`} style={[styles.opener, contrast && IC_HAIRLINE]}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE.label} style={[font('label', bold), { color: secondary }]}>
                  TRY
                </Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.ink]}>
                  {`“${opener}”`}
                </Text>
              </View>
            ) : null}
          </Animated.View>
          <Animated.View
            testID={testID && `${testID}-actions`}
            pointerEvents={live || screenReader ? 'box-none' : 'none'}
            style={[styles.actions, actionsStyle]}
          >
            <Button label="Say hi" icon="message-circle" onPress={onSayHi} testID={testID && `${testID}-say-hi`} />
            <Button label="Keep looking" kind="tertiary" size="md" muted onPress={onClose} style={styles.link} testID={testID && `${testID}-keep-looking`} />
          </Animated.View>
        </View>
      </View>
    </MomentStage>
  )
}

/** One heart on a parabola from your face's centre to theirs; it grows in its first 30% and shrinks into their face in its last 20%. */
function Heart({ progress, lift, size, testID }: { progress: SharedValue<number>; lift: number; size: number; testID?: string }) {
  const style = useAnimatedStyle(() => {
    const t = progress.get()
    const x = FACE / 2 + (ROW - FACE) * t
    const y = FACE / 2 - 4 * lift * t * (1 - t)
    const scale = t < 0.3 ? 0.5 + 0.5 * (t / 0.3) : t > 0.8 ? Math.max(0, 1 - (t - 0.8) / 0.2) : 1
    return { opacity: t > 0 && t < 1 ? 1 : 0, transform: [{ translateX: x - size / 2 }, { translateY: y - size / 2 }, { scale }] }
  })
  return (
    <Animated.View testID={testID} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.heart, style]}>
      {/* White, outlined: Say hi is the one gradient here. */}
      <Icon name="heart" size={size} />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: SPACE.xxl },
  faces: { width: ROW, height: FACE, marginVertical: FACES_BAND, alignSelf: 'center' },
  you: { position: 'absolute', left: 0, top: 0 },
  them: { position: 'absolute', left: FACE - MEET, top: 0 },
  heart: { position: 'absolute', left: 0, top: 0 },
  copy: { alignSelf: 'stretch', alignItems: 'center', marginTop: TITLE_GAP, gap: SPACE.sm },
  centre: { textAlign: 'center', color: COLOR.textPrimary },
  ink: { color: COLOR.textPrimary },
  question: { alignSelf: 'stretch', marginTop: BLOCK_GAP - SPACE.sm },
  opener: {
    alignSelf: 'stretch',
    marginTop: SPACE.lg,
    borderRadius: RADIUS.rowInCard,
    backgroundColor: COLOR.surface,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    gap: SPACE.xs,
  },
  actions: { marginTop: BLOCK_GAP },
  link: { marginTop: SPACE.md - LINK_TRIM, marginBottom: -LINK_TRIM },
})

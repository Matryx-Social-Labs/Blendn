import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Icon } from '../ui/Icon'
import { COLOR, DURATION, FONT_FAMILY, MAX_FONT_SCALE, RADIUS, RISE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { fade, MomentStage, spring, useBeats, type MomentFace } from './MomentStage'
import { font, IC_HAIRLINE, useBoldText, useIncreaseContrast, useScreenReader } from './shared'

/** The faces, on the Avatar scale (the page draws 104; the scale's nearest is 112). They overlap by 16. */
const FACE = 112
const MEET = SPACE.lg
const ROW = 2 * FACE - MEET
/** #11: faces slide from ±120 pt on `M.pop` and meet at ~450 ms. */
const FACE_FROM = 120
/** Wave M-A (07-motion): two hands rise from the faces as they meet (450 ms) and touch over them at 850 ms, a high five. */
const HAND = 40
const HAND_RISE = 24
const HAND_FROM = 16
const HANDS_AT = 450
const HANDS_MS = 400
/** The touch: three short strokes flash over the hands (07-motion's "\ | /"). */
const TOUCH_AT = HANDS_AT + HANDS_MS
const SPARK = { width: 2, height: 10, turn: 28 } as const
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

export type MomentMatchProps = {
  /** Your face as they know you here: a photo only if you are named to them, else your creature. */
  you: MomentFace
  /** Theirs: a photo only if they are named to you. The moment never shows what either person hid. */
  them: MomentFace
  /** The name the room shows you for them: their pseudonym unless they are named to you. */
  name: string
  /** Tonight's question and their answer (M-A's opener); the answer only shows because you are both in the room now. */
  tonight?: { question: string; answer?: string | null } | null
  /** A first line to try, when the room asks no question tonight. */
  opener?: string | null
  onSayHi: () => void
  /** Keep looking, and system back. */
  onClose: () => void
  testID?: string
}

/**
 * You both waved (Wave M-A, SCRUM-1042; was MomentMatch #11, ROUND3 D · 4.4): the moment the product is built toward,
 * now opened by a mutual wave. L4, ≤ 1.2 s, then still until you choose.
 *
 * Scrim and orbs lift; your face and theirs slide in on `M.pop` and meet; two hands (yours rose, theirs violet) rise
 * from the faces and touch over them at 850 ms; their face bumps and `H.match` (the app's one signature) plays on that
 * frame. The opener is tonight's question with their answer, else a line to try. A tap anywhere skips to the end, the
 * haptic with it. Everything is in the accessibility tree from t0; Say hi goes live once it shows (at once with a
 * screen reader).
 *
 * Reduce Motion: faces and hands placed, no strokes, `H.match` at once, a 200 ms crossfade.
 */
export function MomentMatch({ you, them, name, tonight, opener, onSayHi, onClose, testID }: MomentMatchProps) {
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
  const hands = useSharedValue(reduceMotion ? 1 : 0)
  const spark = useSharedValue(0)
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
    hands.set(fade(1, HANDS_MS, HANDS_AT, 'standard'))
    spark.set(fade(1, DURATION.quick, TOUCH_AT))
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
    hands.set(1)
    spark.set(1)
    text.set(1)
    rise.set(0)
    actions.set(1)
    skipBeats()
  }

  const youStyle = useAnimatedStyle(() => ({ transform: [{ translateX: youX.get() }] }))
  const themStyle = useAnimatedStyle(() => ({ transform: [{ translateX: themX.get() }, { scale: bump.get() }] }))
  const textStyle = useAnimatedStyle(() => ({ opacity: text.get(), transform: [{ translateY: rise.get() }] }))
  const actionsStyle = useAnimatedStyle(() => ({ opacity: actions.get() }))
  // Rise from below the faces and slide in from the sides until they touch. A worklet: only shared values and numbers.
  const youHand = useAnimatedStyle(() => {
    const t = hands.get()
    return { opacity: t, transform: [{ translateX: -HAND_FROM * (1 - t) }, { translateY: HAND_RISE * (1 - t) }] }
  })
  const themHand = useAnimatedStyle(() => {
    const t = hands.get()
    return { opacity: t, transform: [{ translateX: HAND_FROM * (1 - t) }, { translateY: HAND_RISE * (1 - t) }, { scaleX: -1 }] }
  })
  const sparkStyle = useAnimatedStyle(() => ({ opacity: spark.get() }))

  const why = `You and ${name} · anonymous chat open`
  const answer = tonight?.answer?.trim() || null
  const said = tonight
    ? ` Start with tonight’s question: ${tonight.question}${answer ? ` ${name} said: ${answer}` : ''}`
    : opener
      ? ` Try: ${opener}`
      : ''
  const label = `You both waved. You and ${name}, anonymous chat open.${said}`
  const secondary = contrast ? COLOR.textPrimary : COLOR.textSecondary

  return (
    <MomentStage testID={testID} onShown={() => setOnStage(true)} label={label} scrimAlpha={SCRIM} scrim={scrim} orbs="moment" orbsOpacity={orbs} onSkip={skip} onBack={() => {
        skip()
        onClose()
      }}>
      {/* One scroll for the words and the buttons: at the largest text they cannot overlap; at any other size it never moves. */}
      <ScrollView
        testID={testID && `${testID}-scroll`}
        style={styles.page}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top }]}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <View pointerEvents="box-none" style={styles.body}>
          {/* Nothing here is a button: a tap on the faces or the words falls through to skip. */}
          <View testID={testID && `${testID}-faces`} pointerEvents="none" style={styles.stage}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.hands}>
              {reduceMotion ? null : (
                <Animated.View testID={testID && `${testID}-spark`} style={[styles.spark, sparkStyle]}>
                  {[-SPARK.turn, 0, SPARK.turn].map((turn) => (
                    <View key={turn} style={[styles.stroke, { transform: [{ rotate: `${turn}deg` }] }]} />
                  ))}
                </Animated.View>
              )}
              <Animated.View testID={testID && `${testID}-hand-you`} style={youHand}>
                <Icon name="hand" size={HAND} color={COLOR.brandRose} />
              </Animated.View>
              <Animated.View testID={testID && `${testID}-hand-them`} style={themHand}>
                <Icon name="hand" size={HAND} color={COLOR.selectionVioletGlyph} />
              </Animated.View>
            </View>
            <View style={styles.faces}>
              <Animated.View style={[styles.you, youStyle]}>
                <Avatar {...you} size={FACE} ring={COLOR.ink} testID={testID && `${testID}-you`} />
              </Animated.View>
              <Animated.View style={[styles.them, themStyle]}>
                <Avatar {...them} size={FACE} ring={COLOR.ink} testID={testID && `${testID}-them`} />
              </Animated.View>
            </View>
          </View>
          <Animated.View testID={testID && `${testID}-copy`} pointerEvents="none" style={[styles.copy, textStyle]}>
            <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE.moment} style={[font('moment', bold), styles.centre]}>
              You both waved
            </Text>
            <Text testID={testID && `${testID}-why`} maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.centre, { color: secondary }]}>
              {why}
            </Text>
            {tonight ? (
              <View testID={testID && `${testID}-opener`} style={[styles.opener, contrast && IC_HAIRLINE]}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE.label} style={[font('label', bold), { color: COLOR.selectionRoseGlyph }]}>
                  START WITH TONIGHT’S QUESTION
                </Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold, FONT_FAMILY.brand[500]), styles.ink]}>
                  {tonight.question}
                </Text>
                {answer ? (
                  // A long answer clamps at three lines; the buttons never move (M-A worst case).
                  <Text numberOfLines={3} maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('meta', bold), { color: secondary }]}>
                    {`${name}: “${answer}”`}
                  </Text>
                ) : null}
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
        </View>
        <Animated.View
          testID={testID && `${testID}-actions`}
          pointerEvents={live || screenReader ? 'box-none' : 'none'}
          style={[styles.actions, { paddingBottom: insets.bottom + SPACE.xl }, actionsStyle]}
        >
          {/* The DS primary with the board's chat glyph (owner ruling 2026-11-13). */}
          <Button label="Say hi" icon="message-circle" onPress={onSayHi} testID={testID && `${testID}-say-hi`} />
          <Button label="Keep looking" kind="tertiary" onPress={onClose} testID={testID && `${testID}-keep-looking`} />
        </Animated.View>
      </ScrollView>
    </MomentStage>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  scroll: { flexGrow: 1 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.gutter, gap: SPACE.xl },
  stage: { alignItems: 'center', gap: SPACE.sm },
  hands: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', height: HAND + SPARK.height + SPACE.xs },
  spark: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: SPACE.xs },
  stroke: { width: SPARK.width, height: SPARK.height, borderRadius: RADIUS.capsule, backgroundColor: COLOR.textPrimary },
  faces: { width: ROW, height: FACE },
  you: { position: 'absolute', left: 0, top: 0 },
  them: { position: 'absolute', left: FACE - MEET, top: 0 },
  copy: { alignSelf: 'stretch', alignItems: 'center', gap: SPACE.sm },
  centre: { textAlign: 'center', color: COLOR.textPrimary },
  ink: { color: COLOR.textPrimary },
  opener: {
    alignSelf: 'stretch',
    marginTop: SPACE.lg,
    borderRadius: RADIUS.rowInCard,
    backgroundColor: COLOR.surface,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    gap: SPACE.xs,
  },
  actions: { paddingHorizontal: SPACE.gutter, gap: SPACE.sm },
})

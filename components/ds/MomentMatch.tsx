import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, type SharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Icon } from '../ui/Icon'
import { COLOR, DURATION, ICON, MAX_FONT_SCALE, RADIUS, RISE, SPACE } from '../../lib/design/tokens'
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

export type MomentMatchProps = {
  /** Your face as they know you here: a photo only if you are named to them, else your creature. */
  you: MomentFace
  /** Theirs: a photo only if they are named to you. The moment never shows what either person hid. */
  them: MomentFace
  /** The name the room shows you for them: their pseudonym unless they are named to you. */
  name: string
  /** Why you two: "Both into live music". */
  reason?: string | null
  /** A first line to try, from what you share. */
  opener?: string | null
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
export function MomentMatch({ you, them, name, reason, opener, onSayHi, onClose, testID }: MomentMatchProps) {
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

  useEffect(() => {
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
  }, [])

  const skipBeats = useBeats([
    { at: reduceMotion ? 0 : LAND_MS, run: () => H.match() },
    { at: reduceMotion ? duration.base : ACTIONS_AT, run: () => setLive(true) },
  ])
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

  const why = `You and ${name} matched${reason ? ` · ${reason}` : ''}`
  const label = `It’s mutual. You and ${name} matched${reason ? `, ${reason}` : ''}.${opener ? ` Try: ${opener}` : ''}`
  const secondary = contrast ? COLOR.textPrimary : COLOR.textSecondary

  return (
    <MomentStage testID={testID} label={label} scrimAlpha={SCRIM} scrim={scrim} orbs="moment" orbsOpacity={orbs} onSkip={skip} onBack={onClose}>
      <View pointerEvents="box-none" style={[styles.page, { paddingTop: insets.top }]}>
        <View pointerEvents="box-none" style={styles.body}>
          <View style={styles.faces}>
            <Animated.View style={[styles.you, youStyle]}>
              <Avatar {...you} size={FACE} ring={COLOR.ink} testID={testID && `${testID}-you`} />
            </Animated.View>
            <Animated.View style={[styles.them, themStyle]}>
              <Avatar {...them} size={FACE} ring={COLOR.ink} testID={testID && `${testID}-them`} />
            </Animated.View>
            {reduceMotion ? null : HEARTS.map((h, i) => <Heart key={i} progress={hearts[i]} lift={h.lift} size={h.size} testID={testID && `${testID}-heart-${i}`} />)}
          </View>
          <Animated.View pointerEvents="box-none" style={[styles.copy, textStyle]}>
            <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE.moment} style={[font('moment', bold), styles.centre]}>
              It’s mutual
            </Text>
            <Text testID={testID && `${testID}-why`} maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.centre, { color: secondary }]}>
              {why}
            </Text>
            {opener ? (
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
          <Button label="Say hi" onPress={onSayHi} testID={testID && `${testID}-say-hi`} />
          <Button label="Keep looking" kind="tertiary" onPress={onClose} testID={testID && `${testID}-keep-looking`} />
        </Animated.View>
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
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.gutter, gap: SPACE.xl },
  faces: { width: ROW, height: FACE },
  you: { position: 'absolute', left: 0, top: 0 },
  them: { position: 'absolute', left: FACE - MEET, top: 0 },
  heart: { position: 'absolute', left: 0, top: 0 },
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

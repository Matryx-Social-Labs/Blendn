import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSequence } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { COLOR, DURATION, MAX_FONT_SCALE, SPACE, TYPE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { DiscMark, MONOGRAM_ASPECT } from './DiscMark'
import { fade, MomentStage, spring, useBeats } from './MomentStage'
import { font, minTarget, useBoldText } from './shared'

/** flow2.js `ready`: the mark at 120 over a 35% scrim. */
const MARK_HEIGHT = 120
const MARK_WIDTH = MARK_HEIGHT * MONOGRAM_ASPECT
const SCRIM = 0.35
/** Flow 2: the mark assembles on `M.pop` from 80 ms (0.6 → 1, a circle opening on it), so it completes at ~530 ms. */
const MARK_AT = 80
const MARK_FROM = 0.6
const MARK_DONE = 530
/** The orbs brighten once: up over 400 ms, back over 600 from 700 (the page's 0.45 → 1 → 0.45 on the screen's orbs, drawn here as the lift over them). */
const ORBS_PEAK = 0.55
const ORBS_UP_MS = 400
const ORBS_BACK_AT = 700
const ORBS_BACK_MS = 600
/** "1.3 s in all", then the replace; under Reduce Motion the mark fades in 200 and the replace follows at 500. */
const DONE_MS = 1300
const DONE_MS_REDUCED = 500
/** The circle that opens on the mark reaches 80% of the mark box's half-diagonal (the page's `circle(80%)`). */
const REVEAL = 2 * 0.8 * Math.sqrt((MARK_WIDTH ** 2 + MARK_HEIGHT ** 2) / 2)
/** The opening circle's smallest scale, so the mark's counter-scale never divides by zero. */
const REVEAL_MIN = 0.001

/**
 * The one celebration in onboarding (guidelines/components/MomentReady.html,
 * Flow 2): Start Blend'n has been confirmed by the server, so the mark
 * assembles once over a 35% scrim and goes. Never confetti. Mount it over the
 * Ready screen on the server's yes; `onDone` is the replace to Bring your
 * friends, at 1.3 s or on a tap.
 *
 * `H.success` (important) once, as the mark completes: this is the end of
 * onboarding's answer, so the caller plays none of its own.
 *
 * Reduce Motion: the mark fades in over 200 ms, the orbs hold, the haptic at once.
 */
export function MomentReady({ name, onDone, testID }: { name?: string; onDone: () => void; testID?: string }) {
  const reduceMotion = useReducedMotion()
  const bold = useBoldText()
  const insets = useSafeAreaInsets()
  const { duration } = motionTokens(reduceMotion)

  const scrim = useSharedValue(0)
  const orbs = useSharedValue(0)
  const mark = useSharedValue(reduceMotion ? 1 : MARK_FROM)
  const shown = useSharedValue(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (reduceMotion) {
      scrim.set(fade(1, duration.base))
      shown.set(fade(1, duration.base))
      return
    }
    scrim.set(fade(1, DURATION.base))
    orbs.set(withSequence(fade(ORBS_PEAK, ORBS_UP_MS), fade(0, ORBS_BACK_MS, ORBS_BACK_AT - ORBS_UP_MS)))
    shown.set(fade(1, 0, MARK_AT))
    mark.set(spring(1, 'pop', MARK_AT))
    // Once, as it appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const skipBeats = useBeats([
    { at: reduceMotion ? 0 : MARK_DONE, run: () => H.success({ important: true }) },
    {
      at: reduceMotion ? DONE_MS_REDUCED : DONE_MS,
      run: () => {
        setDone(true)
        onDone()
      },
    },
  ])
  const skip = () => {
    scrim.set(1)
    orbs.set(0)
    mark.set(1)
    shown.set(1)
    skipBeats()
  }

  const markStyle = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ scale: mark.get() }] }))
  // The circle opens as the spring passes 0.6 → 1 (the page's clip-path), and stays open past it.
  // Scaled, not resized, so nothing is laid out per frame; the mark inside is counter-scaled to hold still.
  const open = () => {
    'worklet'
    return Math.max(REVEAL_MIN, Math.min(1, (mark.get() - MARK_FROM) / (1 - MARK_FROM)))
  }
  const revealStyle = useAnimatedStyle(() => ({ transform: [{ scale: open() }] }))
  const counterStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 / open() }] }))

  return (
    <MomentStage testID={testID} label={`You’re all set${name ? `, ${name}` : ''}.`} scrimAlpha={SCRIM} scrim={scrim} orbs="brand" orbsOpacity={orbs} orbsOnInk={false} done={done} onSkip={skip}>
      {/* Not a button: a tap on the mark falls through to skip. */}
      <View testID={testID && `${testID}-centre`} pointerEvents="none" style={[StyleSheet.absoluteFill, styles.centre]}>
        <Animated.View testID={testID && `${testID}-mark`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={markStyle}>
          {reduceMotion ? (
            <DiscMark height={MARK_HEIGHT} fill="gradient" />
          ) : (
            <View style={styles.box}>
              <Animated.View style={[styles.reveal, revealStyle]}>
                <Animated.View style={counterStyle}>
                  <DiscMark height={MARK_HEIGHT} fill="gradient" />
                </Animated.View>
              </Animated.View>
            </View>
          )}
        </Animated.View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Skip"
        onPress={skip}
        hitSlop={(minTarget() - TYPE.label.lineHeight) / 2}
        style={[styles.skip, { bottom: insets.bottom + SPACE.xl }]}
      >
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.label} style={[font('label', bold), styles.hint]}>
          TAP TO SKIP
        </Text>
      </Pressable>
    </MomentStage>
  )
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  box: { width: MARK_WIDTH, height: MARK_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  reveal: { width: REVEAL, height: REVEAL, borderRadius: REVEAL / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  skip: { position: 'absolute', alignSelf: 'center' },
  hint: { color: COLOR.textSecondary },
})

import { useEffect, useState } from 'react'
import { AccessibilityInfo, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

import { COLOR, DURATION, EASING, FONT_FAMILY, RADIUS, SPACE, TYPE } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { tint } from '../../lib/theme'
import { font, minTarget, useBoldText } from './shared'

const MONOGRAM = require('../../assets/logo/monogram-gradient.png')
const MONOGRAM_WHITE = require('../../assets/logo/monogram-white.png')
/** The monogram's width / height (`app/index.tsx`). */
const MONOGRAM_ASPECT = 453 / 534

/** The spinner's track under its turning arc. */
const TRACK_ALPHA = 0.25

/**
 * The spinner inside a control (the Loader page): 16 in a 36 pt pill, 18 beside
 * a switch, 20 in a 56 pt button; `dark` on a white (strong) button. It keeps
 * turning under Reduce Motion: it is state, not decoration. Hidden from screen
 * readers; the control's busy state is what they hear.
 *
 * ponytail: one turn per `DURATION.moment`; the tokens name no spin period.
 */
export function Spinner({ size = 20, dark = false, testID }: { size?: 16 | 18 | 20; dark?: boolean; testID?: string }) {
  const turn = useSharedValue(0)
  useEffect(() => {
    turn.set(
      withRepeat(withTiming(1, { duration: DURATION.moment, easing: Easing.linear }), -1, false, undefined, ReduceMotion.Never)
    )
    return () => cancelAnimation(turn)
  }, [turn])
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get() * 360}deg` }] }))
  const ink = dark ? COLOR.ink : COLOR.textPrimary
  return (
    <Animated.View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width: size, height: size, borderRadius: RADIUS.capsule, borderWidth: SPACE.xxs, borderColor: tint(ink, TRACK_ALPHA), borderTopColor: ink },
        spin,
      ]}
    />
  )
}

/** WCAG 2.2.2: the morph stops within 5 s and a line names the wait; Try again at 10 s (motion #48). */
const STOP_AFTER_MS = 5000
const RETRY_AFTER_MS = 10000
/** The mark at 78% of the loader, the ring's stroke at 7% (min 2); the morph's scales (motion #24, #48). */
const MARK_FRACTION = 0.78
const RING_FRACTION = 0.07
const MORPH_SHRINK = 0.3

/**
 * The morphing loader (motion #24): the monogram and a circle trade places
 * while a screen or section waits. Past 5 s it stops on the static monogram and
 * a line names the wait; at 10 s a text Try again appears if `onRetry` is given
 * (#48). Nothing loops past 5 s. Reduce Motion: no morph, the static mark with
 * "Loading…" from t0, the wait line at 5 s. `ink` draws the mark in ink, for a
 * white surface.
 *
 * Screen readers hear "Loading" once, as a busy progress element; the wait
 * line is announced when it appears.
 *
 * ponytail: the morph is the export's crossfade-and-scale between the two
 * shapes, not a path morph; one half-cycle per `DURATION.medium` (the motion
 * pages say 375 and 700 ms, neither a token).
 */
export function Loader({
  size = 40,
  ink = false,
  waitLabel = 'Still loading…',
  onRetry,
  testID,
}: {
  size?: number
  ink?: boolean
  waitLabel?: string
  onRetry?: () => void
  testID?: string
}) {
  const reduceMotion = useReducedMotion()
  const bold = useBoldText()
  const [stage, setStage] = useState<'morph' | 'wait' | 'retry'>('morph')
  const morph = useSharedValue(0)

  useEffect(() => {
    const wait = setTimeout(() => setStage('wait'), STOP_AFTER_MS)
    const retry = setTimeout(() => setStage('retry'), RETRY_AFTER_MS)
    return () => {
      clearTimeout(wait)
      clearTimeout(retry)
    }
  }, [])

  useEffect(() => {
    if (reduceMotion || stage !== 'morph') {
      cancelAnimation(morph)
      morph.set(0)
      return
    }
    const half = { duration: DURATION.medium, easing: Easing.bezier(...EASING.standard) }
    morph.set(withRepeat(withTiming(1, half), -1, true))
    return () => cancelAnimation(morph)
  }, [morph, reduceMotion, stage])

  useEffect(() => {
    if (stage === 'wait' && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(waitLabel)
  }, [stage, waitLabel])

  const markStyle = useAnimatedStyle(() => ({
    opacity: 1 - morph.get(),
    transform: [{ scale: 1 - MORPH_SHRINK * morph.get() }],
  }))
  const ringStyle = useAnimatedStyle(() => ({
    opacity: morph.get(),
    transform: [{ scale: 1 + MORPH_SHRINK - MORPH_SHRINK * morph.get() }],
  }))

  const markHeight = Math.round(size * MARK_FRACTION)
  const stroke = ink ? COLOR.ink : COLOR.textPrimary
  const line = stage !== 'morph' ? waitLabel : reduceMotion ? 'Loading…' : null
  const hit = (minTarget() - TYPE.meta.lineHeight) / 2

  return (
    <View style={styles.column} testID={testID}>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Loading"
        accessibilityState={{ busy: true }}
        style={[styles.stage, { width: size, height: size }]}
      >
        <Animated.View
          testID={testID && `${testID}-ring`}
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: RADIUS.capsule,
              borderWidth: Math.max(SPACE.xxs, Math.round(size * RING_FRACTION)),
              borderColor: tint(stroke, TRACK_ALPHA),
              borderTopColor: stroke,
            },
            ringStyle,
          ]}
        />
        <Animated.View style={markStyle}>
          <Image
            source={ink ? MONOGRAM_WHITE : MONOGRAM}
            style={{ height: markHeight, width: markHeight * MONOGRAM_ASPECT, tintColor: ink ? COLOR.ink : undefined }}
            resizeMode="contain"
          />
        </Animated.View>
      </View>
      {line ? (
        <Text accessibilityLiveRegion="polite" style={[font('meta', bold), styles.line]}>
          {line}
        </Text>
      ) : null}
      {stage === 'retry' && onRetry ? (
        <Pressable accessibilityRole="button" hitSlop={hit} onPress={onRetry}>
          <Text style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.retry]}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: SPACE.md },
  stage: { alignItems: 'center', justifyContent: 'center' },
  line: { color: COLOR.textSecondary, textAlign: 'center' },
  retry: { color: COLOR.textPrimary },
})

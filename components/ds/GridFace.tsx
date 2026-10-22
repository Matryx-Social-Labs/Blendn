import { useEffect, useRef, useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'

import ScalePress from '../motion/ScalePress'
import { COLOR, EASING, FONT_FAMILY, ICON, PRESS, RADIUS, SPACE, SPRING } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { Avatar } from './Avatar'
import { FaceMark, type Face } from './Facepile'
import { HeartPop } from './HeartPop'
import { PresenceDot } from './MonoFamily'
import { CONTROL_FONT_CAP, focusRing, font, PRESSED_WASH, useBoldText, useIncreaseContrast } from './shared'

/** Someone who checked out stays in the grid at 60% (the page). */
const AWAY = 0.6
/** The live dot sits on the rim, low right: its top at 72% of the face. */
const DOT_AT = 0.72
const DOT = 12
/** A second tap inside this is a double tap: the like (Flow 4 Room). */
export const DOUBLE_TAP_MS = 250
/** #51: a wave's ring grows off the sender's face to 1.25 and fades over 600 ms. */
const WAVE_RING_TO = 1.25
const WAVE_RING_MS = 600
const WAVE_RING_WIDTH = 1.5
/** #25: an arrival's disc enters from 0.8 on `M.snap`. */
const ARRIVE_FROM = 0.8

export type GridFaceProps = {
  face: Face
  name: string
  /** One reason ("Both into vinyl"); "Was here" replaces it when they've left. */
  reason: string
  /** Matching v2's sentence (Flow 14 · 14.1): too long for the cell, so it is what a screen reader hears as the hint. */
  overlap?: string | null
  /** The column's width; the face is 16 less. */
  width: number
  here?: boolean
  liked?: boolean
  matched?: boolean
  onPress?: () => void
  /**
   * The double tap's like (Flow 4 Room: HeartPop #15, `H.like`). Given only
   * while a like can do something; a single tap then opens after
   * `DOUBLE_TAP_MS`. A screen reader likes from the actions menu.
   */
  onLike?: () => void
  /** Bump it when they wave at you: a ring grows off their face and fades (#51). */
  waveKey?: number
  /** They just walked in: the disc enters 0.8 → 1 on `M.snap`, opacity over `base` (#25). */
  arriving?: boolean
  /** The design gallery only: draws a transient state with no finger or keyboard. */
  previewState?: 'pressed' | 'focused'
  testID?: string
}

/**
 * One face in "Everyone here" (guidelines/components/GridFace.html): a face at
 * the column width less 16, the name and one reason under it. Three marks and
 * nothing else: the live dot at the rim (here now), a white heart disc (you
 * liked them), a white message disc (you matched; the dot gives way). Someone
 * who checked out stays at 60% with "Was here".
 *
 * Tap opens the PersonCard, silently; a double tap likes, with the HeartPop
 * and `H.like` (Flow 4 Room). An arrival enters on `M.snap` (#25), a wave from
 * them rings the face (#51).
 * Read "{name}, {reason}, here now", then "liked" or "matched"; "{name}, was
 * here". Name and reason cap at 1.3×, one line each; the face scales with the
 * column, not the text. Increase Contrast: the reason in white.
 */
export function GridFace({
  face,
  name,
  reason,
  overlap,
  width,
  here = true,
  liked = false,
  matched = false,
  onPress,
  onLike,
  waveKey,
  arriving = false,
  previewState,
  testID,
}: GridFaceProps) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const android = Platform.OS === 'android'
  const [focused, setFocused] = useState(false)
  const size = width - SPACE.lg
  const mark = matched ? 'matched' : liked ? 'liked' : null
  const label = [name, here ? reason : null, here ? 'here now' : 'was here', mark].filter(Boolean).join(', ')
  const { press, like, pop } = useDoubleTap(onPress, onLike)
  const enter = useArrival(arriving)

  return (
    <View testID={testID && `${testID}-scale`} style={[{ width }, previewState === 'pressed' && styles.pressed]}>
      <Animated.View style={enter}>
        <ScalePress
          testID={testID}
          onPress={press}
          // A hold opens the card at once, without the double tap's wait, and says so: `H.longPress` (the peek).
          onLongPress={() => {
            H.longPress()
            onPress?.()
          }}
          accessibilityActions={onLike ? [{ name: 'activate' }, { name: 'longpress', label: 'Like' }] : undefined}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'activate') onPress?.()
            else if (e.nativeEvent.actionName === 'longpress') like()
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          pressedScale={android ? 1 : PRESS.scale}
          android_ripple={{ color: PRESSED_WASH.android, foreground: true }}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={overlap || undefined}
          style={styles.cell}
        >
          <View style={{ width: size, height: size }}>
            <View testID={testID && `${testID}-face-wrap`} style={!here && styles.away}>
              <Avatar size={size} testID={testID && `${testID}-face`} {...face} />
            </View>
            <WaveRing waveKey={waveKey} size={size} testID={testID && `${testID}-wave-ring`} />
            <HeartPop trigger={pop} size={ICON.nav * 2} testID={testID && `${testID}-heart`} />
            {here && !mark ? (
              <View style={[styles.dot, { top: Math.round(size * DOT_AT) }]}>
                <PresenceDot kind="live" size={DOT} ring={COLOR.ink} testID={testID && `${testID}-here`} />
              </View>
            ) : null}
            {focused || previewState === 'focused'
              ? focusRing(size / 2).map((ring, i) => (
                  <View key={i} testID={i ? undefined : testID && `${testID}-focus`} pointerEvents="none" style={ring} />
                ))
              : null}
          </View>
          <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.name]}>
            {name}
          </Text>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={CONTROL_FONT_CAP}
            style={[font('caption', bold), styles.center, { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}
          >
            {here ? reason : 'Was here'}
          </Text>
          {mark ? (
            <View style={styles.mark}>
              <FaceMark kind={mark} testID={testID && `${testID}-mark`} />
            </View>
          ) : null}
        </ScalePress>
      </Animated.View>
    </View>
  )
}

/**
 * One tap opens, two like. With no `onLike` a tap opens at once; with one, the
 * first tap waits `DOUBLE_TAP_MS` for a second. `pop` counts likes, for the
 * HeartPop. ponytail: a JS timer on the Pressable rather than a gesture
 * handler, so VoiceOver's activate and the press scale stay the Pressable's.
 */
function useDoubleTap(onPress?: () => void, onLike?: () => void) {
  const [pop, setPop] = useState(0)
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current)
    },
    []
  )
  const like = () => {
    if (!onLike) return
    H.like()
    setPop((n) => n + 1)
    onLike()
  }
  const press = () => {
    if (!onLike) return onPress?.()
    if (pending.current) {
      clearTimeout(pending.current)
      pending.current = null
      like()
      return
    }
    pending.current = setTimeout(() => {
      pending.current = null
      onPress?.()
    }, DOUBLE_TAP_MS)
  }
  return { press, like, pop }
}

/** #25: 0.8 → 1 on `M.snap` and opacity over `base`, once, as the face mounts arriving. Reduce Motion: a 200 ms fade. */
function useArrival(arriving: boolean) {
  const reduceMotion = useReducedMotion()
  const [from] = useState(arriving)
  const scale = useSharedValue(from && !reduceMotion ? ARRIVE_FROM : 1)
  const opacity = useSharedValue(from ? 0 : 1)
  useEffect(() => {
    if (!from) return
    if (!reduceMotion) scale.set(withSpring(1, SPRING.snap))
    opacity.set(
      withTiming(1, {
        duration: motionTokens(reduceMotion).duration.base,
        easing: Easing.bezier(...EASING.gentle),
      })
    )
  }, [from, reduceMotion, scale, opacity])
  return useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ scale: scale.get() }],
  }))
}

/** #51 receive: a ring off the sender's face, 1 → 1.25, fading over 600 ms. Reduce Motion: none (the toast and the dock row still say it). */
function WaveRing({ waveKey, size, testID }: { waveKey?: number; size: number; testID?: string }) {
  const reduceMotion = useReducedMotion()
  const t = useSharedValue(1)
  const [first] = useState(waveKey)
  useEffect(() => {
    if (waveKey === undefined || waveKey === first || reduceMotion) return
    t.set(0)
    t.set(
      withTiming(1, {
        duration: WAVE_RING_MS,
        easing: Easing.bezier(...EASING.gentle),
      })
    )
  }, [waveKey, first, reduceMotion, t])
  const ring = useAnimatedStyle(() => ({
    opacity: 1 - t.get(),
    transform: [{ scale: 1 + (WAVE_RING_TO - 1) * t.get() }],
  }))
  if (waveKey === undefined || reduceMotion) return null
  return <Animated.View testID={testID} pointerEvents="none" style={[styles.waveRing, { width: size, height: size }, ring]} />
}

const styles = StyleSheet.create({
  pressed: { transform: [{ scale: PRESS.scale }] },
  cell: { alignItems: 'center', gap: SPACE.xs },
  away: { opacity: AWAY },
  dot: { position: 'absolute', right: 0 },
  name: { color: COLOR.textPrimary, textAlign: 'center', alignSelf: 'stretch' },
  center: { textAlign: 'center', alignSelf: 'stretch' },
  mark: { position: 'absolute', top: SPACE.xs, right: SPACE.xs },
  waveRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: RADIUS.capsule,
    borderWidth: WAVE_RING_WIDTH,
    borderColor: COLOR.textPrimary,
  },
})

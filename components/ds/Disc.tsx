import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, AppState, StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  makeMutable,
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import Svg, { Defs, Path } from 'react-native-svg'

import { COLOR, EASING, FONT_FAMILY, MATERIAL, MAX_FONT_SCALE, PRESS, RADIUS, SIZE, SPACE, SPRING, TYPE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useReducedMotion } from '../../lib/motion'
import { roomButtonAccessibilityLabel, type RoomButtonTarget } from '../../lib/roomButton'
import ScalePress from '../motion/ScalePress'
import { GradientFill } from '../ui/GradientFill'
import { Material } from '../ui/Material'
import { BrandGradient, DiscMark, MONOGRAM_OPTICAL_ASPECT } from './DiscMark'
import { DISC_FRAMES, discLook, discReentry, discTransition, type DiscChannel, type DiscFrame, type DiscStep } from './discMotion'

export type DiscProps = {
  /** What the disc shows: `roomButtonTarget()`, exactly as the tab bar's `RoomButton` takes it today. */
  target: RoomButtonTarget
  /** Opens the Blend'n overlay. The disc and (c)'s label both call it. */
  onPress: () => void
  /** The venue (c)'s label names: "Check in · {venue}". */
  venue?: string
  testID?: string
}

/** Away longer than this, coming back in (c) pulses once (ROUND3 #49). */
const AWAY_MS = 60_000
const R = SIZE.disc / 2

/** The mark is half the disc. Its ink sits 10% of its width left of its box's centre and 2.75% below (the B's bowl), so the box is nudged to put the ink on the disc's centre. */
const MARK_HEIGHT = SIZE.disc / 2
// The optical box already carries the nudge this used to add by hand (+10% of the width): centre it exactly.
const MARK_WIDTH = MARK_HEIGHT * MONOGRAM_OPTICAL_ASPECT
const MARK_LEFT = R - MARK_WIDTH / 2
const MARK_TOP = R - MARK_HEIGHT / 2 - 0.0275 * MARK_HEIGHT

/** (b)'s ring: 1.5pt, 1pt outside the disc, drawn on clockwise from 12 o'clock. Disc and ring fit the 64pt bar. */
const RING_STROKE = 1.5
const RING_R = R + 1 + RING_STROKE / 2
const RING_BOX = 2 * RING_R + RING_STROKE
const RING_C = RING_BOX / 2
const RING_LENGTH = 2 * Math.PI * RING_R
const RING_PATH = `M ${RING_C} ${RING_C - RING_R} A ${RING_R} ${RING_R} 0 1 1 ${RING_C} ${RING_C + RING_R} A ${RING_R} ${RING_R} 0 1 1 ${RING_C} ${RING_C - RING_R}`

/** (c → d)'s ripple grows from the disc's edge to 1.35× as it fades from this: the prototype's 60% white edge at 60%. */
const RIPPLE_SCALE = 1.35
const RIPPLE_PEAK = 0.36

/** The marker: 12pt on the disc's edge at ~1–2 o'clock (50° from 12), in a 2pt ink cut-out ring. */
const MARKER = 12
const CUT = SPACE.badgeRing
const MARKER_ANGLE = (50 * Math.PI) / 180
const MARKER_X = R + R * Math.sin(MARKER_ANGLE)
const MARKER_Y = R - R * Math.cos(MARKER_ANGLE)

/** (c)'s label, with the venue its pill shows, so the name a screen reader or Voice Control has matches the words on screen. */
const checkInLabel = (venue: string) => `You're at ${venue}. Check in to see who else is here`

/** (c)'s label sits this far either side of the disc at most; a long venue is truncated. */
const LABEL_REACH = SPACE.xxxl * 2
/** The label is a 32pt pill (`SIZE.tag`); its touch target is 48. */
const LABEL_SLOP = (SIZE.targetAndroid - SIZE.tag) / 2

/** The two-layer glow, still (§11.3). RN's `boxShadow`; Android draws it from API 28. */
const GLOW = MATERIAL.glowCheckIn.map(({ radius, color }) => ({ offsetX: 0, offsetY: 0, blurRadius: radius, color }))

const EASE = Object.fromEntries(
  Object.entries(EASING).map(([name, [x1, y1, x2, y2]]) => [name, Easing.bezier(x1, y1, x2, y2)])
) as Record<keyof typeof EASING, ReturnType<typeof Easing.bezier>>

/** The plan chose the Reduce Motion path already, so nothing here is skipped by the system setting. */
const NEVER = ReduceMotion.Never

function animation({ to, from, delay = 0, spring, duration = 0, easing = 'linear' }: DiscStep) {
  const move = spring
    ? withSpring(to, { ...SPRING[spring], reduceMotion: NEVER })
    : withTiming(to, { duration, easing: EASE[easing], reduceMotion: NEVER })
  const played = from === undefined ? move : withSequence(NEVER, withTiming(from, { duration: 0 }), move)
  return withDelay(delay, played, NEVER)
}

type Values = Record<DiscChannel, ReturnType<typeof makeMutable<number>>>
const play = (values: Values, steps: DiscStep[]) => steps.forEach((s) => values[s.channel].set(animation(s)))
const mutables = (frame: DiscFrame) =>
  Object.fromEntries(Object.entries(frame).map(([channel, value]) => [channel, makeMutable(value)])) as Values

const useOpacity = (value: SharedValue<number>) => useAnimatedStyle(() => ({ opacity: value.get() }))
const AnimatedPath = Animated.createAnimatedComponent(Path)

/**
 * The centre Blend'n disc (DESIGN-BRIEF §11): 56pt, in the middle of the tab
 * bar, and the app's state at a glance — (a) idle, (b) today, (c) check-in,
 * (d) live, (d) with an unread count.
 *
 * Variant A, "the disc fills": an ink disc with the gradient mark until you
 * can check in, then the gradient pours in and the mark turns ink. Every
 * state differs by value and shape, never colour alone, so each one reads as
 * a still. Moves between them are in `discMotion.ts`, played on the UI thread.
 *
 * Tapping always opens the Blend'n overlay. `H.disc` on press-in is the only
 * haptic the disc makes; (c → d)'s `H.success` belongs to the check-in's
 * server answer, not here.
 */
export function Disc({ target, onPress, venue, testID = 'disc' }: DiscProps) {
  const reduceMotion = useReducedMotion()
  const look = discLook(target)
  // One shared value per channel, made once: eleven `useSharedValue`s by another name.
  const [v] = useState(() => mutables(DISC_FRAMES[look]))
  useEffect(() => () => Object.values(v).forEach(cancelAnimation), [v])
  const shown = useRef(look)

  // The pill keeps its last count while it pops out.
  const [count, setCount] = useState(target.badge)
  if (target.badge > 0 && target.badge !== count) setCount(target.badge)

  useEffect(() => {
    const from = shown.current
    if (from === look) return
    shown.current = look
    play(v, discTransition(from, look, reduceMotion))
    // Politely: queued behind whatever is being read, not over it.
    if (look === 'c') {
      AccessibilityInfo.announceForAccessibilityWithOptions(`You're at ${venue ?? 'an event'}. Check in from the Blend'n button.`, { queue: true })
    }
  }, [look, reduceMotion, v, venue])

  // Back in (c) after a while away: the pulse again, at most once per foreground.
  useEffect(() => {
    if (look !== 'c') return
    let leftAt: number | null = null
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        leftAt ??= Date.now()
        return
      }
      if (leftAt !== null && Date.now() - leftAt > AWAY_MS) play(v, discReentry(reduceMotion))
      leftAt = null
    })
    return () => sub.remove()
  }, [look, reduceMotion, v])

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: v.pulse.get() }] }))
  // Reduce Motion fades the gradient in place instead of raising it.
  const fillStyle = useAnimatedStyle(() =>
    reduceMotion ? { opacity: v.fill.get() } : { transform: [{ translateY: (1 - v.fill.get()) * SIZE.disc }] }
  )
  const gradientMarkStyle = useAnimatedStyle(() => ({ opacity: 1 - v.ink.get() }))
  const inkMarkStyle = useOpacity(v.ink)
  const glowStyle = useOpacity(v.glow)
  const ringStyle = useOpacity(v.ring)
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: RING_LENGTH * (1 - v.ringDraw.get()) }))
  const rippleStyle = useAnimatedStyle(() => ({
    opacity: RIPPLE_PEAK * (1 - v.ripple.get()),
    transform: [{ scale: 1 + (RIPPLE_SCALE - 1) * v.ripple.get() }],
  }))
  const cutOutStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, v.hollow.get() + v.dot.get()) }))
  const hollowStyle = useOpacity(v.hollow)
  const dotStyle = useOpacity(v.dot)
  const pillStyle = useAnimatedStyle(() => ({ opacity: v.pill.get(), transform: [{ scale: v.pillScale.get() }] }))

  return (
    <View style={styles.slot}>
      {look === 'c' ? <CheckInLabel venue={venue} onPress={onPress} testID={`${testID}-label`} /> : null}
      <ScalePress
        onPress={onPress}
        pressedScale={PRESS.scaleDisc}
        haptic={H.disc}
        accessibilityRole="button"
        accessibilityLabel={look === 'c' && venue ? checkInLabel(venue) : roomButtonAccessibilityLabel(target)}
        style={styles.slot}
        testID={testID}
      >
        <Animated.View style={[styles.slot, pulseStyle]}>
          <Animated.View testID={`${testID}-glow`} style={[styles.glow, glowStyle]} />
          <View style={styles.disc}>
            <View style={styles.edge} />
            <Animated.View testID={`${testID}-fill`} style={[StyleSheet.absoluteFill, fillStyle]}>
              <GradientFill gradient="brand" style={StyleSheet.absoluteFill} />
            </Animated.View>
            <Animated.View testID={`${testID}-mark-gradient`} style={[styles.mark, gradientMarkStyle]}>
              <DiscMark height={MARK_HEIGHT} fill="gradient" />
            </Animated.View>
            <Animated.View testID={`${testID}-mark-ink`} style={[styles.mark, inkMarkStyle]}>
              <DiscMark height={MARK_HEIGHT} fill="ink" />
            </Animated.View>
          </View>
          <Animated.View testID={`${testID}-ring`} style={[styles.ring, ringStyle]}>
            <Svg width={RING_BOX} height={RING_BOX}>
              <Defs>
                <BrandGradient id="ring" x1="0" y1="0" x2="1" y2="1" />
              </Defs>
              <AnimatedPath
                d={RING_PATH}
                fill="none"
                stroke="url(#ring)"
                strokeWidth={RING_STROKE}
                strokeDasharray={RING_LENGTH}
                animatedProps={ringProps}
              />
            </Svg>
          </Animated.View>
          <Animated.View testID={`${testID}-ripple`} style={[styles.ripple, rippleStyle]} />
          <Animated.View style={[styles.cutOut, cutOutStyle]} />
          <Animated.View testID={`${testID}-hollow`} style={[styles.marker, styles.hollow, hollowStyle]} />
          <Animated.View testID={`${testID}-dot`} style={[styles.marker, styles.dot, dotStyle]} />
          {count > 0 ? (
            <Animated.View testID={`${testID}-pill`} style={[styles.pillRing, pillStyle]}>
              <View style={styles.pill}>
                {/* A fixed 18pt badge; the count is in the disc's label at any text size. */}
                <Text style={styles.pillText} maxFontSizeMultiplier={1}>
                  {count > 9 ? '9+' : String(count)}
                </Text>
              </View>
            </Animated.View>
          ) : null}
        </Animated.View>
      </ScalePress>
    </View>
  )
}

/**
 * (c)'s persistent label above the disc. Tapping it is tapping the disc. Glass,
 * so it is mounted rather than faded (glass never fades, §5.2). Hidden from
 * screen readers: the disc says the same, with the consequence.
 */
function CheckInLabel({ venue, onPress, testID }: { venue?: string; onPress: () => void; testID: string }) {
  return (
    <View style={styles.labelSlot} pointerEvents="box-none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <ScalePress onPress={onPress} haptic={H.disc} hitSlop={LABEL_SLOP} testID={testID}>
        <Material role="toast" style={styles.label}>
          <Text style={styles.labelText} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.caption}>
            {venue ? `Check in · ${venue}` : 'Check in'}
          </Text>
        </Material>
      </ScalePress>
    </View>
  )
}

const circle = (size: number, centreX: number, centreY: number) => ({
  position: 'absolute' as const,
  left: centreX - size / 2,
  top: centreY - size / 2,
  width: size,
  height: size,
  borderRadius: RADIUS.capsule,
})

const styles = StyleSheet.create({
  slot: { width: SIZE.disc, height: SIZE.disc },
  // Behind the disc, which covers its ink; only the shadow shows.
  glow: { ...StyleSheet.absoluteFill, borderRadius: RADIUS.disc, backgroundColor: COLOR.ink, boxShadow: GLOW },
  disc: { ...StyleSheet.absoluteFill, borderRadius: RADIUS.disc, backgroundColor: COLOR.ink, overflow: 'hidden' },
  // `ink` + `hairlineStrong` edge in (a)/(b); the fill covers it.
  edge: { ...StyleSheet.absoluteFill, borderRadius: RADIUS.disc, borderWidth: 1, borderColor: COLOR.hairlineStrong },
  mark: { position: 'absolute', left: MARK_LEFT, top: MARK_TOP },
  ring: { position: 'absolute', left: R - RING_C, top: R - RING_C },
  ripple: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS.disc,
    borderWidth: RING_STROKE,
    borderColor: COLOR.textPrimary,
  },
  // A ring, not a disc: (c)'s hollow marker shows the gradient through its middle.
  cutOut: { ...circle(MARKER + 2 * CUT, MARKER_X, MARKER_Y), borderWidth: CUT, borderColor: COLOR.ink },
  marker: circle(MARKER, MARKER_X, MARKER_Y),
  hollow: { borderWidth: CUT, borderColor: COLOR.textPrimary },
  dot: { backgroundColor: COLOR.live },
  // §11.2 rule 6: white, ink digits, a 2pt ink cut-out ring; never red on the gradient.
  pillRing: {
    position: 'absolute',
    left: MARKER_X - SIZE.badge / 2 - CUT,
    top: MARKER_Y - SIZE.badge / 2 - CUT,
    padding: CUT,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.ink,
  },
  pill: {
    minWidth: SIZE.badge,
    height: SIZE.badge,
    paddingHorizontal: SPACE.xs,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { ...TYPE.label, fontFamily: FONT_FAMILY.mono[700], fontVariant: ['tabular-nums'], color: COLOR.ink },
  labelSlot: {
    position: 'absolute',
    bottom: SIZE.disc + SPACE.sm,
    left: -LABEL_REACH,
    right: -LABEL_REACH,
    alignItems: 'center',
  },
  label: { paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderRadius: RADIUS.capsule },
  labelText: { ...TYPE.caption, color: COLOR.textPrimary },
})

import { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type ViewStyle } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { COLOR, DURATION, EASING, FONT_FAMILY, MATERIAL, PRESS, RADIUS, SIZE, SPACE, SPRING } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { OPACITY } from '../../lib/theme'
import { monoCaption } from './MonoFamily'
import { CONTROL_FONT_CAP, focusRing, font, trackFill, useBoldText, useGround, useIncreaseContrast, useScreenReader } from './shared'

/** Under a finger, a segment the thumb isn't on dims before the thumb moves (the page's pressed state). */
const PRESSED_SEGMENT = 0.7
/** Past either end the thumb follows the finger at a resisting rate (the sweep's switch.html). */
const RUBBER = 0.55
/** A flick's speed counts for this long when the thumb picks where to land. */
const FLICK_SECONDS = 0.12
/** A drag claims the touch past 10 pt sideways, and gives it up past 10 pt up or down: a tap and a scroll are never taken. */
const DRAG_ACTIVE_X = 10
const DRAG_FAIL_Y = 10
const BADGE_GAP = SPACE.xs + SPACE.xxs
const DOT = 8
const DIVIDER_HEIGHT = 20

/** How far past an end (in segments) the thumb is shown for `over` segments of finger travel. */
export const rubberBand = (over: number) => {
  'worklet'
  return (over * RUBBER) / (1 + RUBBER * Math.abs(over))
}

/** The segment a drag lets go on: where it is, plus a short run of its speed, kept inside the control. */
export const landOn = (x: number, velocityX: number, segmentWidth: number, count: number) => {
  'worklet'
  return Math.min(count - 1, Math.max(0, Math.round(x + (velocityX / segmentWidth) * FLICK_SECONDS)))
}

export type SegmentBadge = number | 'dot' | null

/** A this-or-that: nothing chosen is allowed (`selected` null), and tapping the chosen side clears it (`onChange(null)`). Only a pair clears. */
type Choice =
  | { pair?: undefined; selected: number; onChange: (index: number) => void }
  | { pair: true; selected: number | null; onChange: (index: number | null) => void }

export type SegmentedControlProps = Choice & {
  /** Two or three; four options are chips or a list. */
  items: readonly string[]
  /** After a label: a count (Geist Mono) or `'dot'` (someone is live). `null` draws none. */
  badges?: readonly SegmentBadge[]
  /** `radio` in forms (always with `pair`): the group is a radio group, not a tab list. */
  semantics?: 'tabs' | 'radio'
  /** The thumb follows a finger. Off where a drag competes for the gesture (the home Events | Places switch). */
  draggable?: boolean
  /** Disabled while busy: 45% of the whole control. */
  disabled?: boolean
  /** The design gallery only: draws a transient state with no finger or keyboard. */
  previewState?: 'focused'
  /** The design gallery only: draws this segment pressed. */
  previewPressed?: number
  testID?: string
}

/** A segment's label and badge, drawn twice: white under the thumb's edge, ink inside it. */
function SegmentLabel({ item, badge, ink, pair, bold, android }: { item: string; badge: SegmentBadge; ink: boolean; pair: boolean; bold: boolean; android: boolean }) {
  const family = ink ? FONT_FAMILY.brand[700] : FONT_FAMILY.brand[500]
  const color = ink ? COLOR.selectionInk : COLOR.textPrimary
  return (
    <View style={styles.labelRow}>
      <Text
        style={[font(pair ? 'meta' : 'button', bold, family), styles.label, { color }]}
        maxFontSizeMultiplier={CONTROL_FONT_CAP}
        numberOfLines={android || pair ? 2 : 1}
      >
        {item}
      </Text>
      {badge === 'dot' ? <View style={styles.dot} /> : null}
      {typeof badge === 'number' ? (
        <Text
          maxFontSizeMultiplier={CONTROL_FONT_CAP}
          style={[monoCaption(bold), { color: ink ? COLOR.selectionInkSecondary : COLOR.textSecondary }]}
        >
          {badge}
        </Text>
      ) : null}
    </View>
  )
}

const FADE_CURVE = Easing.bezier(...EASING.snapOut)
const DIVIDER_FADE = `opacity ${DURATION.quick}ms cubic-bezier(${EASING.gentle.join(',')})`

const spoken = (item: string, badge: SegmentBadge) =>
  badge === 'dot' ? `${item}, someone’s live` : typeof badge === 'number' ? `${item}, ${badge}` : item

/**
 * The segmented control (guidelines/components/SegmentedControl.html; ROUND3
 * B10; the sweep's switch.html): a 48 pt solid capsule with a white thumb. The
 * thumb is the one selection colour, so the control is never coloured (§12), and
 * it is solid even on glass. The track follows its ground (`GroundProvider`).
 *
 * The labels are drawn twice: white 500 on the track and ink 700 in a row
 * inside the thumb, so the colour changes exactly at the thumb's edge, mid-slide
 * or mid-drag. Badges ride the labels (a count, or a live dot).
 *
 * The thumb slides on `M.snap`; a finger drags it, rubber-banding past the
 * ends, and a flick lands where its speed carries it (`draggable`, off for the
 * home switch). Reduce Motion jumps it. `H.select` once, on landing: never
 * mid-drag and never on the current segment. A `pair` may rest on neither side:
 * no thumb, a hairline between, and tapping the chosen side clears it. Read as a
 * tab list, or as radios in forms and always for a pair.
 */
export function SegmentedControl({
  items,
  selected,
  onChange: onChangeProp,
  pair: pairProp,
  badges,
  semantics = 'tabs',
  draggable = true,
  disabled = false,
  previewState,
  previewPressed,
  testID,
}: SegmentedControlProps) {
  const android = Platform.OS === 'android'
  const reduceMotion = useReducedMotion()
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const screenReader = useScreenReader()
  const ground = useGround()
  const [focused, setFocused] = useState(false)
  const n = items.length
  const pair = pairProp === true
  const onChange = onChangeProp as (index: number | null) => void
  const radio = pair || semantics === 'radio'

  const pos = useSharedValue(selected ?? 0)
  const appear = useSharedValue(selected === null ? 0 : 1)
  const squeeze = useSharedValue(1)
  const segmentWidth = useSharedValue(1)
  // The last segment asked for, not the thumb mid-flight.
  const target = useRef(selected)
  const fade = { duration: motionTokens(reduceMotion).duration.quick, easing: FADE_CURVE }
  useEffect(() => {
    if (target.current === selected) return
    const was = target.current
    target.current = selected
    if (selected === null) {
      appear.set(withTiming(0, { duration: fade.duration }))
      return
    }
    // The first pick of a pair has nowhere to slide from: it fades in where it lands.
    if (was === null) {
      pos.set(selected)
      appear.set(withTiming(1, fade))
      return
    }
    pos.set(reduceMotion ? selected : withSpring(selected, { ...SPRING.snap, reduceMotion: ReduceMotion.Never }))
    // `fade` is rebuilt each render from `reduceMotion`, which is listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, reduceMotion, pos, appear])

  // A cleared pair's thumb stays mounted while it fades out.
  const [prevSelected, setPrevSelected] = useState(selected)
  const [leaving, setLeaving] = useState(false)
  if (prevSelected !== selected) {
    setPrevSelected(selected)
    if (selected === null) setLeaving(true)
  }
  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(() => setLeaving(false), fade.duration)
    return () => clearTimeout(timer)
  }, [leaving, fade.duration])
  const showThumb = selected !== null || leaving

  // Percentages of the track, so the thumb is right on the first frame, before any layout.
  const thumbStyle = useAnimatedStyle(() => ({
    left: `${(pos.get() * 100) / n}%`,
    opacity: appear.get(),
    transform: [{ scale: (PRESS.scale + (1 - PRESS.scale) * appear.get()) * squeeze.get() }],
  }))
  // Percentages of the thumb: the ink row slides the other way by exactly the thumb's travel.
  const inkStyle = useAnimatedStyle(() => ({ left: `${-pos.get() * 100}%` }))

  const land = (index: number) => {
    target.current = index
    H.select()
    onChange(index)
  }
  const drag = Gesture.Pan()
    .activeOffsetX([-DRAG_ACTIVE_X, DRAG_ACTIVE_X])
    .failOffsetY([-DRAG_FAIL_Y, DRAG_FAIL_Y])
    .enabled(draggable && !disabled && selected !== null && !screenReader)
    .withTestId(testID ? `${testID}-pan` : 'segmented-pan')
    .onUpdate((e) => {
      const start = selected ?? 0
      const x = start + e.translationX / segmentWidth.get()
      const last = n - 1
      if (reduceMotion) pos.set(Math.min(last, Math.max(0, x)))
      else pos.set(x < 0 ? rubberBand(x) : x > last ? last + rubberBand(x - last) : x)
    })
    // The compiler reads `land` (it records the landing in `target`, only ever when a drag ends) as a ref read during render.
    // eslint-disable-next-line react-hooks/refs
    .onEnd((e) => {
      const x = pos.get()
      const to = landOn(x, e.velocityX, segmentWidth.get(), n)
      pos.set(reduceMotion ? to : withSpring(to, { ...SPRING.snap, velocity: e.velocityX / segmentWidth.get(), reduceMotion: ReduceMotion.Never }))
      if (to !== selected) scheduleOnRN(land, to)
    })

  const press = (i: number) => {
    if (i === selected) {
      if (!pair) return
      H.select()
      onChange(null)
      return
    }
    H.select()
    onChange(i)
  }
  const squeezeTo = (to: number) => {
    if (!reduceMotion) squeeze.set(withSpring(to, SPRING.press))
  }

  const onLayout = (e: LayoutChangeEvent) => {
    segmentWidth.set(Math.max(1, (e.nativeEvent.layout.width - SPACE.xs * 2) / n))
  }
  const trackStyle: ViewStyle = { backgroundColor: trackFill(ground) }
  const dividerStyle = { opacity: selected === null ? 1 : 0, transition: DIVIDER_FADE } as unknown as ViewStyle

  return (
    <View>
      <GestureDetector gesture={drag}>
        <View
          testID={testID}
          onLayout={onLayout}
          accessibilityRole={radio ? 'radiogroup' : 'tablist'}
          accessibilityLabel={pair ? `${items[0]} or ${items[1]}` : undefined}
          style={[styles.control, trackStyle, contrast && styles.contrast, disabled && { opacity: OPACITY.disabled }]}
        >
          <View style={styles.track} pointerEvents="none">
            {pair ? <View testID={testID && `${testID}-divider`} style={[styles.divider, dividerStyle]} /> : null}
            {showThumb ? (
              <Animated.View testID={testID && `${testID}-thumb`} style={[styles.thumb, { width: `${100 / n}%` }, thumbStyle]}>
                <Animated.View
                  testID={testID && `${testID}-ink`}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={[styles.ink, { width: `${n * 100}%` }, inkStyle]}
                >
                  {items.map((item, i) => (
                    <View key={item} style={styles.segment}>
                      <SegmentLabel item={item} badge={badges?.[i] ?? null} ink pair={pair} bold={bold} android={android} />
                    </View>
                  ))}
                </Animated.View>
              </Animated.View>
            ) : null}
          </View>
          {items.map((item, i) => {
            const on = i === selected
            return (
              <Pressable
                key={item}
                testID={testID && `${testID}-${i}`}
                onPress={() => press(i)}
                onPressIn={() => on && squeezeTo(PRESS.scale)}
                onPressOut={() => on && squeezeTo(1)}
                disabled={disabled}
                // A segment is 40 pt inside the 4 pt track; the slop makes it the control's 48.
                hitSlop={{ top: SPACE.xs, bottom: SPACE.xs }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                accessibilityRole={radio ? 'radio' : 'tab'}
                accessibilityLabel={spoken(item, badges?.[i] ?? null)}
                accessibilityHint={pair && on ? 'Double-tap to clear' : undefined}
                accessibilityState={radio ? { checked: on, disabled } : { selected: on, disabled }}
                style={({ pressed }) => [styles.segment, !on && (pressed || previewPressed === i) && { opacity: PRESSED_SEGMENT }]}
              >
                <SegmentLabel item={item} badge={badges?.[i] ?? null} ink={false} pair={pair} bold={bold} android={android} />
              </Pressable>
            )
          })}
        </View>
      </GestureDetector>
      {focused || previewState === 'focused'
        ? focusRing(SIZE.control / 2).map((ring, i) => (
            <View key={i} testID={i ? undefined : testID && `${testID}-focus`} pointerEvents="none" style={ring} />
          ))
        : null}
    </View>
  )
}

const styles = StyleSheet.create({
  control: {
    height: SIZE.control,
    borderRadius: RADIUS.capsule,
    flexDirection: 'row',
    padding: SPACE.xs,
  },
  contrast: { borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast },
  track: { position: 'absolute', top: SPACE.xs, bottom: SPACE.xs, left: SPACE.xs, right: SPACE.xs },
  thumb: { position: 'absolute', top: 0, bottom: 0, borderRadius: RADIUS.capsule, backgroundColor: COLOR.selectionFill, overflow: 'hidden' },
  ink: { position: 'absolute', top: 0, bottom: 0, flexDirection: 'row' },
  divider: { position: 'absolute', top: '50%', left: '50%', width: 1, height: DIVIDER_HEIGHT, marginTop: -DIVIDER_HEIGHT / 2, backgroundColor: COLOR.hairlineStrong },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.xs },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: BADGE_GAP, maxWidth: '100%' },
  label: { textAlign: 'center', flexShrink: 1 },
  dot: { width: DOT, height: DOT, borderRadius: RADIUS.capsule, backgroundColor: COLOR.live },
})

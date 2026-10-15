import { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { Easing, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { GradientFill } from '../ui/GradientFill'
import { Icon, type IconName } from '../ui/Icon'
import { COLOR, DURATION, ICON, RADIUS, SIZE, SPACE, SPRING } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useReducedMotion } from '../../lib/motion'
import { OPACITY } from '../../lib/theme'
import { Button } from './Button'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, useBoldText, useIncreaseContrast, useScreenReader } from './shared'

/** A finger may drift this far and still be holding. */
const MAX_DRIFT = SPACE.xl
const QUARTERS = 4
/** A long label ("Go live when you’re here · 350 m") shrinks this far before it would lose its tail. */
const LABEL_MIN_SCALE = 0.8

export type HoldToConfirmProps = {
  /** "Hold to blend in". */
  label: string
  onConfirm: () => void
  /** What confirming does, read as the hint: "Checks you in. Other people at this event will see you." */
  consequence?: string
  /** The screen reader's button ("Check in"); the label when omitted. */
  srLabel?: string
  /** While the confirmed action runs: the fill stays full under `busyLabel`. When it drops, the fill drains. */
  busy?: boolean
  busyLabel?: string
  /** Outside the fence: 45%, no hold. */
  disabled?: boolean
  /** The server said no (#10): `H.error` as it turns on, and the fill drains on `M.settle`. */
  refused?: boolean
  /** The server said yes (#9): the fill stays full under this label ("You’re in"), with nothing left to hold. */
  confirmedLabel?: string
  icon?: IconName
  /** The design gallery only: the fill frozen this far in. */
  previewProgress?: number
  testID?: string
}

/**
 * The one irreversible gesture (guidelines/components/HoldToConfirm.html,
 * ROUND3 B10): hold for 900 ms (`DURATION.hold`). The surfaceSunken track fills
 * with the gradient from the left, linearly, and the label is drawn twice so it
 * turns white exactly at the fill edge (transforms only: no layout per frame).
 *
 * `H.tick` at 25 / 50 / 75% and `H.commit` at 100%, fired from the UI thread on
 * the frame the fill crosses; the outcome's `H.success` / `H.error` is the
 * caller's, on the server's answer (#8). Letting go before the end rewinds on
 * `M.settle`, silently; Reduce Motion cuts the rewind but keeps the fill (the
 * hold's speed is information). Busy keeps the fill full under its label. A
 * refusal (#10, R3-D4 4.7): `H.error` at t0 and the fill drains on `M.settle`,
 * not a bounce (the refusal sheet is the screen's). A yes (#9, the Flow 4
 * prototype): the fill stays full under "You're in" and the pour (MomentPour)
 * plays `H.success`. One hold in the product: check-in and Go Live both use
 * this; no staff hold (ROUND3 G3).
 *
 * The hold is never required. A screen reader gets one strong button (a
 * double-tap confirms); Switch Control and Voice Control activate the pill
 * directly. Both play `H.commit`. The label caps at 1.3× in the 56 pt pill;
 * Increase Contrast adds the 50% hairline to the track.
 */
export function HoldToConfirm({
  label,
  onConfirm,
  consequence,
  srLabel,
  busy = false,
  busyLabel,
  disabled = false,
  refused = false,
  confirmedLabel,
  icon = 'fingerprint-pattern',
  previewProgress,
  testID,
}: HoldToConfirmProps) {
  const screenReader = useScreenReader()
  const reduceMotion = useReducedMotion()
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const [width, setWidth] = useState(0)
  const full = busy || !!confirmedLabel
  const progress = useSharedValue(previewProgress ?? (full ? 1 : 0))
  const inactive = disabled || full

  const commit = useCallback(() => {
    H.commit()
    onConfirm()
  }, [onConfirm])
  const tick = useCallback((quarter: 1 | 2 | 3) => H.tick(quarter), [])

  // The quarters, going up only: a rewind crosses them silently.
  useAnimatedReaction(
    () => Math.floor(progress.get() * QUARTERS),
    (quarter, previous) => {
      if (previous !== null && quarter > previous && quarter > 0 && quarter < QUARTERS) {
        scheduleOnRN(tick, quarter as 1 | 2 | 3)
      }
    }
  )

  // Busy and confirmed hold the fill full; when they drop (refused, or done) the fill drains.
  const wasFull = useRef(full)
  useEffect(() => {
    if (previewProgress != null) progress.set(previewProgress)
    else if (full) progress.set(1)
    else if (wasFull.current || refused) progress.set(reduceMotion ? 0 : withSpring(0, SPRING.settle))
    wasFull.current = full
  }, [full, refused, previewProgress, reduceMotion, progress])

  // #10: the refusal's one haptic, as it arrives.
  useEffect(() => {
    if (refused) H.error()
  }, [refused])

  const hold = Gesture.LongPress()
    .enabled(!inactive && previewProgress == null)
    .minDuration(DURATION.hold)
    .maxDistance(MAX_DRIFT)
    .shouldCancelWhenOutside(false)
    .onBegin(() => {
      progress.set(withTiming(1, { duration: DURATION.hold, easing: Easing.linear }))
    })
    .onStart(() => {
      progress.set(1)
      scheduleOnRN(commit)
    })
    .onFinalize((_e, success) => {
      // A cancel after the edge (busy disables the gesture, an Android drift) is not a release: it committed.
      if (!success && progress.get() < 1) progress.set(reduceMotion ? 0 : withSpring(0, SPRING.settle))
    })
  if (testID) hold.withTestId(`${testID}-hold`)

  const fillStyle = useAnimatedStyle(() => ({
    opacity: width ? 1 : 0,
    transform: [{ translateX: (progress.get() - 1) * width }],
  }), [width])
  // The label on the fill moves the other way, so it stays put on screen.
  const fillLabelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - progress.get()) * width }] }), [width])

  if (screenReader) {
    return (
      <Button
        kind="strong"
        label={srLabel ?? label}
        accessibilityHint={consequence}
        onPress={commit}
        disabled={disabled || !!confirmedLabel}
        loading={busy}
        testID={testID}
      />
    )
  }

  const text = confirmedLabel ?? (busy && busyLabel ? busyLabel : label)
  const labelRow = (color: string) => (
    <>
      <Icon name={icon} size={ICON.control} color={color} />
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={LABEL_MIN_SCALE}
        maxFontSizeMultiplier={CONTROL_FONT_CAP}
        style={[font('button', bold), styles.shrink, { color }]}
      >
        {text}
      </Text>
    </>
  )

  return (
    <View testID={testID && `${testID}-wrap`} style={disabled && styles.disabled}>
      <GestureDetector gesture={hold}>
        <View
          testID={testID}
          onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
          accessible
          accessibilityRole="button"
          accessibilityLabel={text}
          accessibilityHint={consequence}
          accessibilityState={{ disabled: inactive, busy }}
          accessibilityActions={[{ name: 'activate' }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'activate' && !inactive) commit()
          }}
          style={styles.track}
        >
          <View style={styles.labelRow} pointerEvents="none">
            {labelRow(COLOR.textSecondary)}
          </View>
          <Animated.View testID={testID && `${testID}-fill`} pointerEvents="none" style={[styles.fill, fillStyle]}>
            <GradientFill style={StyleSheet.absoluteFill} />
            <Animated.View testID={testID && `${testID}-fill-label`} style={[styles.labelRow, { width }, fillLabelStyle]}>
              {labelRow(COLOR.textOnGradient)}
            </Animated.View>
          </Animated.View>
          {contrast ? <View testID={testID && `${testID}-contrast`} pointerEvents="none" style={[styles.edge, IC_HAIRLINE]} /> : null}
        </View>
      </GestureDetector>
    </View>
  )
}

const styles = StyleSheet.create({
  disabled: { opacity: OPACITY.disabled },
  track: {
    height: SIZE.primary,
    borderRadius: RADIUS.button,
    backgroundColor: COLOR.surfaceSunken,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  labelRow: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.lg,
  },
  fill: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  shrink: { flexShrink: 1 },
  edge: { ...StyleSheet.absoluteFill, borderRadius: RADIUS.button },
})

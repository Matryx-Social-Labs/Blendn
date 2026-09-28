import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { MOTION_SPRING } from '../../lib/motion'
import { CONTROL, EMBER, EMBER_RADIUS, ICON, OPACITY, SPACE, tint } from '../../lib/theme'
import { Text } from '../ui/Text'

/** Long enough to be a decision, short enough not to feel like a wait. */
export const HOLD_MS = 900

/**
 * Hold to commit — Opal's pattern, without its glow.
 *
 * Checking in is the one action in the app that changes who can see you, so a
 * tap is too cheap for it: a pocket or a scroll that lands on the button would
 * put somebody on a roster. Holding makes it deliberate, and the fill makes
 * the hold legible — you watch yourself committing.
 *
 * - The fill is a flat accent layer sliding in from the left (`translateX`,
 *   not `width`), with the label drawn twice — once on the pill, once on the
 *   fill, counter-translated — so the words change colour exactly where the
 *   fill's edge crosses them. Transforms only: no layout pass per frame.
 * - Linear, because it is a progress bar: its speed *is* the information.
 * - A light tick at each quarter and a success notification at the end, fired
 *   from `useAnimatedReaction` so they land on the frame the fill does.
 * - Let go early and it springs back from wherever it got to.
 * - Screen readers can't hold, so the accessibility action confirms at once;
 *   holding is a guard against accidents, and a screen-reader activation is
 *   never an accident.
 *
 * Reduce Motion keeps the fill: it is progress, not decoration.
 */
export function HoldToConfirm({
  label,
  holdingLabel = 'Keep holding…',
  busyLabel,
  busy = false,
  disabled = false,
  onConfirm,
  accessibilityHint,
  icon,
}: {
  label: string
  /** Leading glyph — a fingerprint says "press" before a word is read. */
  icon?: keyof typeof Ionicons.glyphMap
  holdingLabel?: string
  /** Shown with a spinner while the confirmed action runs. */
  busyLabel?: string
  busy?: boolean
  disabled?: boolean
  onConfirm: () => void
  accessibilityHint?: string
}) {
  const [width, setWidth] = useState(0)
  const [holding, setHolding] = useState(false)
  const progress = useSharedValue(0)
  const pressed = useSharedValue(0)

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))

  const tick = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
  }, [])
  const done = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    onConfirm()
  }, [onConfirm])

  // Quarter ticks: fire when the fill crosses 25 / 50 / 75%, going up only.
  useAnimatedReaction(
    () => Math.floor(progress.get() * 4),
    (quarter, previous) => {
      if (previous !== null && quarter > previous && quarter > 0 && quarter < 4) {
        scheduleOnRN(tick)
      }
    }
  )

  const inactive = disabled || busy

  /*
   * The request behind the hold can fail (out of range, weak GPS). When `busy`
   * drops without the screen moving on, the fill drains back so the control is
   * plainly ready to try again rather than sitting full.
   */
  const wasBusy = useRef(busy)
  useEffect(() => {
    if (wasBusy.current && !busy) progress.set(withSpring(0, MOTION_SPRING.gentle))
    wasBusy.current = busy
  }, [busy, progress])

  const hold = Gesture.LongPress()
    .enabled(!inactive)
    .minDuration(HOLD_MS)
    .maxDistance(24)
    .shouldCancelWhenOutside(false)
    .onBegin(() => {
      pressed.set(withTiming(1, { duration: 120 }))
      progress.set(withTiming(1, { duration: HOLD_MS, easing: Easing.linear }))
      scheduleOnRN(setHolding, true)
    })
    .onStart(() => {
      // `minDuration` elapsed with the finger still down: committed.
      progress.set(1)
      scheduleOnRN(done)
    })
    .onFinalize((_e, success) => {
      pressed.set(withTiming(0, { duration: 160 }))
      scheduleOnRN(setHolding, false)
      if (!success) progress.set(withSpring(0, MOTION_SPRING.snappy))
    })

  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.get() - 1) * width }],
  }))
  // The label on the fill moves the other way, so it stays put on screen.
  const fillLabelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - progress.get()) * width }],
  }))
  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.get() * 0.03 }],
  }))

  const text = busy ? busyLabel ?? label : holding ? holdingLabel : label

  return (
    <GestureDetector gesture={hold}>
      <Animated.View
        onLayout={onLayout}
        style={[styles.pill, inactive && !busy && styles.disabled, pillStyle]}
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint ?? 'Double tap to confirm'}
        accessibilityState={{ disabled: inactive, busy }}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'activate' && !inactive) done()
        }}
      >
        <View style={styles.labelRow} pointerEvents="none">
          {icon && !busy ? <Ionicons name={icon} size={ICON.md} color={EMBER.accent} /> : null}
          <Text variant="button" color={EMBER.accent} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {text}
          </Text>
        </View>
        <Animated.View style={[styles.fill, fillStyle]} pointerEvents="none">
          <Animated.View style={[styles.labelRow, { width }, fillLabelStyle]}>
            {busy ? (
              <ActivityIndicator size="small" color={EMBER.onGradient} />
            ) : icon ? (
              <Ionicons name={icon} size={ICON.md} color={EMBER.onGradient} />
            ) : null}
            <Text variant="button" color={EMBER.onGradient} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {text}
            </Text>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  /*
   * An accent-tinted track, not a surface. It sits on the pass, which *is*
   * `surface` — a surface pill there was invisible as a control (driven on
   * device; tasks/lessons.md). The tint says "this is the action" before it is
   * touched, and the solid accent sliding across it says how far along you are.
   */
  pill: {
    height: CONTROL.lg,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: tint(EMBER.accent, 0.16),
    overflow: 'hidden',
    justifyContent: 'center',
  },
  disabled: { opacity: OPACITY.disabled },
  labelRow: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.lg,
  },
  fill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: EMBER.accent,
    overflow: 'hidden',
  },
})

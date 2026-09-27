import React, { useEffect, useState } from 'react'
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'

import type { TypeRole } from '../../lib/theme'
import { Text } from '../ui/Text'

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
/** Soft ease-out: the digits keep turning visibly before they settle. */
const EASE_OUT = Easing.bezier(0.33, 1, 0.68, 1)
/** Long for UI, on purpose: it plays once, when the number first arrives or changes. */
const ROLL_MS = 900
/** Each column to the left starts a beat later, so the number reads as counting up. */
const COLUMN_STAGGER = 90

function Column({
  digit,
  height,
  delay,
  variant,
  maxFontSizeMultiplier,
  reduceMotion,
  duration,
  color,
}: {
  digit: number
  height: number
  delay: number
  variant: TypeRole
  maxFontSizeMultiplier: number
  reduceMotion: boolean
  duration: number
  color?: string
}) {
  const at = useSharedValue(0)

  useEffect(() => {
    at.set(reduceMotion ? digit : withDelay(delay, withTiming(digit, { duration, easing: EASE_OUT })))
  }, [at, digit, delay, reduceMotion, duration])

  const strip = useAnimatedStyle(() => ({ transform: [{ translateY: -at.get() * height }] }))

  return (
    <View style={{ height, overflow: 'hidden' }}>
      <Animated.View style={strip}>
        {DIGITS.map((d) => (
          <Text key={d} variant={variant} color={color} maxFontSizeMultiplier={maxFontSizeMultiplier} style={[styles.digit, { height }]}>
            {d}
          </Text>
        ))}
      </Animated.View>
    </View>
  )
}

/**
 * A count that rolls up like an odometer: each digit is a 0–9 strip in a
 * one-line window, moved with a transform, so the whole roll runs on the UI
 * thread and nothing re-renders per frame.
 *
 * It rolls from 0 when it first appears and from the old value when the
 * number changes. Returning to the tab with the same number doesn't replay it.
 *
 * The line height comes from measuring a real digit (`onLayout`), not from
 * `TYPE`, so it stays right at every Dynamic Type size. Until it's measured
 * the plain number shows, so there's never a blank.
 *
 * Reduce Motion: the digits are simply set.
 *
 * Not an accessibility element itself: the caller labels "3 Attended" as one.
 */
export function RollingNumber({
  value,
  variant = 'title',
  maxFontSizeMultiplier = 1.2,
  duration = ROLL_MS,
  stagger = COLUMN_STAGGER,
  color,
}: {
  value: number
  variant?: TypeRole
  maxFontSizeMultiplier?: number
  /**
   * The Me tab's 900ms is a once-per-load flourish. A live count that ticks
   * while you watch (the Room's headcount) wants the short roll, so it can
   * change twice in a second without queueing.
   */
  duration?: number
  stagger?: number
  color?: string
}) {
  const reduceMotion = useReducedMotion()
  const [height, setHeight] = useState(0)
  const digits = String(Math.max(0, Math.round(value))).split('').map(Number)

  const onMeasure = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height)
    if (h && h !== height) setHeight(h)
  }

  return (
    <View style={styles.row} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {/* The measuring digit, and the plain number until the height is known. */}
      <Text
        variant={variant}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        color={color}
        onLayout={onMeasure}
        style={[styles.digit, height ? styles.measure : null]}
      >
        {height ? '0' : digits.join('')}
      </Text>
      {height
        ? digits.map((d, i) => (
            <Column
              // Keyed from the right, so 9 → 10 keeps the ones column and adds a tens.
              key={digits.length - i}
              digit={d}
              height={height}
              delay={(digits.length - 1 - i) * stagger}
              duration={duration}
              color={color}
              variant={variant}
              maxFontSizeMultiplier={maxFontSizeMultiplier}
              reduceMotion={reduceMotion}
            />
          ))
        : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  /*
   * Tabular figures, so every digit is one width and a strip of 0-9 is as
   * wide as the digit showing. Without it a "1" sat in a "0"-wide slot and
   * 12 read as "1 2".
   */
  digit: { fontVariant: ['tabular-nums'], textAlign: 'center' },
  measure: { position: 'absolute', opacity: 0 },
})

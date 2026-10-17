import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View, useWindowDimensions, type TextStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'

import { COLOR, FONT_FAMILY, MAX_FONT_SCALE, SPRING } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { font, useBoldText } from './shared'

/**
 * The three sizes on the type roles: `numericDisplay` (40, the Room's count),
 * `title` (the recap tiles; the page's 28 is between roles), `bodyStrong` (17,
 * beside a heading).
 */
export type RollingRole = 'numericDisplay' | 'title' | 'bodyStrong'

type Roll = { from: string | null; q?: number }

function Column({
  char,
  roll,
  rollIn,
  height,
  cap,
  text,
  testID,
}: {
  char: string
  /** The gallery's frozen frame: the old digit and how far along. */
  roll?: Roll
  /** A column added after the first draw (99 → 100) rolls in from below. */
  rollIn: boolean
  height: number
  /** The role's text-size cap: the glyphs stop where the column's height does. */
  cap: number
  text: TextStyle[]
  testID?: string
}) {
  const reduceMotion = useReducedMotion()
  const [from, setFrom] = useState<string | null>(roll?.from ?? null)
  const last = useRef(char)
  const p = useSharedValue(roll?.q ?? (rollIn ? 0 : 1))

  useEffect(() => {
    const go = () => p.set(reduceMotion ? 1 : withSpring(1, SPRING.snap))
    if (roll) return
    if (rollIn && last.current === char && p.get() === 0) return go()
    if (last.current === char) return
    setFrom(last.current)
    last.current = char
    p.set(0)
    go()
    // On the digit alone: a new roll starts from wherever the last one was.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char])

  const outStyle = useAnimatedStyle(() =>
    reduceMotion ? { opacity: 1 - p.get() } : { opacity: 1 - p.get(), transform: [{ translateY: -p.get() * height }] }
  )
  const inStyle = useAnimatedStyle(() =>
    reduceMotion ? { opacity: p.get() } : { transform: [{ translateY: (1 - p.get()) * height }] }
  )

  return (
    <View style={[styles.column, { height }]}>
      {from !== null ? (
        <Animated.Text testID={testID && `${testID}-out`} maxFontSizeMultiplier={cap} style={[...text, styles.out, outStyle]}>
          {from}
        </Animated.Text>
      ) : null}
      <Animated.Text testID={testID && `${testID}-in`} maxFontSizeMultiplier={cap} style={[...text, inStyle]}>
        {char}
      </Animated.Text>
    </View>
  )
}

/**
 * A number that changes while you watch (guidelines/components/RollingNumber.html):
 * the Room's "14 here now", the recap tiles, a count beside a heading. Only
 * the digit that changes rolls, old digit up and out, new digit in from below,
 * on `M.snap` (motion #24, #26; the page's `M.settle` is the older word); the
 * others hold still. Geist Mono 700, tabular, so nothing
 * shifts. A new column (99 → 100) rolls in as the width grows. Never a tween
 * through the values between, never a spinner.
 *
 * Reduce Motion: the number changes instantly (#24). Scales with text up to
 * its role's cap. Read
 * as its value only, never as a live region (counters are not, §14): the caller
 * groups it with its unit ("14 here now"). No haptic: the event behind the
 * number carries its own.
 */
export function RollingNumber({
  value,
  role = 'numericDisplay',
  color = COLOR.textPrimary,
  preview,
  testID,
}: {
  value: number
  role?: RollingRole
  color?: string
  /** The design gallery only: a frozen frame `q` of the way from `from`. */
  preview?: { from: number; q: number }
  testID?: string
}) {
  const bold = useBoldText()
  const { fontScale } = useWindowDimensions()
  const digits = String(Math.max(0, Math.round(value)))
  // ponytail: columns past the first draw's width roll in; one that leaves and comes back (100 → 99 → 100) just appears.
  const [firstWidth] = useState(digits.length)
  const old = preview ? String(Math.max(0, Math.round(preview.from))).padStart(digits.length, ' ') : null
  const cap = MAX_FONT_SCALE[role]
  const base = font(role, bold, FONT_FAMILY.mono[700])
  const height = Math.ceil(base.lineHeight * Math.min(fontScale || 1, cap))
  const text: TextStyle[] = [base, styles.digit, { color }]

  return (
    <View testID={testID} accessible accessibilityLabel={digits} style={styles.row}>
      {[...digits].map((char, i) => {
        // Keyed from the right, so 9 → 10 keeps the ones column and adds a tens.
        const fromRight = digits.length - 1 - i
        const was = old?.[i]
        return (
          <Column
            key={fromRight}
            char={char}
            roll={preview && was !== char ? { from: was?.trim() || '0', q: preview.q } : undefined}
            rollIn={fromRight >= firstWidth}
            height={height}
            cap={cap}
            text={text}
            testID={testID && `${testID}-${fromRight}`}
          />
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  column: { overflow: 'hidden' },
  digit: { fontVariant: ['tabular-nums'] },
  out: { position: 'absolute', top: 0, left: 0, right: 0 },
})

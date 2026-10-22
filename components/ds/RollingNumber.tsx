import { Fragment, useEffect, useRef, useState } from 'react'
import { StyleSheet, View, useWindowDimensions, type TextStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'

import { COLOR, FONT_FAMILY, MAX_FONT_SCALE, SPRING, TYPE } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { CONTROL_FONT_CAP, font, useBoldText } from './shared'

/**
 * The three sizes on the type roles: `numericDisplay` (40, the Room's count),
 * `title` (the recap tiles; the page's 28 is between roles), `bodyStrong` (17,
 * beside a heading), and `button` (the button's Satoshi 700 at 16/20, tabular, for a count inside a button label).
 */
export type RollingRole = 'numericDisplay' | 'title' | 'bodyStrong' | 'button' | 'badge' | 'counter' | 'stepper'

/**
 * `badge` is the unread count's Geist Mono 700 at 12/16 (DS #28); `counter` is a set's "3 of 5", the same size at 500. Both
 * scale with the control's cap, like `button`.
 */
const SPEC: Record<RollingRole, { type: keyof typeof TYPE; family: string; cap: number }> = {
  numericDisplay: { type: 'numericDisplay', family: FONT_FAMILY.mono[700], cap: MAX_FONT_SCALE.numericDisplay },
  title: { type: 'title', family: FONT_FAMILY.mono[700], cap: MAX_FONT_SCALE.title },
  bodyStrong: { type: 'bodyStrong', family: FONT_FAMILY.mono[700], cap: MAX_FONT_SCALE.bodyStrong },
  // The button's own face (Satoshi 700, tabular), not a mono run: beside the Satoshi label a mono count sat larger, higher, and drew a slashed 0.
  button: { type: 'button', family: FONT_FAMILY.brand[700], cap: CONTROL_FONT_CAP },
  badge: { type: 'caption', family: FONT_FAMILY.mono[700], cap: CONTROL_FONT_CAP },
  counter: { type: 'caption', family: FONT_FAMILY.mono[500], cap: CONTROL_FONT_CAP },
  // The stepper's number (Geist Mono 700 at the heading's 20/26), capped with its discs' control.
  stepper: { type: 'heading', family: FONT_FAMILY.mono[700], cap: CONTROL_FONT_CAP },
}

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
  grouping = false,
  preview,
  testID,
}: {
  value: number
  role?: RollingRole
  color?: string
  /** A static "," every three digits from the right (en-US): "6,422". It never rolls. */
  grouping?: boolean
  /** The design gallery only: a frozen frame `q` of the way from `from`. */
  preview?: { from: number; q: number }
  testID?: string
}) {
  const bold = useBoldText()
  const { fontScale } = useWindowDimensions()
  const digits = String(Math.max(0, Math.round(value)))
  const spoken = grouping ? Number(digits).toLocaleString('en-US') : digits
  // ponytail: columns past the first draw's width roll in; one that leaves and comes back (100 → 99 → 100) just appears.
  const [firstWidth] = useState(digits.length)
  const old = preview ? String(Math.max(0, Math.round(preview.from))).padStart(digits.length, ' ') : null
  // A button's count scales with its label: the control's cap, not the reading text's.
  const { type, family, cap } = SPEC[role]
  const base = font(type, bold, family)
  const height = Math.ceil(base.lineHeight * Math.min(fontScale || 1, cap))
  const text: TextStyle[] = [base, styles.digit, { color }]

  return (
    <View testID={testID} accessible accessibilityLabel={spoken} style={styles.row}>
      {[...digits].map((char, i) => {
        // Keyed from the right, so 9 → 10 keeps the ones column and adds a tens.
        const fromRight = digits.length - 1 - i
        const was = old?.[i]
        // Between the thousands and the hundreds: before the column that starts a group of three (2, 5, 8 from the right), when a column precedes it.
        const comma = grouping && i > 0 && fromRight % 3 === 2
        return (
          <Fragment key={fromRight}>
            {comma ? (
              <View testID={testID && `${testID}-comma-${fromRight + 1}`} style={[styles.column, { height }]}>
                <Animated.Text maxFontSizeMultiplier={cap} style={text}>
                  ,
                </Animated.Text>
              </View>
            ) : null}
            <Column
              char={char}
              roll={preview && was !== char ? { from: was?.trim() || '0', q: preview.q } : undefined}
              rollIn={fromRight >= firstWidth}
              height={height}
              cap={cap}
              text={text}
              testID={testID && `${testID}-${fromRight}`}
            />
          </Fragment>
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

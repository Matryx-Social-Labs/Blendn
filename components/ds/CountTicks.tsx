import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'

import { COLOR, DURATION, EASING, SPACE } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { tint } from '../../lib/theme'
import { useIncreaseContrast } from './shared'

/** The page's 12 × 4 tick, 4 apart. */
const TICK = { width: SPACE.md, height: SPACE.xs } as const
/** Six is the usual width; past eight the row keeps eight ticks' width and the ticks narrow. */
const MOST_AT_FULL_WIDTH = 8
const ROW_WIDTH = MOST_AT_FULL_WIDTH * TICK.width + (MOST_AT_FULL_WIDTH - 1) * SPACE.xs
/** An empty tick: 22% white, 45% under Increase Contrast (the page). */
const EMPTY = 0.22
const EMPTY_CONTRAST = 0.45

/** One tick's width for a crew of `n`: 12 up to eight, then narrower, never wrapping. */
export function tickWidth(n: number) {
  if (n <= MOST_AT_FULL_WIDTH) return TICK.width
  return (ROW_WIDTH - (n - 1) * SPACE.xs) / n
}

/** #26 on a crew card: one tick fills over `base`, nothing else moves. */
const FILL = { transition: `background-color ${DURATION.base}ms cubic-bezier(${EASING.standard.join(', ')})` }

/**
 * A crew's size as identical ticks, the ones here now filled white
 * (guidelines/components/CountTicks.html, Flow 10): counts, never people.
 * With the crew's name, on a crew card and the crew strip.
 *
 * One element for a screen reader: "2 of 4 here". No haptic (the arrival's
 * own `H.arrive` belongs to the Room). A tick fills over `base` when someone
 * arrives; under Reduce Motion it swaps.
 */
export function CountTicks({ size, here, testID }: { size: number; here: number; testID?: string }) {
  const reduceMotion = useReducedMotion()
  const contrast = useIncreaseContrast()
  const filled = Math.max(0, Math.min(here, size))
  const width = tickWidth(size)
  const empty = tint(COLOR.textPrimary, contrast ? EMPTY_CONTRAST : EMPTY)
  return (
    <View testID={testID} accessible accessibilityRole="text" accessibilityLabel={`${filled} of ${size} here`} style={styles.row}>
      {Array.from({ length: size }, (_, i) => (
        <Animated.View
          key={i}
          testID={testID && `${testID}-${i}`}
          style={[styles.tick, { width, backgroundColor: i < filled ? COLOR.textPrimary : empty }, reduceMotion ? null : FILL]}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACE.xs },
  tick: { height: TICK.height, borderRadius: SPACE.xxs },
})

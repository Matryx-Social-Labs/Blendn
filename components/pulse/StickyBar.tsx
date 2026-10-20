import { useEffect, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

import { COLOR, DURATION, EASING, MATERIAL, REDUCE_MOTION, SPACE } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'

/** How far the list scrolls before the sticky search row takes its bar: the title block has gone under it. */
export const STICKY_BAR_AFTER = SPACE.xl

/**
 * The search row's place in a list, pinned under the title (`stickyHeaderIndices`). Once the list has scrolled
 * the row gets the bar behind it: the solid bar material with a hairline, faded in over `DURATION.quick`. It is
 * the solid bar and not glass because glass never animates opacity (DESIGN-BRIEF §5.2 rule 6); a fade is not
 * movement, so Reduce Motion keeps it (at its own, longer duration).
 */
export function StickyBar({ scrolled, children }: { scrolled: boolean; children: ReactNode }) {
  const reduceMotion = useReducedMotion()
  const shown = useSharedValue(0)
  useEffect(() => {
    shown.set(withTiming(scrolled ? 1 : 0, { duration: reduceMotion ? REDUCE_MOTION.duration.base : DURATION.quick, easing: Easing.bezier(...EASING.standard) }))
  }, [scrolled, reduceMotion, shown])
  const bar = useAnimatedStyle(() => ({ opacity: shown.get() }))
  return (
    <View style={styles.row} testID="sticky-search">
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.bar, bar]} testID="sticky-search-bar" />
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { paddingVertical: SPACE.sm },
  bar: { backgroundColor: MATERIAL.solidBar, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLOR.hairline },
})

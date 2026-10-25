import type { ReactNode } from 'react'
import { StyleSheet } from 'react-native'
import Animated, { Easing, FadeIn, FadeOut, LinearTransition, withTiming, type ExitAnimationsValues } from 'react-native-reanimated'

import { DURATION, EASING } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'

/** The row leaves on `base`: its height and opacity run together, so the rows below close up as it goes (the prototype). */
const collapse = (values: ExitAnimationsValues) => {
  'worklet'
  const t = { duration: DURATION.base, easing: Easing.bezier(...EASING.entrance) }
  return {
    initialValues: { opacity: 1, height: values.currentHeight },
    animations: { opacity: withTiming(0, t), height: withTiming(0, t) },
  }
}
const FADE_OUT = FadeOut.duration(DURATION.quick).easing(Easing.bezier(...EASING.exit))
const ARRIVE = FadeIn.duration(DURATION.base).easing(Easing.bezier(...EASING.entrance))
const CLOSE_UP = LinearTransition.duration(DURATION.base).easing(Easing.bezier(...EASING.entrance))

/**
 * Wraps one notification row so it can arrive and leave (Flow 9 · 9.2): a row that lands while the screen is
 * open fades in on `base`; an answered one collapses on `base` and the rows under it close up. Reduce Motion:
 * opacity only, and nothing closes up gradually. `arrive` is only for rows that land live: the first page
 * never animates (the skeleton crossfades into it).
 */
export function CollapsingRow({ arrive = false, children }: { arrive?: boolean; children: ReactNode }) {
  const reduceMotion = useReducedMotion()
  return (
    <Animated.View
      entering={arrive ? ARRIVE : undefined}
      exiting={reduceMotion ? FADE_OUT : collapse}
      layout={reduceMotion ? undefined : CLOSE_UP}
      style={styles.clip}
    >
      {children}
    </Animated.View>
  )
}

const styles = StyleSheet.create({ clip: { overflow: 'hidden' } })

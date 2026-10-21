import { useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated'

import { COLOR, MATERIAL, RADIUS, SPACE, SPRING } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { useIncreaseContrast, useSelection } from './shared'

/** The fill waits this long, so it grows once the next step has pushed in (the Flow 2 prototype). */
const HOLD_MS = 200
/** Under Increase Contrast the track takes a 0.5 pt hairline, so its empty part reads against ink. */
const CONTRAST_HAIRLINE = 0.5

const clamp = (n: number) => Math.min(1, Math.max(0, n))

/**
 * The onboarding progress (guidelines/components/ProgressBar.html): a 4 pt
 * surfaceSunken track with a fill in the screen's hue, determinate only. It sits under the
 * header, whose "Step n of 8" is what a screen reader hears; the bar itself is
 * hidden. Waiting on a server is the loader, never this.
 *
 * The fill grows on `M.settle` after a 200 ms hold; Reduce Motion jumps it.
 * No haptic: the step change already had its primary.
 */
export function ProgressBar({ progress, testID }: { progress: number; testID?: string }) {
  const reduceMotion = useReducedMotion()
  const contrast = useIncreaseContrast()
  const sel = useSelection()
  const to = clamp(progress)
  const fill = useSharedValue(to)
  // The last target asked for, not the value mid-flight: a flip back during the hold still lands.
  const target = useRef(to)
  useEffect(() => {
    if (target.current === to) return
    target.current = to
    fill.set(reduceMotion ? to : withDelay(HOLD_MS, withSpring(to, { ...SPRING.settle, reduceMotion: ReduceMotion.Never }), ReduceMotion.Never))
  }, [to, reduceMotion, fill])
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.get() * 100}%` }))

  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.track, contrast && styles.contrast]}
    >
      <Animated.View testID={testID && `${testID}-fill`} style={[styles.fill, { backgroundColor: sel.edge }, fillStyle]} />
    </View>
  )
}

const styles = StyleSheet.create({
  track: { height: SPACE.xs, borderRadius: RADIUS.capsule, backgroundColor: COLOR.surfaceSunken, overflow: 'hidden' },
  contrast: { borderWidth: CONTRAST_HAIRLINE, borderColor: MATERIAL.hairlineIncreaseContrast },
  fill: { height: '100%', borderRadius: RADIUS.capsule },
})

import { useEffect, useRef } from 'react'
import { StyleSheet } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated'

import { COLOR, DURATION, EASING } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { tint } from '../../lib/theme'

/** Motion #50: a 16% white wash on what a push or link landed on. */
const WASH = 0.16
/** It comes in over `base`, holds until 1 s, then leaves over `long`. */
const HOLD_MS = 1000
/** Reduce Motion: a still highlight for 2 s (a timer, not an animation). */
const STILL_MS = 2000

/**
 * The landing highlight (guidelines/motion/50-landing-from-a-push-or-link.html): laid over the row the person
 * was sent to, after the list has been scrolled to a third of the screen. `onDone` says it has gone, so the
 * screen can forget the landing. Draws nothing while `active` is false. Decorative: nothing to announce.
 */
export function LandingHighlight({ active, radius = 0, onDone, testID }: { active: boolean; radius?: number; onDone?: () => void; testID?: string }) {
  const reduceMotion = useReducedMotion()
  const opacity = useSharedValue(0)
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  })

  useEffect(() => {
    if (!active) return
    if (reduceMotion) {
      opacity.set(1)
      const timer = setTimeout(() => {
        opacity.set(0)
        done.current?.()
      }, STILL_MS)
      return () => clearTimeout(timer)
    }
    const enter = { duration: DURATION.base, easing: Easing.bezier(...EASING.entrance) }
    const leave = { duration: DURATION.long, easing: Easing.bezier(...EASING.exit) }
    opacity.set(withSequence(withTiming(1, enter), withDelay(HOLD_MS - DURATION.base, withTiming(0, leave))))
    const timer = setTimeout(() => done.current?.(), HOLD_MS + DURATION.long)
    return () => clearTimeout(timer)
  }, [active, reduceMotion, opacity])

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }))
  if (!active) return null
  return (
    <Animated.View
      testID={testID}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: tint(COLOR.textPrimary, WASH) }, style]}
    />
  )
}

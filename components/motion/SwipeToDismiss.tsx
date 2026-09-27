import type { ReactNode } from 'react'
import { StyleSheet, useWindowDimensions } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { EMBER } from '../../lib/theme'

/** Past this, a slow drag dismisses. */
const DISMISS_DISTANCE = 120
/** A flick this fast dismisses from any distance — a flick is enough. */
const DISMISS_VELOCITY = 800

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)

/*
 * The photo arrives rather than appears: 0.92 → 1 with its opacity, 220ms
 * ease-out, on top of the Modal's own fade (which is kept because it is also
 * the way *out* — the × and Android back close through it). Opening a photo
 * is occasional, and a picture that grows into place reads as "this is the
 * one you tapped" where a cut reads as a new screen.
 *
 * Under Reduce Motion the scale is dropped and only the fade remains.
 */
const openIn = () => {
  'worklet'
  const t = { duration: 220, easing: EASE_OUT }
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.92 }] },
    animations: { opacity: withTiming(1, t), transform: [{ scale: withTiming(1, t) }] },
  }
}

const fadeOpenIn = () => {
  'worklet'
  return {
    initialValues: { opacity: 0 },
    animations: { opacity: withTiming(1, { duration: 220, easing: EASE_OUT }) },
  }
}

/**
 * Full-screen media you can throw away: drag it up or down and let go.
 *
 * The lightboxes closed only from a 36pt × in the corner. Every photo viewer
 * people already use lets them flick the photo off instead, so this is the
 * expected way out — and the × stays for anyone who does not know it.
 *
 * - The photo follows the finger 1:1 on the UI thread; the dark page behind it
 *   thins as it leaves, so you can see you are on the way out.
 * - Released far enough *or* fast enough, it keeps going the way you threw it,
 *   carrying the finger's velocity, and closes when it is off screen. Short of
 *   that it springs home (400ms, 0.8 damping) — the snap-back also keeps the
 *   release velocity, so a drag that reverses mid-air does not jolt.
 * - `failOffsetX` hands horizontal swipes to the pager underneath; only a
 *   vertical drag of 12pt claims the gesture.
 *
 * `enabled={false}` hands every drag to the content — a zoomed photo is panned,
 * not thrown away. Only one finger drags: two are a pinch.
 *
 * Carries its own `GestureHandlerRootView`: a `Modal` is a separate native
 * root, outside the app's, and gestures inside one do nothing without it.
 *
 * Reduce Motion: the photo still follows the finger — that is direct
 * manipulation, not animation — but a committed dismiss closes at once rather
 * than flying off.
 */
export function SwipeToDismiss({
  onDismiss,
  enabled = true,
  children,
}: {
  onDismiss: () => void
  enabled?: boolean
  children: ReactNode
}) {
  const reduceMotion = useReducedMotion()
  const { height } = useWindowDimensions()
  const y = useSharedValue(0)

  const pan = Gesture.Pan()
    .enabled(enabled)
    .maxPointers(1)
    .activeOffsetY([-12, 12])
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      y.set(e.translationY)
    })
    .onEnd((e) => {
      const far = Math.abs(e.translationY) > DISMISS_DISTANCE
      const fast =
        Math.abs(e.velocityY) > DISMISS_VELOCITY && Math.sign(e.velocityY) === Math.sign(e.translationY)
      if (!far && !fast) {
        y.set(withSpring(0, { duration: 400, dampingRatio: 0.8, velocity: e.velocityY }))
        return
      }
      if (reduceMotion) {
        scheduleOnRN(onDismiss)
        return
      }
      const direction = Math.sign(e.translationY) || Math.sign(e.velocityY) || 1
      y.set(
        withSpring(
          direction * height,
          { duration: 300, dampingRatio: 1, velocity: e.velocityY, overshootClamping: true },
          (finished) => {
            if (finished) scheduleOnRN(onDismiss)
          }
        )
      )
    })

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(y.get()), [0, height * 0.4], [1, 0.2], Extrapolation.CLAMP),
  }))
  const contentStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: y.get() },
      { scale: interpolate(Math.abs(y.get()), [0, height], [1, 0.85], Extrapolation.CLAMP) },
    ],
  }))

  return (
    <GestureHandlerRootView style={styles.fill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} pointerEvents="none" />
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.fill, contentStyle]}>
          {/* A separate view: an entering animation and the drag's transform would fight over one. */}
          <Animated.View style={styles.fill} entering={reduceMotion ? fadeOpenIn : openIn}>
            {children}
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // The page colour, opaque: a lightbox is a full-screen dark room, not a dimmed sheet.
  backdrop: { backgroundColor: EMBER.bg },
})

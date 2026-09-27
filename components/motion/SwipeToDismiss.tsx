import type { ReactNode } from 'react'
import { StyleSheet, useWindowDimensions } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'

/** Past this, a slow drag dismisses. */
const DISMISS_DISTANCE = 120
/** A flick this fast dismisses from any distance — a flick is enough. */
const DISMISS_VELOCITY = 800

/**
 * Full-screen media you can throw away: drag it up or down and let go.
 *
 * The lightboxes closed only from a 36pt × in the corner. Every photo viewer
 * people already use lets them flick the photo off instead, so this is the
 * expected way out — and the × stays for anyone who does not know it.
 *
 * - The photo follows the finger 1:1 on the UI thread; the black behind it
 *   thins as it leaves, so you can see you are on the way out.
 * - Released far enough *or* fast enough, it keeps going the way you threw it,
 *   carrying the finger's velocity, and closes when it is off screen. Short of
 *   that it springs home (400ms, 0.8 damping) — the snap-back also keeps the
 *   release velocity, so a drag that reverses mid-air does not jolt.
 * - `failOffsetX` hands horizontal swipes to the pager underneath; only a
 *   vertical drag of 12pt claims the gesture.
 *
 * Carries its own `GestureHandlerRootView`: a `Modal` is a separate native
 * root, outside the app's, and gestures inside one do nothing without it.
 *
 * Reduce Motion: the photo still follows the finger — that is direct
 * manipulation, not animation — but a committed dismiss closes at once rather
 * than flying off.
 */
export function SwipeToDismiss({ onDismiss, children }: { onDismiss: () => void; children: ReactNode }) {
  const reduceMotion = useReducedMotion()
  const { height } = useWindowDimensions()
  const y = useSharedValue(0)

  const pan = Gesture.Pan()
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
        runOnJS(onDismiss)()
        return
      }
      const direction = Math.sign(e.translationY) || Math.sign(e.velocityY) || 1
      y.set(
        withSpring(
          direction * height,
          { duration: 300, dampingRatio: 1, velocity: e.velocityY, overshootClamping: true },
          (finished) => {
            if (finished) runOnJS(onDismiss)()
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
      <Animated.View style={[StyleSheet.absoluteFill, styles.black, backdropStyle]} pointerEvents="none" />
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.fill, contentStyle]}>{children}</Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  black: { backgroundColor: '#000000' },
})

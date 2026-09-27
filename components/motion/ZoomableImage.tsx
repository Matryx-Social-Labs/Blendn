import { Image } from 'expo-image'
import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDecay,
  withSpring,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

const MAX_SCALE = 4
const DOUBLE_TAP_SCALE = 2
/** Below 1× the photo resists, then springs back — it never shrinks away. */
const MIN_PINCH_SCALE = 0.7
/** Past the edge a pan moves the photo at this fraction of the finger. */
const RUBBER_BAND = 0.35

const SNAP = { duration: 400, dampingRatio: 0.8 } as const
const SETTLE = { duration: 400, dampingRatio: 1 } as const

/**
 * A photo you can pinch and double-tap into, inside a lightbox page.
 *
 * Every photo viewer people already use zooms. In ours a pinch did nothing,
 * which reads as broken rather than as a choice — the first thing anyone does
 * with a photo of a crowd is try to find a face in it.
 *
 * - **Pinch** zooms about the point between the fingers, and moving both
 *   fingers pans at the same time. It follows the fingers 1:1 on the UI thread.
 *   Let go below 1× and it springs home (400ms, 0.8 damping); past 4× it
 *   settles back to 4×.
 * - **Double-tap** zooms to 2× toward the tapped point, or back out to 1×.
 *   A tap carries no momentum, so it settles without overshoot.
 * - **One finger pans** only while zoomed, and keeps the finger's velocity on
 *   release (a decay that rubber-bands at the edges). Past an edge the photo
 *   moves at a third of the finger, so the edge is felt rather than hit.
 *
 * `onZoomChange` tells the lightbox when the photo is zoomed, so it can stop
 * the pager and the swipe-to-dismiss claiming drags meant for panning. It is
 * called at the start and end of a gesture, never per frame.
 *
 * The bounds are the photo's *fitted* rectangle, measured on load, not the
 * page: a landscape photo at 2× must not pan into its own letterbox.
 *
 * Reduce Motion: pinch still tracks the fingers — that is direct
 * manipulation — but a double-tap, and a release out of bounds, jump to where
 * they are going rather than travelling there.
 */
export function ZoomableImage({
  uri,
  width,
  height,
  active,
  onZoomChange,
}: {
  uri: string
  width: number
  height: number
  /** False once the page is swiped away; the zoom resets. */
  active: boolean
  onZoomChange: (zoomed: boolean) => void
}) {
  const reduceMotion = useReducedMotion()
  const [zoomed, setZoomed] = useState(false)
  // The photo's rectangle at 1×, once `contain` has fitted it into the page.
  const fitW = useSharedValue(width)
  const fitH = useSharedValue(height)

  const scale = useSharedValue(1)
  const tx = useSharedValue(0)
  const ty = useSharedValue(0)
  const startScale = useSharedValue(1)
  const startX = useSharedValue(0)
  const startY = useSharedValue(0)
  const focalX = useSharedValue(0)
  const focalY = useSharedValue(0)
  // While two fingers are down the pinch owns the position; a one-finger pan
  // still running from before the second finger landed must not also move it.
  const pinching = useSharedValue(false)

  const report = (next: boolean) => {
    setZoomed(next)
    onZoomChange(next)
  }

  // Swiped away: the zoom resets. The state is adjusted during render, not in
  // the effect, so leaving a page costs one render rather than two.
  const [wasActive, setWasActive] = useState(active)
  if (active !== wasActive) {
    setWasActive(active)
    if (!active) setZoomed(false)
  }

  useEffect(() => {
    if (active) return
    scale.set(1)
    tx.set(0)
    ty.set(0)
  }, [active, scale, tx, ty])

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      startScale.set(scale.get())
      startX.set(tx.get())
      startY.set(ty.get())
      focalX.set(e.focalX - width / 2)
      focalY.set(e.focalY - height / 2)
      pinching.set(true)
      scheduleOnRN(report, true)
    })
    .onUpdate((e) => {
      const s = Math.min(MAX_SCALE * 1.25, Math.max(MIN_PINCH_SCALE, startScale.get() * e.scale))
      // Keep the point that was under the fingers under them, wherever they move.
      const ratio = s / startScale.get()
      tx.set(e.focalX - width / 2 - (focalX.get() - startX.get()) * ratio)
      ty.set(e.focalY - height / 2 - (focalY.get() - startY.get()) * ratio)
      scale.set(s)
    })
    .onEnd(() => {
      pinching.set(false)
      const target = Math.min(MAX_SCALE, Math.max(1, scale.get()))
      const maxX = Math.max(0, (fitW.get() * target - width) / 2)
      const maxY = Math.max(0, (fitH.get() * target - height) / 2)
      const x = target === 1 ? 0 : Math.min(maxX, Math.max(-maxX, tx.get() * (target / scale.get())))
      const y = target === 1 ? 0 : Math.min(maxY, Math.max(-maxY, ty.get() * (target / scale.get())))
      if (reduceMotion) {
        scale.set(target)
        tx.set(x)
        ty.set(y)
      } else {
        scale.set(withSpring(target, SNAP))
        tx.set(withSpring(x, SNAP))
        ty.set(withSpring(y, SNAP))
      }
      scheduleOnRN(report, target > 1)
    })

  const pan = Gesture.Pan()
    .enabled(zoomed)
    .maxPointers(1)
    .onChange((e) => {
      if (pinching.get()) return
      const maxX = Math.max(0, (fitW.get() * scale.get() - width) / 2)
      const maxY = Math.max(0, (fitH.get() * scale.get() - height) / 2)
      const x = tx.get()
      const y = ty.get()
      tx.set(x + e.changeX * (Math.abs(x) > maxX ? RUBBER_BAND : 1))
      ty.set(y + e.changeY * (Math.abs(y) > maxY ? RUBBER_BAND : 1))
    })
    .onEnd((e) => {
      if (pinching.get()) return
      const maxX = Math.max(0, (fitW.get() * scale.get() - width) / 2)
      const maxY = Math.max(0, (fitH.get() * scale.get() - height) / 2)
      if (reduceMotion) {
        tx.set(Math.min(maxX, Math.max(-maxX, tx.get())))
        ty.set(Math.min(maxY, Math.max(-maxY, ty.get())))
        return
      }
      tx.set(withDecay({ velocity: e.velocityX, clamp: [-maxX, maxX], rubberBandEffect: true }))
      ty.set(withDecay({ velocity: e.velocityY, clamp: [-maxY, maxY], rubberBandEffect: true }))
    })

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      const zoomIn = scale.get() <= 1.01
      const target = zoomIn ? DOUBLE_TAP_SCALE : 1
      const maxX = Math.max(0, (fitW.get() * target - width) / 2)
      const maxY = Math.max(0, (fitH.get() * target - height) / 2)
      // At 1× the tapped point sits at (p − centre); at 2× it stays under the
      // finger when the photo moves by −(p − centre).
      const x = zoomIn ? Math.min(maxX, Math.max(-maxX, -(e.x - width / 2))) : 0
      const y = zoomIn ? Math.min(maxY, Math.max(-maxY, -(e.y - height / 2))) : 0
      if (reduceMotion) {
        scale.set(target)
        tx.set(x)
        ty.set(y)
      } else {
        scale.set(withSpring(target, SETTLE))
        tx.set(withSpring(x, SETTLE))
        ty.set(withSpring(y, SETTLE))
      }
      scheduleOnRN(report, zoomIn)
    })

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap)

  const photoStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: scale.get() }],
  }))

  return (
    // The detector sits on an untransformed page so the focal and tap points
    // arrive in page coordinates, whatever the photo's current transform.
    <GestureDetector gesture={gesture}>
      <View style={{ width, height }} collapsable={false}>
        <Animated.View style={[StyleSheet.absoluteFill, photoStyle]}>
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            // `contain`, not `cover`. This is the one place the whole frame
            // must be visible — every other slot in the app crops.
            contentFit="contain"
            cachePolicy="memory-disk"
            onLoad={(e) => {
              const { width: iw, height: ih } = e.source
              if (!iw || !ih) return
              const fit = Math.min(width / iw, height / ih)
              fitW.set(iw * fit)
              fitH.set(ih * fit)
            }}
          />
        </Animated.View>
      </View>
    </GestureDetector>
  )
}

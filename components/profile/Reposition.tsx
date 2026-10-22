import { Image } from 'expo-image'
import { useEffect, useMemo, useState } from 'react'
import { Modal, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { COLOR, SPACE, SPRING } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useReducedMotion } from '../../lib/motion'
import { clampOffset, clampZoom, coverScale, CROP_ASPECT, cropRect, MAX_ZOOM, maxOffset, type Size } from '../../lib/photoCrop'
import { mountRepositionHost, settleReposition, usePendingReposition, type RepositionPhoto } from '../../lib/photoReposition'
import { tint } from '../../lib/theme'
import { Button } from '../ds/Button'
import { font, useBoldText } from '../ds/shared'

/** The frame's inner rim and its rule-of-thirds lines (Flow 6 · 6.3 #08): white at 38% and 25%. */
const RIM = tint(COLOR.textPrimary, 0.38)
const THIRDS = tint(COLOR.textPrimary, 0.25)
/** A pinch below 1× resists, then springs home; the photo never shrinks away. */
const MIN_PINCH = 0.7
/** Past an edge a drag moves the photo at this fraction of the finger, so the edge is felt rather than hit. */
const RUBBER_BAND = 0.35
/** What one screen-reader step zooms by. */
const ZOOM_STEP = 0.5
/** Where the frame starts under the top inset: the frame's 120 under a 59 pt status bar. */
const FRAME_TOP = SPACE.xxxl + SPACE.md

const pickUp = () => H.drag()
const beyond = (value: number, max: number) => {
  'worklet'
  const over = Math.abs(value) - max
  return over > 0 ? Math.sign(value) * (max + over * RUBBER_BAND) : value
}

/**
 * Reposition (Flow 6 · 6.3 #08): the photo you chose, laid over the frame it will be cropped to, to drag and pinch. "Use photo"
 * keeps what is inside the frame; "Choose another" goes back to where photos come from. Nothing is cropped until Use photo.
 *
 * The photo always covers the frame: dragged past an edge it follows at a third of the finger and springs back on release
 * (`SPRING.settle`); a pinch zooms about the fingers up to 4×, below 1× it resists and returns. `H.drag` plays once, when a
 * finger first picks the photo up. Reduce Motion keeps the drag and the pinch (they are the hand) and lets go without a spring.
 * A screen reader gets the frame as an adjustable (swipe up or down to zoom) and the photo as it is, centred, from Use photo.
 */
export function Reposition({ photo, onUse, onAnother }: { photo: RepositionPhoto; onUse: (rect: ReturnType<typeof cropRect>) => void; onAnother: () => void }) {
  const bold = useBoldText()
  const reduceMotion = useReducedMotion()
  const insets = useSafeAreaInsets()
  const window = useWindowDimensions()
  // The room for the frame, measured: a short screen or a large type size shrinks the frame, never the buttons.
  const [room, setRoom] = useState<Size | null>(null)
  const frame = useMemo<Size | null>(() => {
    if (!room) return null
    const height = Math.round(Math.min(room.height, room.width * CROP_ASPECT))
    return { width: Math.round(height / CROP_ASPECT), height }
  }, [room])

  const zoom = useSharedValue(1)
  const tx = useSharedValue(0)
  const ty = useSharedValue(0)
  const startZoom = useSharedValue(1)
  const startX = useSharedValue(0)
  const startY = useSharedValue(0)
  const focalX = useSharedValue(0)
  const focalY = useSharedValue(0)
  // Fingers down: the pick-up plays when the count goes from none to some, not once per gesture.
  const held = useSharedValue(0)
  // Whether each gesture picked the photo up: a gesture that never started has nothing to put down.
  const panning = useSharedValue(false)
  const pinching = useSharedValue(false)

  const image: Size = { width: photo.width, height: photo.height }
  const size = frame ?? { width: window.width, height: Math.round(window.width * CROP_ASPECT) }
  const cover = coverScale(image, size)

  const settleTo = (z: number, x: number, y: number) => {
    'worklet'
    if (reduceMotion) {
      zoom.set(z)
      tx.set(x)
      ty.set(y)
    } else {
      zoom.set(withSpring(z, SPRING.settle))
      tx.set(withSpring(x, SPRING.settle))
      ty.set(withSpring(y, SPRING.settle))
    }
  }
  const release = () => {
    'worklet'
    const z = clampZoom(zoom.get())
    const o = clampOffset(image, size, z, { x: tx.get() * (z / zoom.get()), y: ty.get() * (z / zoom.get()) })
    settleTo(z, o.x, o.y)
  }
  const down = () => {
    'worklet'
    if (held.get() === 0) scheduleOnRN(pickUp)
    held.set(held.get() + 1)
  }
  const up = () => {
    'worklet'
    held.set(Math.max(0, held.get() - 1))
  }

  const pan = Gesture.Pan()
    .maxPointers(1)
    .onStart(() => {
      startX.set(tx.get())
      startY.set(ty.get())
      panning.set(true)
      down()
    })
    .onUpdate((e) => {
      const max = maxOffset(image, size, zoom.get())
      tx.set(beyond(startX.get() + e.translationX, max.x))
      ty.set(beyond(startY.get() + e.translationY, max.y))
    })
    .onFinalize(() => {
      if (!panning.get()) return
      panning.set(false)
      up()
      release()
    })

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      startZoom.set(zoom.get())
      startX.set(tx.get())
      startY.set(ty.get())
      focalX.set(e.focalX - size.width / 2)
      focalY.set(e.focalY - size.height / 2)
      pinching.set(true)
      down()
    })
    .onUpdate((e) => {
      const z = Math.min(MAX_ZOOM * 1.25, Math.max(MIN_PINCH, startZoom.get() * e.scale))
      const ratio = z / startZoom.get()
      // Keep the point that was under the fingers under them, wherever they move.
      tx.set(e.focalX - size.width / 2 - (focalX.get() - startX.get()) * ratio)
      ty.set(e.focalY - size.height / 2 - (focalY.get() - startY.get()) * ratio)
      zoom.set(z)
    })
    .onFinalize(() => {
      if (!pinching.get()) return
      pinching.set(false)
      up()
      release()
    })

  const gesture = Gesture.Simultaneous(pan, pinch)

  const photoStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: zoom.get() }],
  }))

  /** A screen reader's zoom: a step in or out, held inside the frame. */
  const step = (by: number) => {
    const z = clampZoom(zoom.get() + by)
    const o = clampOffset(image, size, z, { x: tx.get() * (z / zoom.get()), y: ty.get() * (z / zoom.get()) })
    zoom.set(z)
    tx.set(o.x)
    ty.set(o.y)
  }

  const use = () => onUse(cropRect(image, size, zoom.get(), { x: tx.get(), y: ty.get() }))

  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={[styles.root, { paddingTop: insets.top + FRAME_TOP }]}>
        <View testID="reposition-room" style={styles.room} onLayout={(e) => setRoom({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
          {frame ? (
            <GestureDetector gesture={gesture}>
              <View
                testID="reposition-frame"
                collapsable={false}
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel="Photo crop"
                accessibilityHint="Drag and pinch to move and zoom the photo. Swipe up or down to zoom."
                accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? ZOOM_STEP : -ZOOM_STEP)}
                style={[styles.frame, frame]}
              >
                <Animated.View style={[StyleSheet.absoluteFill, styles.center, photoStyle]}>
                  <Image
                    source={{ uri: photo.uri }}
                    // Decorative: the frame is the control, and it says what it is.
                    accessibilityElementsHidden
                    style={{ width: image.width * cover, height: image.height * cover }}
                    contentFit="fill"
                    cachePolicy="memory-disk"
                  />
                </Animated.View>
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.rim]} />
                {[1, 2].map((i) => (
                  <View key={`v${i}`} pointerEvents="none" style={[styles.vLine, { left: `${(i * 100) / 3}%` }]} />
                ))}
                {[1, 2].map((i) => (
                  <View key={`h${i}`} pointerEvents="none" style={[styles.hLine, { top: `${(i * 100) / 3}%` }]} />
                ))}
              </View>
            </GestureDetector>
          ) : null}
        </View>
        <Text style={[font('meta', bold), styles.caption]}>Drag and pinch. This is how your main photo is cropped.</Text>
        <View style={[styles.actions, { paddingBottom: insets.bottom + SPACE.xl }]}>
          <Button kind="strong" label="Use photo" onPress={use} disabled={!frame} testID="reposition-use" />
          <Button kind="tertiary" label="Choose another" onPress={onAnother} testID="reposition-another" />
        </View>
      </View>
    </GestureHandlerRootView>
  )
}

/**
 * The screen that is adding a photo mounts this once: it answers `requestReposition` with the reposition step in a full-screen
 * modal. Closing with the system back is a cancel. Nothing is drawn while nothing is asked.
 */
export function RepositionHost() {
  const photo = usePendingReposition()
  const reduceMotion = useReducedMotion()
  useEffect(() => mountRepositionHost(), [])
  return (
    <Modal visible={!!photo} animationType={reduceMotion ? 'none' : 'fade'} statusBarTranslucent onRequestClose={() => settleReposition({ kind: 'cancel' })}>
      {photo ? (
        <Reposition
          key={photo.uri}
          photo={photo}
          onUse={(rect) => settleReposition({ kind: 'use', rect })}
          onAnother={() => settleReposition({ kind: 'again' })}
        />
      ) : null}
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.ink },
  // The frame sits in what the caption and the buttons leave; centred, so a narrower frame is not pushed to a side.
  room: { flex: 1, alignItems: 'center', justifyContent: 'flex-start' },
  frame: { overflow: 'hidden', backgroundColor: COLOR.surface },
  center: { alignItems: 'center', justifyContent: 'center' },
  rim: { borderWidth: 1.5, borderColor: RIM },
  vLine: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: THIRDS },
  hLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: THIRDS },
  caption: { color: COLOR.textSecondary, textAlign: 'center', paddingHorizontal: SPACE.gutter, paddingTop: SPACE.lg },
  actions: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.xl, gap: SPACE.sm },
})

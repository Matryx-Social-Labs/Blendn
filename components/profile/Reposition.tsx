import { Image } from 'expo-image'
import { useEffect, useMemo, useState } from 'react'
import { Modal, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { COLOR, SPACE, SPRING, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { MODAL_FADE_MS, useQueuedModal } from '../../lib/modalTurn'
import { H } from '../../lib/haptics'
import { useReducedMotion } from '../../lib/motion'
import { clampOffset, clampZoom, coverScale, cropRect, maxOffset, maxZoomFor, pinchOffset, type Size } from '../../lib/photoCrop'
import { mountRepositionHost, settleReposition, usePendingReposition, type RepositionPhoto } from '../../lib/photoReposition'
import { tint } from '../../lib/theme'
import { Button } from '../ds/Button'
import { IconButton } from '../ds/IconButton'
import { PROFILE_HERO_ASPECT } from './ProfileHeroStage'
import { font, useBoldText } from '../ds/shared'

/** The frame's inner rim and its rule-of-thirds lines (Flow 6 · 6.3 #08): white at 38% and 25%. */
const RIM = tint(COLOR.textPrimary, 0.38)
const THIRDS = tint(COLOR.textPrimary, 0.25)
/** A pinch below 1× resists, then springs home; the photo never shrinks away. */
const MIN_PINCH = 0.7
/** Past an edge a drag moves the photo at this fraction of the finger, so the edge is felt rather than hit. */
const RUBBER_BAND = 0.35
/** What one screen-reader step zooms by, and how far one move goes (a tenth of the frame). */
const ZOOM_STEP = 0.5
const MOVE_STEP = 0.1
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
 * keeps what is inside the frame; "Choose another" goes back to where photos come from; the × closes it, as the system back does.
 * Nothing is cropped until Use photo.
 *
 * The photo always covers the frame: dragged past an edge it follows at a third of the finger and springs back on release
 * (`SPRING.settle`); a pinch zooms about the fingers up to 4× (less in a small photo: `maxZoomFor` keeps the crop sharp), below 1×
 * it resists and returns. The drag and the pinch can be on at once (two fingers move the photo while they zoom it): they share one
 * unbounded position, the pinch owns it while it is down, and the photo settles only when the last finger is up. `H.drag` plays
 * once, when a finger first picks the photo up. A double tap toggles 1× and 2×, a tap centres. Reduce Motion keeps the hand and lets
 * go without a spring.
 *
 * A screen reader gets the frame as an adjustable with its zoom as the value (swipe up or down to zoom) and the actions Move
 * photo left, right, up and down, in tenths of the frame, held where the frame stays covered.
 */
export function Reposition({
  photo,
  onUse,
  onAnother,
  onClose,
}: {
  photo: RepositionPhoto
  onUse: (rect: ReturnType<typeof cropRect>) => void
  onAnother: () => void
  onClose?: () => void
}) {
  const bold = useBoldText()
  const reduceMotion = useReducedMotion()
  const insets = useSafeAreaInsets()
  const window = useWindowDimensions()
  // The room for the frame, measured: a short screen or a large type size shrinks the frame, never the buttons.
  const [room, setRoom] = useState<Size | null>(null)
  const frame = useMemo<Size | null>(() => {
    if (!room) return null
    const height = Math.round(Math.min(room.height, room.width * PROFILE_HERO_ASPECT))
    return { width: Math.round(height / PROFILE_HERO_ASPECT), height }
  }, [room])

  const zoom = useSharedValue(1)
  // Where the photo is drawn (`tx`, `ty`, banded past an edge) and where the hand has put it (`raw`, unbounded).
  const tx = useSharedValue(0)
  const ty = useSharedValue(0)
  const rawX = useSharedValue(0)
  const rawY = useSharedValue(0)
  const startZoom = useSharedValue(1)
  const startX = useSharedValue(0)
  const startY = useSharedValue(0)
  const focalX = useSharedValue(0)
  const focalY = useSharedValue(0)
  // Fingers down: the pick-up plays when the count goes from none to some, and the photo settles when it is back to none.
  const held = useSharedValue(0)
  // Whether each gesture picked the photo up: a gesture that never started has nothing to put down.
  const panning = useSharedValue(false)
  const pinching = useSharedValue(false)
  // What the reader hears; moved by the settle and the steps, never per frame.
  const [zoomNow, setZoomNow] = useState(1)

  const image: Size = { width: photo.width, height: photo.height }
  const size = frame ?? { width: window.width, height: Math.round(window.width * PROFILE_HERO_ASPECT) }
  const cover = coverScale(image, size)
  const maxZoom = maxZoomFor(image, size)

  const reportZoom = (z: number) => setZoomNow(Math.round(z * 10) / 10)

  const settleTo = (z: number, x: number, y: number) => {
    'worklet'
    rawX.set(x)
    rawY.set(y)
    if (reduceMotion) {
      zoom.set(z)
      tx.set(x)
      ty.set(y)
    } else {
      zoom.set(withSpring(z, SPRING.settle))
      tx.set(withSpring(x, SPRING.settle))
      ty.set(withSpring(y, SPRING.settle))
    }
    scheduleOnRN(reportZoom, z)
  }
  const release = () => {
    'worklet'
    const z = clampZoom(zoom.get(), maxZoom)
    const k = z / zoom.get()
    const o = clampOffset(image, size, z, { x: rawX.get() * k, y: rawY.get() * k })
    settleTo(z, o.x, o.y)
  }
  const down = () => {
    'worklet'
    if (held.get() === 0) scheduleOnRN(pickUp)
    held.set(held.get() + 1)
  }
  /** A finger gesture is over: the photo settles when it was the last one. */
  const up = () => {
    'worklet'
    held.set(Math.max(0, held.get() - 1))
    if (held.get() === 0) release()
  }

  const pan = Gesture.Pan()
    .maxPointers(1)
    .onStart(() => {
      panning.set(true)
      down()
    })
    .onChange((e) => {
      // While two fingers are down the pinch owns the position.
      if (pinching.get()) return
      rawX.set(rawX.get() + e.changeX)
      rawY.set(rawY.get() + e.changeY)
      const max = maxOffset(image, size, zoom.get())
      tx.set(beyond(rawX.get(), max.x))
      ty.set(beyond(rawY.get(), max.y))
    })
    .onFinalize(() => {
      if (!panning.get()) return
      panning.set(false)
      up()
    })

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      startZoom.set(zoom.get())
      startX.set(rawX.get())
      startY.set(rawY.get())
      focalX.set(e.focalX - size.width / 2)
      focalY.set(e.focalY - size.height / 2)
      pinching.set(true)
      down()
    })
    .onUpdate((e) => {
      const z = Math.min(maxZoom * 1.25, Math.max(MIN_PINCH, startZoom.get() * e.scale))
      const at = pinchOffset(
        { x: e.focalX - size.width / 2, y: e.focalY - size.height / 2 },
        { x: focalX.get(), y: focalY.get() },
        { x: startX.get(), y: startY.get() },
        z / startZoom.get()
      )
      rawX.set(at.x)
      rawY.set(at.y)
      const max = maxOffset(image, size, z)
      tx.set(beyond(at.x, max.x))
      ty.set(beyond(at.y, max.y))
      zoom.set(z)
    })
    .onFinalize(() => {
      if (!pinching.get()) return
      pinching.set(false)
      up()
    })

  // A double tap toggles 1× and 2× about the tapped point; a single tap brings the photo back to the middle.
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      const target = zoom.get() <= 1.01 ? Math.min(2, maxZoom) : 1
      const o = clampOffset(
        image,
        size,
        target,
        pinchOffset({ x: e.x - size.width / 2, y: e.y - size.height / 2 }, { x: e.x - size.width / 2, y: e.y - size.height / 2 }, { x: rawX.get(), y: rawY.get() }, target / zoom.get())
      )
      settleTo(target, target === 1 ? 0 : o.x, target === 1 ? 0 : o.y)
    })
  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .requireExternalGestureToFail(doubleTap)
    .onEnd(() => {
      settleTo(zoom.get(), 0, 0)
    })

  pan.withTestId('reposition-pan')
  pinch.withTestId('reposition-pinch')
  doubleTap.withTestId('reposition-double-tap')
  singleTap.withTestId('reposition-tap')

  const gesture = Gesture.Simultaneous(Gesture.Exclusive(doubleTap, singleTap), pan, pinch)

  const photoStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: zoom.get() }],
  }))

  /** A screen reader's zoom and moves (JS thread): a step, held inside the frame. */
  const zoomBy = (by: number) => {
    const z = clampZoom(zoom.get() + by, maxZoom)
    const k = z / zoom.get()
    const o = clampOffset(image, size, z, { x: tx.get() * k, y: ty.get() * k })
    zoom.set(z)
    tx.set(o.x)
    ty.set(o.y)
    rawX.set(o.x)
    rawY.set(o.y)
    reportZoom(z)
  }
  const moveBy = (dx: number, dy: number) => {
    const o = clampOffset(image, size, zoom.get(), { x: tx.get() + dx * size.width, y: ty.get() + dy * size.height })
    tx.set(o.x)
    ty.set(o.y)
    rawX.set(o.x)
    rawY.set(o.y)
  }
  const onAction = (name: string) => {
    if (name === 'increment') zoomBy(ZOOM_STEP)
    else if (name === 'decrement') zoomBy(-ZOOM_STEP)
    else if (name === 'moveLeft') moveBy(-MOVE_STEP, 0)
    else if (name === 'moveRight') moveBy(MOVE_STEP, 0)
    else if (name === 'moveUp') moveBy(0, -MOVE_STEP)
    else if (name === 'moveDown') moveBy(0, MOVE_STEP)
  }

  const use = () => onUse(cropRect(image, size, zoom.get(), { x: tx.get(), y: ty.get() }))

  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={[styles.root, { paddingTop: insets.top + FRAME_TOP }]}>
        {onClose ? (
          <View style={[styles.close, { top: insets.top + SPACE.sm }]}>
            <IconButton icon="x" accessibilityLabel="Close" onPress={onClose} testID="reposition-close" />
          </View>
        ) : null}
        <View testID="reposition-room" style={styles.room} onLayout={(e) => setRoom({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
          {frame ? (
            <GestureDetector gesture={gesture}>
              <View
                testID="reposition-frame"
                collapsable={false}
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel="Photo crop"
                accessibilityValue={{ text: `Zoom ${zoomNow} times` }}
                accessibilityHint="Drag and pinch to move and zoom the photo. Swipe up or down to zoom. Double tap to zoom in or out."
                accessibilityActions={[
                  { name: 'increment' },
                  { name: 'decrement' },
                  { name: 'moveLeft', label: 'Move photo left' },
                  { name: 'moveRight', label: 'Move photo right' },
                  { name: 'moveUp', label: 'Move photo up' },
                  { name: 'moveDown', label: 'Move photo down' },
                ]}
                onAccessibilityAction={(e) => onAction(e.nativeEvent.actionName)}
                style={[styles.frame, frame]}
              >
                <Animated.View style={[StyleSheet.absoluteFill, styles.center, photoStyle]}>
                  <Image
                    source={{ uri: photo.uri }}
                    // Decorative: the frame is the control, and it says what it is.
                    accessibilityElementsHidden
                    style={{ width: image.width * cover, height: image.height * cover }}
                    contentFit="fill"
                    // Memory only: the file is temporary and goes with the step, so the disk cache never keeps a copy of it.
                    cachePolicy="memory"
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
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.caption]}>
          {photo.main === false ? 'Drag and pinch. This is how this photo is cropped.' : 'Drag and pinch. This is how your main photo is cropped.'}
        </Text>
        <View style={[styles.actions, { paddingBottom: insets.bottom + SPACE.xl }]}>
          <Button kind="lit" label="Use photo" onPress={use} disabled={!frame} testID="reposition-use" />
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
  // One Modal on screen at a time on iOS (lib/modalTurn).
  // A link mid-crop is a cancel, as system back is: the crop is let go.
  const turn = useQueuedModal(!!photo, { animationMs: reduceMotion ? 0 : MODAL_FADE_MS, closeForLink: () => settleReposition({ kind: 'cancel' }) })
  return (
    <Modal
      visible={turn.visible}
      animationType={reduceMotion ? 'none' : 'fade'}
      statusBarTranslucent
      onRequestClose={() => settleReposition({ kind: 'cancel' })}
      onShow={turn.onShow}
      onDismiss={turn.onDismiss}
    >
      {photo ? (
        <Reposition
          key={photo.uri}
          photo={photo}
          onUse={(rect) => settleReposition({ kind: 'use', rect })}
          onAnother={() => settleReposition({ kind: 'again' })}
          onClose={() => settleReposition({ kind: 'cancel' })}
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
  close: { position: 'absolute', left: SPACE.lg, zIndex: 2 },
  rim: { borderWidth: 1.5, borderColor: RIM },
  vLine: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: THIRDS },
  hLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: THIRDS },
  caption: { color: COLOR.textSecondary, textAlign: 'center', paddingHorizontal: SPACE.gutter, paddingTop: SPACE.lg },
  actions: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.xl, gap: SPACE.sm },
})

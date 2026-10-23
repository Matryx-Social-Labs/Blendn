import { barTop } from '../../lib/barGeometry'
import { Image } from 'expo-image'
import { useCallback, useEffect, useState } from 'react'
import { Modal, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { COLOR, EASING, FONT_FAMILY, MATERIAL, RADIUS, SPACE, SPRING } from '../../lib/design/tokens'
import { useQueuedModal } from '../../lib/modalTurn'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { Avatar } from './Avatar'
import { avatarOf, BUBBLE, timeFont, type ChatPerson, type Rect } from './chatShared'
import { IconButton } from './IconButton'
import { font, useBoldText, useScreenReader } from './shared'

/** Pinch stops at 4×; a screen reader's Zoom in goes to 2×. */
const MAX_ZOOM = 4
const ZOOM_STEP = 2
/** A drag down dismisses past 140 pt or at 900 pt/s, as the Blend'n overlay does (#7). */
const DISMISS = { distance: 140, velocity: 900 } as const

export type ImageViewerProps = {
  visible: boolean
  uri: string
  sender: ChatPerson
  time: string
  /** ×, a drag down, Android's back. */
  onClose: () => void
  /** ⋯: Save and Report (the screen's sheet; Save plays H.success on the answer). */
  onMore?: () => void
  /** The bubble's frame: it travels from there (#33). */
  from?: Rect | null
  testID?: string
}

type Size = { width: number; height: number }

/** The photo as `contain` draws it: the natural size scaled to fit the window. Unknown until it loads: the window. */
export function fittedSize(natural: Size | null, window: Size): Size {
  'worklet'
  if (!natural || !natural.width || !natural.height) return window
  const scale = Math.min(window.width / natural.width, window.height / natural.height)
  return { width: natural.width * scale, height: natural.height * scale }
}

/**
 * Zoomed in, the photo pans no further than its own overhang past the window
 * on that axis (none while it still fits), so a letterboxed photo can't leave
 * the screen either.
 */
export function clampPan(value: number, fitted: number, window: number, zoom: number) {
  'worklet'
  const max = Math.max(0, (fitted * zoom - window) / 2)
  return Math.max(-max, Math.min(max, value))
}

/** Pinch to zoom, pan while zoomed, drag down to dismiss, tap for the chrome. */
function useViewerGestures({
  window,
  onClose,
  onTap,
  testID,
}: {
  window: Size
  onClose: () => void
  onTap: () => void
  testID?: string
}) {
  const fitted = useSharedValue<Size>(window)
  const zoom = useSharedValue(1)
  const zoomFrom = useSharedValue(1)
  const panX = useSharedValue(0)
  const panY = useSharedValue(0)
  const panFrom = useSharedValue({ x: 0, y: 0 })
  const drop = useSharedValue(0)
  const close = useCallback(() => onClose(), [onClose])

  const zoomTo = (to: number) => {
    'worklet'
    zoom.set(withSpring(to, SPRING.settle))
    panX.set(withSpring(clampPan(panX.get(), fitted.get().width, window.width, to), SPRING.settle))
    panY.set(withSpring(clampPan(panY.get(), fitted.get().height, window.height, to), SPRING.settle))
  }
  const reset = () => {
    zoom.set(1)
    panX.set(0)
    panY.set(0)
    drop.set(0)
  }

  const pinch = Gesture.Pinch()
    .onStart(() => zoomFrom.set(zoom.get()))
    .onUpdate((e) => zoom.set(Math.min(MAX_ZOOM, Math.max(1, zoomFrom.get() * e.scale))))
    .onEnd(() => zoomTo(zoom.get()))
  const drag = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => panFrom.set({ x: panX.get(), y: panY.get() }))
    .onUpdate((e) => {
      const z = zoom.get()
      if (z > 1) {
        panX.set(clampPan(panFrom.get().x + e.translationX, fitted.get().width, window.width, z))
        panY.set(clampPan(panFrom.get().y + e.translationY, fitted.get().height, window.height, z))
        return
      }
      drop.set(e.translationY)
    })
    .onEnd((e, success) => {
      if (zoom.get() > 1) return
      // A cancelled drag springs back; it never closes.
      if (success && (drop.get() > DISMISS.distance || e.velocityY > DISMISS.velocity)) {
        scheduleOnRN(close)
        return
      }
      drop.set(withSpring(0, { ...SPRING.fling, velocity: e.velocityY }))
    })
  const tap = Gesture.Tap().onStart(() => scheduleOnRN(onTap))
  if (testID) {
    drag.withTestId(`${testID}-drag`)
    tap.withTestId(`${testID}-tap`)
  }
  /** The photo's natural size, once it has loaded. */
  const loaded = (natural: Size) => fitted.set(fittedSize(natural, window))
  return { gesture: Gesture.Race(Gesture.Simultaneous(pinch, drag), tap), zoom, panX, panY, drop, reset, zoomTo, loaded }
}

/**
 * A photo from a bubble (guidelines/components/ImageViewer.html, ROUND3 D 5.9):
 * full-bleed on ink, contained, never cropped. The chrome is two media
 * circles, × and ⋯, and one line at the foot: the sender's creature, name and
 * time. A tap toggles the chrome (never while a screen reader runs), pinch
 * zooms and, zoomed, a drag pans; unzoomed, a drag down tracks 1:1 and
 * dismisses past 140 pt or a fling, springing back on `M.fling` short of it.
 * × does the same for anyone who doesn't drag. Nothing animates while you look.
 *
 * Motion #33: it travels from the bubble's frame on `M.travel` while the ink
 * fades in. Reduce Motion: it fades over 200 ms. No haptic. Read: Close, the
 * photo ("Photo from Cosmic Panda, 9:52 PM", with Zoom in and Zoom out as its
 * actions), More, the sender's line.
 *
 * ponytail: the close doesn't travel back to the bubble (it unmounts); the
 * page's gradient scrims are a scrim pill under the foot line (a gradient
 * belongs to <GradientFill> alone, and the circles are media glass).
 */
export function ImageViewer({ visible, uri, sender, time, onClose, onMore, from, testID }: ImageViewerProps) {
  const window = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const bold = useBoldText()
  const screenReader = useScreenReader()
  const reduceMotion = useReducedMotion()
  const [chrome, setChrome] = useState(true)
  // The chrome comes back each time it opens (state adjusted in render, not in an effect).
  const [openedFor, setOpenedFor] = useState(visible)
  if (visible !== openedFor) {
    setOpenedFor(visible)
    if (visible) setChrome(true)
  }

  const open = useSharedValue(0)
  const travel = !!from && !reduceMotion
  const toggle = useCallback(() => setChrome((on) => !on), [])
  const { gesture, zoom, panX, panY, drop, reset, zoomTo, loaded } = useViewerGestures({ window, onClose, onTap: toggle, testID })

  useEffect(() => {
    if (!visible) {
      // Back to where an open starts, so the next one's first frame is right.
      reset()
      open.set(0)
      return
    }
    const fade = withTiming(1, { duration: motionTokens(reduceMotion).duration.base, easing: Easing.bezier(...EASING.gentle) })
    open.set(travel ? withSpring(1, SPRING.travel) : fade)
    // On opening and closing only; the rest is read as it stood then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const photoStyle = useAnimatedStyle(() => {
    const p = open.get()
    const s = travel && from ? from.width / window.width : 1
    const tx = travel && from ? (from.x + from.width / 2 - window.width / 2) * (1 - p) : 0
    const ty = travel && from ? (from.y + from.height / 2 - window.height / 2) * (1 - p) : 0
    return {
      opacity: travel ? 1 : p,
      transform: [
        { translateX: tx + panX.get() },
        { translateY: ty + panY.get() + drop.get() },
        { scale: (s + (1 - s) * p) * zoom.get() },
      ],
    }
  })
  const inkStyle = useAnimatedStyle(() => ({
    opacity: open.get() * (1 - Math.min(1, Math.abs(drop.get()) / (DISMISS.distance * 2))),
  }))
  const shown = chrome || screenReader

  // One Modal on screen at a time on iOS (lib/modalTurn).
  const turn = useQueuedModal(visible, onClose)
  return (
    <Modal
      testID={testID && `${testID}-modal`}
      visible={turn.visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
      onShow={turn.onShow}
      onDismiss={turn.onDismiss}
    >
      <GestureHandlerRootView style={styles.fill}>
        <View style={styles.fill} accessibilityViewIsModal onAccessibilityEscape={onClose}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.ink, inkStyle]} />
          {shown ? (
            <View style={[styles.chrome, { top: barTop(insets.top), left: SPACE.lg }]}>
              <IconButton icon="x" tier="media" accessibilityLabel="Close" onPress={onClose} />
            </View>
          ) : null}
          <GestureDetector gesture={gesture}>
            <Animated.View
              accessible
              accessibilityRole="image"
              accessibilityLabel={`Photo from ${sender.name}, ${time}`}
              accessibilityActions={[
                { name: 'zoomIn', label: 'Zoom in' },
                { name: 'zoomOut', label: 'Zoom out' },
              ]}
              onAccessibilityAction={(e) => zoomTo(e.nativeEvent.actionName === 'zoomIn' ? ZOOM_STEP : 1)}
              style={[StyleSheet.absoluteFill, photoStyle]}
            >
              <Image
                source={{ uri }}
                style={styles.fill}
                contentFit="contain"
                accessible={false}
                onLoad={(e) => loaded({ width: e.source.width, height: e.source.height })}
              />
            </Animated.View>
          </GestureDetector>
          {shown ? (
            <>
              {onMore ? (
                <View style={[styles.chrome, { top: barTop(insets.top), right: SPACE.lg }]}>
                  <IconButton icon="ellipsis" tier="media" accessibilityLabel="More" onPress={onMore} />
                </View>
              ) : null}
              <View
                accessible
                accessibilityLabel={`${sender.name}, ${time}`}
                style={[styles.chrome, styles.foot, { bottom: insets.bottom + SPACE.xl }]}
              >
                <Avatar {...avatarOf(sender, BUBBLE.avatar)} />
                <Text numberOfLines={1} style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.name]}>
                  {sender.name}
                </Text>
                <Text style={timeFont(bold)}>{time}</Text>
              </View>
            </>
          ) : null}
        </View>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  ink: { backgroundColor: COLOR.ink },
  chrome: { position: 'absolute', zIndex: 1 },
  foot: {
    left: SPACE.xl,
    right: SPACE.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.capsule,
    backgroundColor: MATERIAL.scrimPill,
  },
  name: { flex: 1, color: COLOR.textPrimary },
})

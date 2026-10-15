import { Image } from 'expo-image'
import { useCallback, useEffect, useState } from 'react'
import { Modal, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { COLOR, EASING, FONT_FAMILY, MATERIAL, RADIUS, SPACE, SPRING } from '../../lib/design/tokens'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { Avatar } from './Avatar'
import { avatarOf, BUBBLE, timeFont, type ChatPerson, type Rect } from './chatShared'
import { IconButton } from './IconButton'
import { font, useBoldText, useScreenReader } from './shared'

/** Pinch stops at 4×. */
const MAX_ZOOM = 4
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
 * photo ("Photo from Cosmic Panda, 9:52 PM"), More, the sender's line.
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
  const zoom = useSharedValue(1)
  const zoomFrom = useSharedValue(1)
  const panX = useSharedValue(0)
  const panY = useSharedValue(0)
  const panFrom = useSharedValue({ x: 0, y: 0 })
  const drop = useSharedValue(0)
  const travel = !!from && !reduceMotion

  useEffect(() => {
    if (!visible) return
    zoom.set(1)
    panX.set(0)
    panY.set(0)
    drop.set(0)
    const fade = withTiming(1, { duration: motionTokens(reduceMotion).duration.base, easing: Easing.bezier(...EASING.gentle) })
    open.set(withSequence(withTiming(0, { duration: 0 }), travel ? withSpring(1, SPRING.travel) : fade))
    // On opening only; the rest is read as it stood then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const toggle = useCallback(() => setChrome((on) => !on), [])
  const close = useCallback(() => onClose(), [onClose])

  const pinch = Gesture.Pinch()
    .onStart(() => zoomFrom.set(zoom.get()))
    .onUpdate((e) => zoom.set(Math.min(MAX_ZOOM, Math.max(1, zoomFrom.get() * e.scale))))
    .onEnd(() => {
      if (zoom.get() > 1) return
      panX.set(withSpring(0, SPRING.settle))
      panY.set(withSpring(0, SPRING.settle))
    })
  const drag = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => panFrom.set({ x: panX.get(), y: panY.get() }))
    .onUpdate((e) => {
      if (zoom.get() > 1) {
        panX.set(panFrom.get().x + e.translationX)
        panY.set(panFrom.get().y + e.translationY)
        return
      }
      drop.set(e.translationY)
    })
    .onEnd((e) => {
      if (zoom.get() > 1) return
      if (drop.get() > DISMISS.distance || e.velocityY > DISMISS.velocity) {
        scheduleOnRN(close)
        return
      }
      drop.set(withSpring(0, { ...SPRING.fling, velocity: e.velocityY }))
    })
  const tap = Gesture.Tap().onStart(() => scheduleOnRN(toggle))
  if (testID) {
    drag.withTestId(`${testID}-drag`)
    tap.withTestId(`${testID}-tap`)
  }
  const gesture = Gesture.Race(Gesture.Simultaneous(pinch, drag), tap)

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

  return (
    <Modal
      testID={testID && `${testID}-modal`}
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.fill}>
        <View style={styles.fill} accessibilityViewIsModal onAccessibilityEscape={onClose}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.ink, inkStyle]} />
          {shown ? (
            <View style={[styles.chrome, { top: insets.top + SPACE.sm, left: SPACE.lg }]}>
              <IconButton icon="x" tier="media" accessibilityLabel="Close" onPress={onClose} />
            </View>
          ) : null}
          <GestureDetector gesture={gesture}>
            <Animated.View
              accessible
              accessibilityRole="image"
              accessibilityLabel={`Photo from ${sender.name}, ${time}`}
              style={[StyleSheet.absoluteFill, photoStyle]}
            >
              <Image source={{ uri }} style={styles.fill} contentFit="contain" accessible={false} />
            </Animated.View>
          </GestureDetector>
          {shown ? (
            <>
              {onMore ? (
                <View style={[styles.chrome, { top: insets.top + SPACE.sm, right: SPACE.lg }]}>
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

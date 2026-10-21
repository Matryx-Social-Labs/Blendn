import { barTop } from '../../lib/barGeometry'
import { useCallback, useEffect, useState } from 'react'
import { FlatList, Modal, Platform, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import type { Rect } from '../ds/chatShared'
import { IconButton } from '../ds/IconButton'
import { monoCaption, ScrimPill } from '../ds/MonoFamily'
import { useBoldText } from '../ds/shared'
import { ZoomableImage } from '../motion/ZoomableImage'
import { COLOR, EASING, SIZE, SPACE, SPRING } from '../../lib/design/tokens'
import { motionTokens, useReducedMotion } from '../../lib/motion'

/** A drag past 140 pt, or a fling past 900 pt/s, dismisses: the DS ImageViewer's numbers. */
export const DISMISS = { distance: 140, velocity: 900 } as const

/** Which page a horizontal offset rests on, never out of range. */
export const pageAt = (offsetX: number, width: number, count: number) =>
  Math.max(0, Math.min(count - 1, width > 0 ? Math.round(offsetX / width) : 0))

/** "2 / 5" for the pill, "Photo 2 of 5" for a screen reader. Nothing for a single photo. */
export const counterOf = (index: number, count: number) => (count > 1 ? { text: `${index + 1} / ${count}`, spoken: `Photo ${index + 1} of ${count}` } : null)

export type PhotoViewerProps = {
  photos: string[]
  initialIndex?: number
  visible: boolean
  onClose: () => void
  /** The thumbnail it opens from: the viewer travels from there (DS #33). Absent, or under Reduce Motion, it fades in. */
  from?: Rect | null
  testID?: string
}

/**
 * A profile's photos, full-screen and paged (the DS ImageViewer's chrome, for a gallery: audit §3 item 2). Full-bleed ink, each photo
 * contained and never cropped. The chrome is the 44 pt Close at the top left, under the Dynamic Island, and a Geist Mono "2 / 5" on a
 * scrim pill at the top, centred; a single photo has no counter. Swipe sideways between photos; pinch or double-tap zooms (a zoomed
 * photo owns every drag); a drag down tracks 1:1 and dismisses past 140 pt or a fling, springing back on `M.fling` short of it.
 *
 * Motion #33: it travels from the thumbnail's frame on `M.travel` while the ink fades in. Reduce Motion: it fades over 200 ms.
 * No haptic: opening, paging and closing are navigation, and the DS ImageViewer plays none either.
 *
 * Read: the page is modal, Close first, then where you are, then the photo ("Photo 2 of 5").
 */
export function PhotoViewer({ photos, initialIndex = 0, visible, onClose, from, testID }: PhotoViewerProps) {
  const window = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const bold = useBoldText()
  const reduceMotion = useReducedMotion()
  const circle = Platform.OS === 'android' ? SIZE.circleButtonAndroid : SIZE.circleButton
  const top = barTop(insets.top)
  const start = Math.max(0, Math.min(photos.length - 1, initialIndex))

  const [index, setIndex] = useState(start)
  const [zoomed, setZoomed] = useState(false)
  // It opens on the photo that was tapped (state adjusted in render, not in an effect).
  const [openedFor, setOpenedFor] = useState(visible)
  if (visible !== openedFor) {
    setOpenedFor(visible)
    if (visible) {
      setIndex(start)
      setZoomed(false)
    }
  }

  const open = useSharedValue(0)
  const drop = useSharedValue(0)
  const travel = !!from && !reduceMotion

  useEffect(() => {
    if (!visible) {
      open.set(0)
      drop.set(0)
      return
    }
    const fade = withTiming(1, { duration: motionTokens(reduceMotion).duration.base, easing: Easing.bezier(...EASING.gentle) })
    open.set(travel ? withSpring(1, SPRING.travel) : fade)
    // On opening and closing only: the rest is read as it stood then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const dismiss = useCallback(() => onClose(), [onClose])
  const drag = Gesture.Pan()
    .enabled(!zoomed)
    .maxPointers(1)
    // Vertical only: a sideways swipe belongs to the pager underneath.
    .activeOffsetY([-12, 12])
    .failOffsetX([-20, 20])
    .onUpdate((e) => drop.set(e.translationY))
    .onEnd((e, success) => {
      // A cancelled drag springs back; it never closes.
      if (success && (Math.abs(drop.get()) > DISMISS.distance || Math.abs(e.velocityY) > DISMISS.velocity)) {
        scheduleOnRN(dismiss)
        return
      }
      drop.set(withSpring(0, { ...SPRING.fling, velocity: e.velocityY }))
    })

  const pagerStyle = useAnimatedStyle(() => {
    const p = open.get()
    const s = travel && from ? from.width / window.width : 1
    const tx = travel && from ? (from.x + from.width / 2 - window.width / 2) * (1 - p) : 0
    const ty = travel && from ? (from.y + from.height / 2 - window.height / 2) * (1 - p) : 0
    return {
      opacity: travel ? 1 : p,
      transform: [{ translateX: tx }, { translateY: ty + drop.get() }, { scale: s + (1 - s) * p }],
    }
  })
  const inkStyle = useAnimatedStyle(() => ({
    opacity: open.get() * (1 - Math.min(1, Math.abs(drop.get()) / (DISMISS.distance * 2))),
  }))

  const onSettle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = pageAt(e.nativeEvent.contentOffset.x, window.width, photos.length)
    if (next === index) return
    setIndex(next)
    setZoomed(false)
  }

  const counter = counterOf(index, photos.length)

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
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.ink, inkStyle]} />

          {/* The chrome is read before the pictures: Close is first, then where you are. */}
          <View testID={testID && `${testID}-chrome`} pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.chromeLayer]}>
            <View style={[styles.close, { top, left: SPACE.lg }]}>
              <IconButton icon="x" tier="media" accessibilityLabel="Close" onPress={onClose} testID={testID && `${testID}-close`} />
            </View>
            {counter ? (
              <View pointerEvents="none" style={[styles.counterRow, { top, height: circle }]}>
                <View accessible accessibilityLabel={counter.spoken} testID={testID && `${testID}-counter`}>
                  <ScrimPill>
                    <Text style={[monoCaption(bold), styles.counterText]}>{counter.text}</Text>
                  </ScrimPill>
                </View>
              </View>
            ) : null}
          </View>

          <GestureDetector gesture={drag}>
            <Animated.View style={[styles.fill, pagerStyle]}>
              <FlatList
                testID={testID && `${testID}-pager`}
                data={photos}
                keyExtractor={(uri, i) => `${i}:${uri}`}
                horizontal
                pagingEnabled
                // A zoomed photo owns every drag: the pager stands down until it is back at 1×.
                scrollEnabled={!zoomed}
                showsHorizontalScrollIndicator={false}
                initialScrollIndex={start}
                getItemLayout={(_, i) => ({ length: window.width, offset: window.width * i, index: i })}
                onMomentumScrollEnd={onSettle}
                renderItem={({ item, index: i }) => (
                  <View
                    accessible
                    accessibilityRole="image"
                    // The counter says where you are in the set; the page only names itself, so nothing is read twice.
                    accessibilityLabel={photos.length > 1 ? `Photo ${i + 1}` : 'Photo'}
                    style={{ width: window.width, height: window.height }}
                  >
                    <ZoomableImage uri={item} width={window.width} height={window.height} active={i === index} onZoomChange={setZoomed} />
                  </View>
                )}
              />
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  ink: { backgroundColor: COLOR.ink },
  // First in the tree (reading order) and drawn above the pager that follows it, or the pager takes the Close's taps.
  chromeLayer: { zIndex: 2, elevation: 2 },
  close: { position: 'absolute', zIndex: 10 },
  counterRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  counterText: { color: COLOR.textPrimary },
})

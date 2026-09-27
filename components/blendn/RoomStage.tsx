import React, { createContext, useCallback, useContext, useEffect, useImperativeHandle, useMemo } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { MOTION_SPRING } from '../../lib/motion'
import { CONTROL, EMBER, EMBER_RADIUS } from '../../lib/theme'

/** Past this, a slow drag closes. */
const CLOSE_DISTANCE = 140
/** A flick this fast closes from any distance. */
const CLOSE_VELOCITY = 900
const OPEN_MS = 420
const CLOSE_MS = 300
const EASE = Easing.bezier(0.2, 0, 0, 1)

/**
 * Where the Blend'n button's centre is, from the screen's top-left.
 *
 * Mirrors the bar's geometry in `app/(tabs)/_layout.tsx` — the disc is seated
 * in the 56pt line above `tabBarBottomPadding`. Duplicated as arithmetic
 * rather than imported because importing the tab layout from a root route
 * would pull the whole bar module into this screen; `__tests__` pins the two
 * together.
 */
export function centreButtonOrigin(width: number, height: number, bottomInset: number) {
  const bottomPad = Math.max(bottomInset - 6, 20)
  return { x: width / 2, y: height - bottomPad - CONTROL.lg / 2 }
}

interface StageApi {
  /** Runs the close (back into the button) and then calls `onClosed`. */
  close(): void
  /** For a scroll view inside, so the drag-to-close waits for it to reach the top. */
  scrollY: SharedValue<number>
  /** Pass to the scroll view's `simultaneousHandlers` / a `Gesture.Native()`. */
  pan: GestureType
}

const StageContext = createContext<StageApi | null>(null)
export const useStage = () => {
  const api = useContext(StageContext)
  if (!api) throw new Error('useStage outside RoomStage')
  return api
}

/**
 * For a scroll view on the stage: reports its offset (so drag-to-close waits
 * for the top) and a native gesture that runs alongside the stage's pan rather
 * than racing it. Spread `onScroll` on an `Animated` scroll view and wrap it in
 * `<GestureDetector gesture={native}>`.
 *
 * Pair with `bounces={false}`: at the top, a pull down is the page leaving, and
 * an iOS bounce on the same pull would move the content twice.
 */
export function useStageScroll() {
  const { scrollY, pan } = useStage()
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.set(e.contentOffset.y)
    },
  })
  const native = useMemo(() => Gesture.Native().simultaneousWithExternalGesture(pan), [pan])
  return { onScroll, native, scrollEventThrottle: 16 as const }
}

/**
 * The Blend'n screen's container — it opens *out of* the centre button and
 * closes back into it.
 *
 * Material's container transform, done with one uniform scale: a disc sized to
 * cover the whole screen from the button's centre starts at the button's 56pt
 * and grows, its fill turning from the button's accent to the page colour as it
 * does. The content fades up once the disc has covered most of the screen. So
 * the button *becomes* the room rather than a sheet sliding over the app —
 * this is a mode you enter, and it should look like one (Trackables' card →
 * screen, 60fps.design).
 *
 * - One uniform scale on a circle, so it is a circle at every frame; no layout
 *   animation, no mask, no blur (tasks/lessons.md).
 * - Closing runs it backwards from wherever it is — a drag that is released
 *   past the threshold hands its position to the close.
 * - Drag down to close: the whole page follows the finger, shrinks a little
 *   and rounds its corners, the way a card you are putting back does. It waits
 *   for any scroll inside to reach the top (`scrollY`), so it never fights the
 *   list.
 * - The route is a transparent modal with the stack's own animation off; this
 *   is the only transition, so there is never a slide *and* a morph.
 *
 * Reduce Motion: a 200ms fade both ways, and the drag still works.
 */
export const RoomStage = React.forwardRef<{ close(): void }, {
  onClosed: () => void
  children: React.ReactNode
}>(function RoomStage({ onClosed, children }, ref) {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  const origin = centreButtonOrigin(width, height, insets.bottom)
  // Big enough to cover the farthest corner from the button.
  const cover = 2 * Math.hypot(Math.max(origin.x, width - origin.x), origin.y) + 4
  const startScale = CONTROL.lg / cover

  const open = useSharedValue(0)
  const drag = useSharedValue(0)
  const scrollY = useSharedValue(0)
  // Where the finger was when the scroll reached its top, so the page picks up
  // from there instead of jumping by everything the list already scrolled.
  const dragFrom = useSharedValue(0)

  useEffect(() => {
    open.set(withTiming(1, { duration: reduceMotion ? 200 : OPEN_MS, easing: EASE }))
  }, [open, reduceMotion])

  const finish = useCallback(() => onClosed(), [onClosed])

  const close = useCallback(() => {
    open.set(
      withTiming(0, { duration: reduceMotion ? 200 : CLOSE_MS, easing: EASE }, (done) => {
        if (done) scheduleOnRN(finish)
      })
    )
  }, [finish, open, reduceMotion])

  useImperativeHandle(ref, () => ({ close }), [close])

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(12)
        .failOffsetX([-24, 24])
        .onBegin(() => {
          dragFrom.set(0)
        })
        .onUpdate((e) => {
          // Only once the content is at its top; until then the scroll owns it.
          if (scrollY.get() > 0) {
            dragFrom.set(e.translationY)
            return
          }
          drag.set(Math.max(0, e.translationY - dragFrom.get()))
        })
        .onEnd((e) => {
          const far = drag.get() > CLOSE_DISTANCE || (e.velocityY > CLOSE_VELOCITY && drag.get() > 0)
          if (far) {
            scheduleOnRN(close)
          } else {
            drag.set(withSpring(0, MOTION_SPRING.snappy))
          }
        }),
    [close, drag, dragFrom, scrollY]
  )

  const discStyle = useAnimatedStyle(() => {
    const p = open.get()
    return {
      opacity: reduceMotion ? p : 1,
      backgroundColor: interpolateColor(p, [0, 0.55], [EMBER.accent, EMBER.bg]),
      transform: [{ scale: reduceMotion ? 1 : interpolate(p, [0, 1], [startScale, 1]) }],
    }
  })

  const pageStyle = useAnimatedStyle(() => {
    const p = open.get()
    const d = drag.get()
    const pull = interpolate(d, [0, height], [0, 1], Extrapolation.CLAMP)
    return {
      opacity: reduceMotion ? p : interpolate(p, [0.45, 1], [0, 1], Extrapolation.CLAMP),
      borderRadius: interpolate(pull, [0, 0.15], [0, EMBER_RADIUS.card], Extrapolation.CLAMP),
      transform: [
        { translateY: d + (reduceMotion ? 0 : interpolate(p, [0.45, 1], [24, 0], Extrapolation.CLAMP)) },
        { scale: 1 - pull * 0.12 },
      ],
    }
  })

  // The dragged page reveals the app beneath; the disc thins with it.
  const discWrapStyle = useAnimatedStyle(() => ({
    opacity: interpolate(drag.get(), [0, height * 0.5], [1, 0], Extrapolation.CLAMP),
  }))

  const api = useMemo<StageApi>(() => ({ close, scrollY, pan }), [close, scrollY, pan])

  return (
    <StageContext.Provider value={api}>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, discWrapStyle]} pointerEvents="none">
          <Animated.View
            style={[
              styles.disc,
              {
                width: cover,
                height: cover,
                borderRadius: cover / 2,
                left: origin.x - cover / 2,
                top: origin.y - cover / 2,
              },
              discStyle,
            ]}
          />
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.page, pageStyle]}>{children}</Animated.View>
        </GestureDetector>
      </View>
    </StageContext.Provider>
  )
})

const styles = StyleSheet.create({
  disc: { position: 'absolute' },
  page: { flex: 1, backgroundColor: EMBER.bg, overflow: 'hidden' },
})

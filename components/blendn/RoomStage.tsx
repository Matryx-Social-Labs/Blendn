import React, { createContext, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native'
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  ReduceMotion,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { COLOR, EASING, RADIUS, SIZE, SPACE, SPRING } from '../../lib/design/tokens'
import { Grain } from '../ds/Grain'
import { Orbs } from '../ds/Orbs'
import { useSelection } from '../ds/shared'
import { GradientFill } from '../ui/GradientFill'
import { useReducedMotion } from '../../lib/motion'

/** Past this, a slow drag closes. */
const CLOSE_DISTANCE = 140
/** A flick this fast closes from any distance. */
const CLOSE_VELOCITY = 900
/** #7: open 420 ms, close ~300 ms, on the standard ease; Reduce Motion a 200 ms fade. */
/** Scrolled further than this, a list is somewhere a person put it; nearer the top, it is at the top. */
const SCROLLED_PAST = 24
const OPEN_MS = 420
const CLOSE_MS = 300
const FADE_MS = 200
const EASE = Easing.bezier(...EASING.standard)
/** #7: the page fades in from 45% of the open and rises 24 pt. */
const PAGE_FROM = 0.45
const PAGE_RISE = SPACE.xl

/**
 * Where the Blend'n disc's centre is, from the screen's top-left.
 *
 * Mirrors the bar's geometry (`components/ds/TabBar`, `tabBarTop` in
 * `app/(tabs)/_layout.tsx`): the 64 pt capsule floats at the safe area, 12 dp
 * higher on Android, and the disc is centred in it. Duplicated as arithmetic
 * rather than imported because importing the tab layout from a root route
 * would pull the whole bar module into this screen; `__tests__` pins the two
 * together.
 */
export function centreButtonOrigin(width: number, height: number, bottomInset: number) {
  const gap = bottomInset + (Platform.OS === 'android' ? SPACE.tabBarBottomGapAndroid : 0)
  return { x: width / 2, y: height - gap - SIZE.tabBar / 2 }
}

interface StageApi {
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
  // Past this the list is somewhere a person put it, so it holds its place when the header changes (`RoomView`).
  const [scrolled, setScrolled] = useState(false)
  useAnimatedReaction(
    () => scrollY.get() > SCROLLED_PAST,
    (now, before) => {
      if (now !== before) scheduleOnRN(setScrolled, now)
    }
  )
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.set(e.contentOffset.y)
    },
  })
  const native = useMemo(() => Gesture.Native().simultaneousWithExternalGesture(pan), [pan])
  return { onScroll, native, scrollEventThrottle: 16 as const, scrolled }
}

/**
 * The Blend'n screen's container — it opens *out of* the centre button and
 * closes back into it (motion #7).
 *
 * Material's container transform, done with one uniform scale: a disc sized to
 * cover the whole screen from the button's centre starts at the disc's 56 pt
 * and grows over 420 ms, its fill going from the brand gradient to L0 (ink,
 * then the page's orbs and grain). The page fades in from 45% and rises 24 pt. So
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
 * Reduce Motion: a 200 ms fade both ways from the page colour (never the
 * gradient), and the drag still works.
 */
export const RoomStage = React.forwardRef<{ close(): void }, {
  onClosed: () => void
  children: React.ReactNode
}>(function RoomStage({ onClosed, children }, ref) {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const sel = useSelection()
  const reduceMotion = useReducedMotion()
  const origin = centreButtonOrigin(width, height, insets.bottom)
  // Big enough to cover the farthest corner from the button.
  const cover = 2 * Math.hypot(Math.max(origin.x, width - origin.x), origin.y) + 4
  const startScale = SIZE.disc / cover

  const open = useSharedValue(0)
  const drag = useSharedValue(0)
  const scrollY = useSharedValue(0)
  // Where the finger was when the scroll reached its top, so the page picks up
  // from there instead of jumping by everything the list already scrolled.
  const dragFrom = useSharedValue(0)

  useEffect(() => {
    // Never: Reduce Motion's own 200 ms fade is chosen here, and the system setting must not skip it (or its callback).
    open.set(withTiming(1, { duration: reduceMotion ? FADE_MS : OPEN_MS, easing: EASE, reduceMotion: ReduceMotion.Never }))
  }, [open, reduceMotion])

  const close = useCallback(() => {
    open.set(
      withTiming(0, { duration: reduceMotion ? FADE_MS : CLOSE_MS, easing: EASE, reduceMotion: ReduceMotion.Never }, (done) => {
        if (done) scheduleOnRN(onClosed)
      })
    )
  }, [onClosed, open, reduceMotion])

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
            drag.set(withSpring(0, SPRING.snap))
          }
        }),
    [close, drag, dragFrom, scrollY]
  )

  const discStyle = useAnimatedStyle(() => {
    const p = open.get()
    return {
      opacity: reduceMotion ? p : 1,
      transform: [{ scale: reduceMotion ? 1 : interpolate(p, [0, 1], [startScale, 1]) }],
    }
  })
  // The gradient gives way to L0 as the circle grows. Reduce Motion fades from the page colour: no gradient flash.
  const gradientStyle = useAnimatedStyle(() => ({ opacity: reduceMotion ? 0 : 1 - open.get() }))

  const pageStyle = useAnimatedStyle(() => {
    const p = open.get()
    const d = drag.get()
    const pull = interpolate(d, [0, height], [0, 1], Extrapolation.CLAMP)
    return {
      opacity: reduceMotion ? p : interpolate(p, [PAGE_FROM, 1], [0, 1], Extrapolation.CLAMP),
      borderRadius: interpolate(pull, [0, 0.15], [0, RADIUS.card], Extrapolation.CLAMP),
      transform: [
        { translateY: d + (reduceMotion ? 0 : interpolate(p, [PAGE_FROM, 1], [PAGE_RISE, 0], Extrapolation.CLAMP)) },
        { scale: 1 - pull * 0.12 },
      ],
    }
  })

  // The dragged page reveals the app beneath; the disc thins with it.
  const discWrapStyle = useAnimatedStyle(() => ({
    opacity: interpolate(drag.get(), [0, height * 0.5], [1, 0], Extrapolation.CLAMP),
  }))

  const api = useMemo<StageApi>(() => ({ scrollY, pan }), [scrollY, pan])

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
          >
            <Animated.View style={[StyleSheet.absoluteFill, gradientStyle]}>
              <GradientFill gradient="brand" style={StyleSheet.absoluteFill} />
            </Animated.View>
          </Animated.View>
        </Animated.View>
        <GestureDetector gesture={pan}>
          {/* VoiceOver's two-finger Z closes it as the pull-down does (audit L5). */}
          <Animated.View testID="room-stage-page" onAccessibilityEscape={close} style={[styles.page, pageStyle]}>
            {/* L0: the orbs and the grain behind Tonight and the Room (Flow 4), the glow in the screen's hue (TG-14, B-R8). */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <Orbs set="brand" tint={sel.edge} testID="stage-orbs" />
              <Grain />
            </View>
            {children}
          </Animated.View>
        </GestureDetector>
      </View>
    </StageContext.Provider>
  )
})

const styles = StyleSheet.create({
  disc: { position: 'absolute', backgroundColor: COLOR.ink, overflow: 'hidden' },
  page: { flex: 1, backgroundColor: COLOR.ink, overflow: 'hidden' },
})

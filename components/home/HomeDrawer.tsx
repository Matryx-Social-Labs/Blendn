import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { Grabber } from '../ui/Grabber'
import { Material, SOLID } from '../ui/Material'
import { GroundProvider } from '../ds/shared'
import {
  DRAWER_HANDLE_HEIGHT,
  DRAWER_HEADER_HEIGHT,
  DRAWER_PEEK_LINE,
  DRAWER_SNAP_LABEL,
  drawerContentHeight,
  settleSnap,
  stepSnap,
  type DrawerSnap,
} from '../../lib/home'
import { COLOR, EASING, RADIUS, REDUCE_MOTION, SPACE, SPRING } from '../../lib/design/tokens'
import { tint } from '../../lib/theme'
import { useReducedMotion } from '../../lib/motion'

/** The drawer at full height is ink at 96%, not glass (Flow 3 `home` 03). */
const FULL_INK = 0.96

/** The ink wash over the drawer's material: none at half, 96% ink at full. */
function useFullInk(y: SharedValue<number>, points: Record<DrawerSnap, number>) {
  return useAnimatedStyle(() => ({ opacity: interpolate(y.get(), [points.half, points.full], [0, 1], 'clamp') }))
}

const DrawerMotion = createContext<{ y: SharedValue<number>; points: Record<DrawerSnap, number> } | null>(null)

/**
 * The drawer's own ground, frame by frame, for a row pinned inside it (the sticky search): on the solid tier it is
 * opaque, so content scrolling under the row never shows through it, and it matches the drawer so it is invisible at
 * rest (rc7 D3). Null outside a drawer.
 */
export function DrawerGround({ testID }: { testID?: string }) {
  const motion = useContext(DrawerMotion)
  return motion ? <DrawerGroundLayers {...motion} testID={testID} /> : null
}

function DrawerGroundLayers({ y, points, testID }: { y: SharedValue<number>; points: Record<DrawerSnap, number>; testID?: string }) {
  const ink = useFullInk(y, points)
  return (
    <View testID={testID} pointerEvents="none" style={[StyleSheet.absoluteFill, styles.solidSheet]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.opaque, ink]} />
    </View>
  )
}

/** Under Reduce Motion the drawer still travels, gently: a short timing on the standard curve, not an instant jump (BUILD-SPEC §0, `drawer`). */
const REDUCED_SETTLE = { duration: REDUCE_MOTION.duration.base, easing: Easing.bezier(...EASING.standard) } as const

/**
 * The home screen's pull-up drawer: peek, half, full (plan v2 step 2).
 *
 * Built on Gesture Handler and Reanimated rather than `@gorhom/bottom-sheet`:
 * its last release (5.2.14, May 2026) predates Reanimated 4.5, and its open
 * issue #2737 is a native stack overflow on iOS Fabric in the scroll handlers
 * of a list inside the sheet — exactly this screen, on exactly our versions.
 *
 * Dragged by its header only. The list inside scrolls as a list and never
 * fights the drawer for the gesture. The pane is as tall as what shows at the
 * settled snap, so a list's last row is reachable at half too (set when a
 * snap settles, never per frame). A tap on the handle steps it up (from
 * `full`, back down), and a screen reader adjusts it like a slider.
 */
export function HomeDrawer({
  y,
  points,
  snap,
  onSnap,
  header,
  onChromeTouch,
  peek,
  children,
}: {
  /** The drawer's top edge as it moves: the shell's, so what rides on the drawer follows it frame by frame. */
  y: SharedValue<number>
  points: Record<DrawerSnap, number>
  snap: DrawerSnap
  onSnap: (snap: DrawerSnap) => void
  header: ReactNode
  /** Any touch on the handle or the header, tap or drag, before either is handled. */
  onChromeTouch?: () => void
  /** A line kept under the header while the drawer rests at `peek`, over the pane; none for a pane without one. */
  peek?: ReactNode
  children: ReactNode
}) {
  const { height } = useWindowDimensions()
  const reduceMotion = useReducedMotion()
  const dragStart = useSharedValue(0)

  useEffect(() => {
    y.set(reduceMotion ? withTiming(points[snap], REDUCED_SETTLE) : withSpring(points[snap], SPRING.settle))
  }, [snap, points, reduceMotion, y])

  // Built once per set of snap points, not on every render.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Vertical intent only, so a tap on a segment stays a tap.
        .activeOffsetY([-8, 8])
        .onStart(() => {
          dragStart.set(y.get())
        })
        .onUpdate((e) => {
          y.set(Math.min(points.peek, Math.max(points.full, dragStart.get() + e.translationY)))
        })
        .onEnd((e) => {
          const next = settleSnap(y.get(), e.velocityY, points)
          // The release's own speed carries into the settle, so a flick does not stall and restart.
          y.set(reduceMotion ? withTiming(points[next], REDUCED_SETTLE) : withSpring(points[next], { ...SPRING.settle, velocity: e.velocityY }))
          scheduleOnRN(onSnap, next)
        }),
    [points, onSnap, y, dragStart, reduceMotion]
  )

  const moved = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() - points.full }] }))
  // Full height is the opaque surface (Flow 3 `home` 03: ink at 96%); the glass shows at half and peek. A wash over the glass, which itself never fades.
  const opaque = useFullInk(y, points)
  const motion = useMemo(() => ({ y, points }), [y, points])
  const tapStep = () => onSnap(snap === 'full' ? 'half' : stepSnap(snap, 'up'))

  return (
    <GroundProvider value="glass">
      <Animated.View style={[styles.drawer, { top: points.full }, moved]}>
        <Material role="sheet" pointerEvents="none" style={StyleSheet.absoluteFill} />
        <Animated.View testID="drawer-opaque" pointerEvents="none" style={[StyleSheet.absoluteFill, styles.opaque, opaque]} />
        <GestureDetector gesture={pan}>
          <View style={styles.header} onTouchStart={onChromeTouch}>
            <Pressable
              onPress={tapStep}
              style={styles.handle}
              accessibilityRole="adjustable"
              accessibilityLabel="Events and places"
              accessibilityHint="Swipe up or down to show more or less of the list"
              accessibilityValue={{ text: DRAWER_SNAP_LABEL[snap] }}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(e) => onSnap(stepSnap(snap, e.nativeEvent.actionName === 'increment' ? 'up' : 'down'))}
            >
              <Grabber />
            </Pressable>
            {header}
          </View>
        </GestureDetector>
        <View style={{ height: drawerContentHeight(points, snap, height) }}>
          <DrawerMotion.Provider value={motion}>{children}</DrawerMotion.Provider>
        </View>
        {snap === 'peek' && peek ? <View style={styles.peek}>{peek}</View> : null}
      </Animated.View>
    </GroundProvider>
  )
}

const styles = StyleSheet.create({
  drawer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    overflow: 'hidden',
  },
  opaque: { backgroundColor: tint(COLOR.ink, FULL_INK) },
  solidSheet: { backgroundColor: SOLID.sheet },
  peek: { position: 'absolute', left: 0, right: 0, top: DRAWER_HEADER_HEIGHT, height: DRAWER_PEEK_LINE, paddingHorizontal: SPACE.xl, backgroundColor: COLOR.ink },
  header: { height: DRAWER_HEADER_HEIGHT, paddingHorizontal: SPACE.xl },
  // The whole width and 44pt tall: the grabber is the drawing, this is the target.
  handle: { height: DRAWER_HANDLE_HEIGHT, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
})

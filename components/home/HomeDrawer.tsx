import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { Easing, FadeIn, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { Grabber } from '../ui/Grabber'
import { SheetOrbs } from '../ds/Orbs'
import { GroundProvider } from '../ds/shared'
import {
  DRAWER_HANDLE_HEIGHT,
  DRAWER_HEADER_HEIGHT,
  DRAWER_SNAP_LABEL,
  drawerContentHeight,
  settleSnap,
  stepSnap,
  type DrawerSnap,
} from '../../lib/home'
import { COLOR, DURATION, EASING, MATERIAL, RADIUS, REDUCE_MOTION, SPACE, SPRING } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'

/** The board's orbs below full (`<div class="orbs" style="opacity:.6">`); the `.full` drawer has none. */
const ORBS_BELOW_FULL = 0.6
/** The board's rim (`.drawer` box-shadow): 0.5 pt at 10% all round, 18% along the top. */
const RIM = 0.5

type Surface = { y: SharedValue<number>; points: Record<DrawerSnap, number>; orbsHeight: number }
/** Set inside the drawer: a row pinned in it stands on the drawer's own surface (`DrawerGround`). */
const InDrawer = createContext<Surface | null>(null)

/** The orbs' opacity as the drawer moves: the board's 60% at half and below, none at full. A worklet style, per frame. */
function useOrbsOpacity(y: SharedValue<number>, points: Record<DrawerSnap, number>) {
  return useAnimatedStyle(() => ({ opacity: interpolate(y.get(), [points.full, points.half], [0, ORBS_BELOW_FULL], 'clamp') }))
}

/**
 * The drawer's surface (Flow 3 board, `.drawer` + `.orbs`): ink, and the three brand orbs laid out on the drawer as it
 * rests at half (the board's frame), `offsetTop` above this layer's own top. The drawer draws it at 0; a pinned row draws
 * it again from where it sits, so the row is the drawer and no band shows.
 */
function Orbs({ surface, offsetTop, testID }: { surface: Surface; offsetTop: number; testID?: string }) {
  const opacity = useOrbsOpacity(surface.y, surface.points)
  return (
    <Animated.View testID={testID} pointerEvents="none" style={[styles.orbs, { top: -offsetTop, height: surface.orbsHeight }, opacity]}>
      <SheetOrbs />
    </Animated.View>
  )
}

/**
 * The drawer's own ground, for a row pinned inside it (the sticky chips): its ink and its orbs, from where the row sits
 * (under the header), so the row is invisible at rest and nothing scrolling under it shows through (rc7 D3). Null outside
 * a drawer.
 */
export function DrawerGround({ testID }: { testID?: string }) {
  const surface = useContext(InDrawer)
  if (!surface) return null
  return (
    <View testID={testID} pointerEvents="none" style={[StyleSheet.absoluteFill, styles.ink, styles.clip]}>
      <Orbs surface={surface} offsetTop={DRAWER_HEADER_HEIGHT} testID={testID && `${testID}-orbs`} />
    </View>
  )
}

/** Whether this row sits inside a drawer, i.e. whether `DrawerGround` draws anything behind it. */
export function useInDrawer(): boolean {
  return useContext(InDrawer) !== null
}

/**
 * The board's FULL (sheet 17 pick A, SCRUM-1090): the strip of map left under the top bar fades to the drawer's ink as
 * the drawer rises from half to full, so at full the top bar sits on ink and nothing of the map (the you-dot, its stale
 * callout, the edge marker, banners, the beam) can show under the Blend'n mark. Bound to the drawer's edge on the UI
 * thread: it has no timing of its own, so it follows the finger, the spring, and Reduce Motion's short timing alike.
 */
export function DrawerCover({ y, points, height }: { y: SharedValue<number>; points: Record<DrawerSnap, number>; height: number }) {
  const shown = useAnimatedStyle(() => ({ opacity: interpolate(y.get(), [points.full, points.half], [1, 0], 'clamp') }))
  return <Animated.View testID="drawer-cover" pointerEvents="none" style={[styles.cover, { height }, shown]} />
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

  /*
   * Every settle the drawer asks for (a release, a tap, a screen reader's step) is counted, so the drawer is moved to the
   * snap that was committed even when the snap did not change (SCRUM-1079): a release's spring and a step taken from the
   * snap before that release rendered could net to no change, and the release's spring stood, drawn at half while it read
   * "Collapsed". But only a move toward somewhere else starts an animation: `aim` is where the one in flight is going, and
   * a settle toward that same point leaves it be (SCRUM-1090: re-issued after every release, it restarted the motion).
   */
  const [settles, setSettles] = useState(0)
  const settle = useCallback(
    (next: DrawerSnap) => {
      setSettles((n) => n + 1)
      onSnap(next)
    },
    [onSnap]
  )
  // NaN: nothing in flight yet, so the first commit always draws the drawer at its snap.
  const aim = useSharedValue(Number.NaN)
  /*
   * Travelling (a drag, or a move toward a snap): the pane is as tall as at full, so what rises into view is the list,
   * not bare ink that fills in once the drawer stops (SCRUM-1090). At rest it is the snap's again (`drawerContentHeight`).
   * Derived, not set in an effect: a finger on the drawer, or a snap the drawer has not come to rest at yet.
   */
  const [dragging, setDragging] = useState(false)
  const [rested, setRested] = useState<DrawerSnap>(snap)
  const travelling = dragging || rested !== snap
  const arrive = useCallback((finished: boolean | undefined, at: DrawerSnap) => {
    if (!finished) return
    setRested(at)
    setDragging(false)
  }, [])

  useEffect(() => {
    const to = points[snap]
    if (aim.get() === to) return
    aim.set(to)
    // Already there (the first frame, the shell's `y` starts at the snap): nothing to travel.
    if (y.get() === to) return
    const done = (finished?: boolean) => {
      'worklet'
      scheduleOnRN(arrive, finished, snap)
    }
    y.set(reduceMotion ? withTiming(to, REDUCED_SETTLE, done) : withSpring(to, SPRING.settle, done))
  }, [snap, points, reduceMotion, y, settles, aim, arrive])

  // Built once per set of snap points, not on every render.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .withTestId('home-drawer-pan')
        // Vertical intent only, so a tap on a segment stays a tap.
        .activeOffsetY([-8, 8])
        .onStart(() => {
          dragStart.set(y.get())
          aim.set(Number.NaN)
          scheduleOnRN(setDragging, true)
        })
        .onUpdate((e) => {
          y.set(Math.min(points.peek, Math.max(points.full, dragStart.get() + e.translationY)))
        })
        .onEnd((e) => {
          const next = settleSnap(y.get(), e.velocityY, points)
          const to = points[next]
          const done = (finished?: boolean) => {
            'worklet'
            scheduleOnRN(arrive, finished, next)
          }
          // The release's own speed carries into the settle, so a flick does not stall and restart. The one animation: the
          // settle that follows sees it already aimed there (`aim`).
          aim.set(to)
          y.set(reduceMotion ? withTiming(to, REDUCED_SETTLE, done) : withSpring(to, { ...SPRING.settle, velocity: e.velocityY }, done))
          scheduleOnRN(settle, next)
        }),
    [points, settle, y, dragStart, reduceMotion, aim, arrive]
  )

  const moved = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() - points.full }] }))
  const surface = useMemo<Surface>(() => ({ y, points, orbsHeight: height - points.half }), [y, points, height])
  const restingAtPeek = snap === 'peek' && !travelling
  const tapStep = () => settle(snap === 'full' ? 'half' : stepSnap(snap, 'up'))

  return (
    <GroundProvider value="glass">
      {/* Solid ink at every snap, on every tier (owner, 2026-11-03): glass is for the floating controls, not the drawer. */}
      <Animated.View
        testID="home-drawer"
        style={[styles.drawer, { top: points.full }, moved]}
        // A screen reader's escape (the two-finger scrub) at full is "back to the map": one step down to half.
        onAccessibilityEscape={snap === 'full' ? () => settle('half') : undefined}
      >
        <Orbs surface={surface} offsetTop={0} testID="drawer-orbs" />
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
              onAccessibilityAction={(e) => settle(stepSnap(snap, e.nativeEvent.actionName === 'increment' ? 'up' : 'down'))}
            >
              <Grabber />
            </Pressable>
            {header}
          </View>
        </GestureDetector>
        {/* At rest at peek only the header and its line show (the board's PEEK): the pane stays mounted, unseen and unread. */}
        <View
          testID="home-drawer-pane"
          pointerEvents={restingAtPeek ? 'none' : 'auto'}
          importantForAccessibility={restingAtPeek ? 'no-hide-descendants' : 'auto'}
          accessibilityElementsHidden={restingAtPeek}
          style={{ height: drawerContentHeight(points, travelling ? 'full' : snap, height), opacity: restingAtPeek ? 0 : 1 }}
        >
          <InDrawer.Provider value={surface}>{children}</InDrawer.Provider>
        </View>
        {/* Under the header at peek only, where the pane was: gone the moment the drawer moves, back once it rests at peek. */}
        {restingAtPeek && peek ? (
          <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(DURATION.quick)} style={styles.peek}>
            {peek}
          </Animated.View>
        ) : null}
        <View testID="drawer-rim" pointerEvents="none" style={[StyleSheet.absoluteFill, styles.rim]} />
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
    backgroundColor: COLOR.ink,
  },
  ink: { backgroundColor: COLOR.ink },
  cover: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: COLOR.ink },
  clip: { overflow: 'hidden' },
  orbs: { position: 'absolute', left: 0, right: 0 },
  rim: {
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    borderWidth: RIM,
    borderColor: COLOR.hairline,
    borderTopColor: MATERIAL.glassSpecular,
  },
  peek: { position: 'absolute', left: 0, right: 0, top: DRAWER_HEADER_HEIGHT, paddingHorizontal: SPACE.xl, backgroundColor: COLOR.ink },
  // The board's `.ttab`: 24 from the left, 16 from the right, so the search circle sits 16 in, as the bell does above it.
  header: { height: DRAWER_HEADER_HEIGHT, paddingLeft: SPACE.xl, paddingRight: SPACE.lg },
  // The whole width and 44pt tall: the grabber is the drawing (8 pt from the edge, kit.css `.grab`), this is the target.
  handle: { height: DRAWER_HANDLE_HEIGHT, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'flex-start', paddingTop: SPACE.sm },
})

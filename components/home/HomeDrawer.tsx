import { useEffect, type ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { Grabber } from '../ui/Grabber'
import { DRAWER_HEADER_HEIGHT, DRAWER_SNAP_LABEL, settleSnap, stepSnap, type DrawerSnap } from '../../lib/home'
import { EMBER, EMBER_RADIUS, SPACE } from '../../lib/theme'

/** Settles without a bounce: a drawer, not a toy. */
const SETTLE = { damping: 28, stiffness: 260, mass: 0.9 } as const

/**
 * The home screen's pull-up drawer: peek, half, full (plan v2 step 2).
 *
 * Built on Gesture Handler and Reanimated rather than `@gorhom/bottom-sheet`:
 * its last release (5.2.14, May 2026) predates Reanimated 4.5, and its open
 * issue #2737 is a native stack overflow on iOS Fabric in the scroll handlers
 * of a list inside the sheet — exactly this screen, on exactly our versions.
 *
 * Dragged by its header only. The list inside scrolls as a list and never
 * fights the drawer for the gesture; at `half` its lower part is simply below
 * the screen until the drawer is pulled up. A tap on the handle steps it up
 * (from `full`, back down), and a screen reader adjusts it like a slider.
 */
export function HomeDrawer({
  points,
  snap,
  onSnap,
  header,
  children,
}: {
  points: Record<DrawerSnap, number>
  snap: DrawerSnap
  onSnap: (snap: DrawerSnap) => void
  header: ReactNode
  children: ReactNode
}) {
  const reduceMotion = useReducedMotion()
  const y = useSharedValue(points[snap])
  const dragStart = useSharedValue(0)

  useEffect(() => {
    y.set(reduceMotion ? points[snap] : withSpring(points[snap], SETTLE))
  }, [snap, points, reduceMotion, y])

  const pan = Gesture.Pan()
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
      y.set(withSpring(points[next], SETTLE))
      scheduleOnRN(onSnap, next)
    })

  const moved = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() - points.full }] }))
  const tapStep = () => onSnap(snap === 'full' ? 'half' : stepSnap(snap, 'up'))

  return (
    <Animated.View style={[styles.drawer, { top: points.full }, moved]}>
      <GestureDetector gesture={pan}>
        <View style={styles.header}>
          <Pressable
            onPress={tapStep}
            style={styles.handle}
            hitSlop={SPACE.sm}
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
      <View style={styles.content}>{children}</View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  drawer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: EMBER.bg,
    borderTopLeftRadius: EMBER_RADIUS.lg,
    borderTopRightRadius: EMBER_RADIUS.lg,
    borderTopWidth: 1,
    borderColor: EMBER.separator,
    overflow: 'hidden',
  },
  header: { height: DRAWER_HEADER_HEIGHT, paddingHorizontal: SPACE.xl, gap: SPACE.sm },
  handle: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: SPACE.sm },
  content: { flex: 1 },
})

import { useEffect, type ReactNode } from 'react'
import { StyleSheet } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { interpolateColor, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { COLOR, RADIUS, SPRING } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useReducedMotion } from '../../lib/motion'
import { moveInto, slotAt, slotXY, type GridSpec } from '../../lib/photoOrder'
import { tint } from '../../lib/theme'
import { fadeOutFast } from '../motion/presence'

/** A press this long lifts a tile: shorter, and the touch is the page's scroll. */
export const LIFT_AFTER_MS = 250
/** The pickup's haptic, on the JS thread (the gesture runs on the UI one). */
const pickUp = () => H.drag()
const noLift = (_lifted: boolean) => {}
/** The tile's edge at rest (clear) and lifted (the frame's hairline): colours worked out here, not in the worklet. */
const EDGE = [tint(COLOR.textPrimary, 0), COLOR.hairlineStrong]
/** Flow 6 edit 02: the lifted tile is 1.06 and turned -2°, on a hairline. */
export const LIFT = { scale: 1.06, rotate: -2 } as const

/**
 * One photo tile that can be lifted and dropped into another slot (Flow 6 edit 02). A long press lifts it (`H.drag`, the pickup),
 * it follows the finger, and the tiles it passes slide a place along (`moveInto`, on `M.snap`); let go and it settles in the slot
 * it ended over and the grid hears the new order (`onDrop`), which writes it once. Reduce Motion keeps the drag (it is direct
 * manipulation) and lets the others step into place without travelling.
 *
 * `positions[i]` is the slot tile `i` sits in; a change from outside (the order saved, or rolled back) is followed the same way, so
 * a refused write travels the tile home instead of snapping.
 */
export function DraggableTile({
  index,
  count,
  grid,
  positions,
  active,
  enabled,
  onDrop,
  onLift,
  children,
  testID,
}: {
  index: number
  count: number
  grid: GridSpec
  positions: SharedValue<number[]>
  active: SharedValue<number>
  enabled: boolean
  onDrop: (positions: number[]) => void
  /** A tile was lifted (true) or let go (false): the page's scroll stands down while one is in the hand. */
  onLift?: (lifted: boolean) => void
  children: ReactNode
  testID?: string
}) {
  const reduceMotion = useReducedMotion()
  const home = slotXY(index, grid)
  const x = useSharedValue(home.x)
  const y = useSharedValue(home.y)
  const startX = useSharedValue(0)
  const startY = useSharedValue(0)
  const lift = useSharedValue(0)

  // The grid was measured or resized, or a saved order gave this tile a new index: it goes to its home slot, without travelling.
  // Home, not `positions[index]`: the new index arrives while `positions` still holds the old order for one commit, which parked the tile in the old slot.
  useEffect(() => {
    x.set(home.x)
    y.set(home.y)
  }, [home.x, home.y, x, y])

  // Another tile made room, or the order was saved or put back: this one steps to its slot.
  useAnimatedReaction(
    () => positions.get()[index] ?? index,
    (slot, was) => {
      if (slot === was || active.get() === index) return
      const to = slotXY(slot, grid)
      x.set(reduceMotion ? to.x : withSpring(to.x, SPRING.snap))
      y.set(reduceMotion ? to.y : withSpring(to.y, SPRING.snap))
    },
    [grid, index, reduceMotion]
  )

  const liftChanged = onLift ?? noLift
  const pan = Gesture.Pan()
    .enabled(enabled)
    .activateAfterLongPress(LIFT_AFTER_MS)
    .onStart(() => {
      active.set(index)
      startX.set(x.get())
      startY.set(y.get())
      // Reduce Motion: the lift is a state, not a spring; the drag itself is direct manipulation and stays.
      lift.set(reduceMotion ? 1 : withSpring(1, SPRING.pop))
      scheduleOnRN(pickUp)
      scheduleOnRN(liftChanged, true)
    })
    .onUpdate((e) => {
      x.set(startX.get() + e.translationX)
      y.set(startY.get() + e.translationY)
      const slot = slotAt(x.get() + grid.itemSize / 2, y.get() + grid.itemSize / 2, grid, count)
      const now = positions.get()
      if (now[index] !== slot) positions.set(moveInto(now, index, slot))
    })
    .onFinalize(() => {
      // A press that never became a lift (let go early, or scrolled away) is nothing to settle.
      if (active.get() !== index) return
      const final = positions.get()
      const to = slotXY(final[index], grid)
      x.set(reduceMotion ? to.x : withSpring(to.x, SPRING.snap))
      y.set(reduceMotion ? to.y : withSpring(to.y, SPRING.snap))
      lift.set(reduceMotion ? 0 : withSpring(0, SPRING.snap))
      active.set(-1)
      scheduleOnRN(liftChanged, false)
      scheduleOnRN(onDrop, final)
    })

  if (testID) pan.withTestId(`${testID}-drag`)

  const style = useAnimatedStyle(() => ({
    zIndex: active.get() === index ? 2 : 0,
    borderColor: interpolateColor(lift.get(), [0, 1], EDGE),
    transform: [
      { translateX: x.get() },
      { translateY: y.get() },
      { scale: 1 + (LIFT.scale - 1) * lift.get() },
      { rotate: `${LIFT.rotate * lift.get()}deg` },
    ],
  }))

  return (
    <GestureDetector gesture={pan}>
      <Animated.View testID={testID} exiting={fadeOutFast} style={[styles.tile, { width: grid.itemSize, height: grid.itemSize }, style]}>
        {children}
      </Animated.View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  tile: { position: 'absolute', left: 0, top: 0, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.rowInCard },
})

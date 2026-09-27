import React, { useEffect, useState } from 'react'
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { buildConfetti, CONFETTI_MS, pieceAt, type ConfettiPiece } from '../../lib/confetti'

/**
 * Confetti that pops up out of the check-in button and flutters down.
 *
 * The physics live in `lib/confetti.ts`. This file only draws the pieces: each
 * one is a plain view whose transform is `pieceAt(clock)`, and one shared clock
 * runs 0 → `CONFETTI_MS` linearly on the UI thread. The pieces exist only while
 * a burst plays, so an idle overlay is one empty view.
 *
 * `trigger` is a counter, like `HeartPop`: each increment plays one burst and 0
 * never plays, so a fresh mount is silent. Put it last in its parent so it
 * draws on top. It never takes touches.
 *
 * Reduce Motion: nothing is drawn. The success haptic still marks the moment.
 */
export function ConfettiBurst({
  trigger,
  originBottom,
  originWidth = 280,
}: {
  trigger: number
  /** How far above this overlay's bottom edge the button's centre sits. */
  originBottom: number
  /** The button's width. Pieces start spread across it. */
  originWidth?: number
}) {
  const reduceMotion = useReducedMotion()
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [burst, setBurst] = useState<{ id: number; pieces: ConfettiPiece[] } | null>(null)
  const clock = useSharedValue(0)

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setSize((s) => (s.width === width && s.height === height ? s : { width, height }))
  }

  // Taken during render when `trigger` changes, so only a new trigger plays: a
  // later layout or origin change never replays a burst.
  const [seen, setSeen] = useState(trigger)
  if (trigger !== seen) {
    setSeen(trigger)
    if (trigger > 0 && !reduceMotion && size.height > 0) {
      // Seeded by the trigger, so two check-ins in a row don't burst the same way.
      setBurst({ id: trigger, pieces: buildConfetti({ ...size, originBottom, originWidth }, trigger) })
    }
  }

  useEffect(() => {
    if (!burst) return
    const done = (id: number) => setBurst((b) => (b?.id === id ? null : b))
    clock.set(0)
    clock.set(
      withTiming(CONFETTI_MS, { duration: CONFETTI_MS, easing: Easing.linear }, (finished) => {
        if (finished) scheduleOnRN(done, burst.id)
      })
    )
  }, [burst, clock])

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {burst?.pieces.map((p, i) => (
        <Piece key={`${burst.id}-${i}`} piece={p} clock={clock} height={size.height} />
      ))}
    </View>
  )
}

function Piece({ piece, clock, height }: { piece: ConfettiPiece; clock: SharedValue<number>; height: number }) {
  const style = useAnimatedStyle(() => {
    const f = pieceAt(piece, clock.get(), height)
    return {
      opacity: f.opacity,
      transform: [
        { translateX: f.x - piece.w / 2 },
        { translateY: f.y - piece.h / 2 },
        { rotate: `${f.rotate}deg` },
        { scaleY: f.flipY },
      ],
    }
  })

  return (
    <Animated.View
      style={[
        styles.piece,
        {
          width: piece.w,
          height: piece.h,
          backgroundColor: piece.color,
          borderRadius: piece.shape === 'dot' ? piece.w / 2 : 1,
        },
        style,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  piece: { position: 'absolute', left: 0, top: 0 },
})

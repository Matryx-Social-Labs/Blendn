import * as Haptics from 'expo-haptics'
import React, { useCallback, useEffect } from 'react'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

/**
 * Where each depth sits in the fan, front first. Four entries: the front card,
 * the two fanned behind it, and a fourth that waits invisibly behind those.
 */
export interface DeckFan {
  rotate: readonly number[]
  shiftX: readonly number[]
  shiftY: readonly number[]
  scale: readonly number[]
  opacity: readonly number[]
}

const DEPTHS = [0, 1, 2, 3]

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)
/** Settles a little slower than the default 400ms, so the fan is seen re-forming. */
const SETTLE = { duration: 550, dampingRatio: 0.8 } as const
/** Soft ease-out for the one-off deal. */
const EASE_GENTLE = Easing.bezier(0.33, 1, 0.68, 1)
/** Past this, or past `FLICK_VELOCITY`, a drag sends the card to the back. */
const FLICK_VELOCITY = 500
/** The throw out, before the card springs back under the pile. */
const THROW_MS = 220

function lightTick() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
}

function DeckCard({
  index,
  count,
  front,
  thrown,
  dragX,
  thrownX,
  dealt,
  fan,
  tiltPer,
  reduceMotion,
  cardStyle,
  children,
}: {
  index: number
  count: number
  front: SharedValue<number>
  thrown: SharedValue<number>
  dragX: SharedValue<number>
  thrownX: SharedValue<number>
  dealt: SharedValue<number>
  fan: DeckFan
  tiltPer: number
  reduceMotion: boolean
  cardStyle: StyleProp<ViewStyle>
  children: React.ReactNode
}) {
  // The card's depth, animated: it springs through the fan when the order changes.
  const depth = useSharedValue(index)

  useAnimatedReaction(
    () => (index - front.get() + count) % count,
    (target, previous) => {
      if (previous === null || target === previous) return
      depth.set(reduceMotion ? target : withSpring(target, SETTLE))
    },
    [index, count, reduceMotion]
  )

  const style = useAnimatedStyle(() => {
    const d = depth.get()
    const target = (index - front.get() + count) % count
    const f = dealt.get()
    // The front card follows the finger; the card just sent back rides its throw home.
    const offset = target === 0 ? dragX.get() : thrown.get() === index ? thrownX.get() : 0
    const at = (range: readonly number[]) => interpolate(d, DEPTHS, range as number[], Extrapolation.CLAMP)
    return {
      zIndex: count - target,
      opacity: at(fan.opacity),
      transform: [
        { translateX: at(fan.shiftX) * f + offset },
        { translateY: at(fan.shiftY) * f },
        // Tilts with the drag, like a card held at the bottom edge.
        { rotate: `${at(fan.rotate) * f + offset / tiltPer}deg` },
        { scale: at(fan.scale) },
      ],
    }
  })

  return <Animated.View style={[styles.card, cardStyle, style]}>{children}</Animated.View>
}

/**
 * A fanned pile of cards you flick through — the Me tab's photo stack, made
 * reusable so the Blend'n screen's Tonight deck is the same object.
 *
 * Drag or flick the top card sideways and it goes to the back of the pile;
 * tap it to open it. The order is only for this screen and resets whenever the
 * items change.
 *
 * ## Motion
 *
 * - **Deal** (once, when it first appears): the cards start squared up and fan
 *   out, 620ms on a soft ease-out after a 250ms beat.
 * - **Drag**: shared values on the UI thread; the order itself (`front`) is a
 *   shared value too, so a swap never waits on a React render.
 * - **Release**: past `commitDistance` or 500pt/s it's committed. The card
 *   drops behind the pile, is thrown out `throwDistance` (220ms) and springs
 *   back in under it (550ms), with a light haptic on the same frame. Otherwise
 *   it springs home carrying the finger's velocity.
 * - **Reduce Motion**: no deal and no throw. A committed swipe just swaps.
 *
 * Sideways only: a vertical drag belongs to the page's scroll.
 */
export function SwipeDeck<T>({
  items,
  keyOf,
  renderCard,
  width,
  height,
  fan,
  commitDistance = 40,
  throwDistance = 96,
  tiltPer = 12,
  onPress,
  onFrontChange,
  style,
  cardStyle,
  accessibilityLabel,
  accessibilityHint,
  nextLabel = 'Next',
}: {
  items: readonly T[]
  keyOf: (item: T, index: number) => string
  renderCard: (item: T, index: number) => React.ReactNode
  width: number
  height: number
  fan: DeckFan
  commitDistance?: number
  throwDistance?: number
  /** Points of drag per degree of tilt. */
  tiltPer?: number
  /** Tapped, with the index (into `items`) of the card on top. */
  onPress: (index: number) => void
  /** The card on top changed (after a swipe), with its index into `items`. */
  onFrontChange?: (index: number) => void
  style?: StyleProp<ViewStyle>
  cardStyle?: StyleProp<ViewStyle>
  accessibilityLabel: string
  accessibilityHint?: string
  /** The VoiceOver action that does the swap. */
  nextLabel?: string
}) {
  const reduceMotion = useReducedMotion()
  const count = items.length
  const front = useSharedValue(0)
  const thrown = useSharedValue(-1)
  const dragX = useSharedValue(0)
  const thrownX = useSharedValue(0)
  const pressed = useSharedValue(1)
  const dealt = useSharedValue(reduceMotion ? 1 : 0)
  const key = items.map(keyOf).join('|')

  // New items: start again from the real first one.
  useEffect(() => {
    front.set(0)
    thrown.set(-1)
    onFrontChange?.(0)
    // `onFrontChange` is a callback prop; the reset is keyed on the items.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, front, thrown])

  useEffect(() => {
    if (reduceMotion) {
      dealt.set(1)
      return
    }
    dealt.set(withDelay(250, withTiming(1, { duration: 620, easing: EASE_GENTLE })))
  }, [dealt, reduceMotion])

  const report = useCallback((i: number) => onFrontChange?.(i), [onFrontChange])

  // VoiceOver's "next" action: the same swap, without the throw.
  const next = useCallback(() => {
    if (count < 2) return
    thrown.set(-1)
    const n = (front.get() + 1) % count
    front.set(n)
    report(n)
  }, [count, front, thrown, report])

  const pan = Gesture.Pan()
    .enabled(count > 1)
    .activeOffsetX([-10, 10])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      dragX.set(e.translationX)
    })
    .onEnd((e) => {
      const committed = Math.abs(e.translationX) > commitDistance || Math.abs(e.velocityX) > FLICK_VELOCITY
      if (!committed) {
        dragX.set(withSpring(0, { ...SETTLE, velocity: e.velocityX }))
        return
      }
      const dir = Math.sign(e.translationX || e.velocityX) || 1
      const was = front.get()
      // Hand the offset from the finger to the thrown card in one frame, then swap.
      thrown.set(was)
      thrownX.set(
        reduceMotion
          ? 0
          : withSequence(
              withTiming(dir * throwDistance, { duration: THROW_MS, easing: EASE_OUT }),
              withSpring(0, SETTLE)
            )
      )
      dragX.set(0)
      const n = (was + 1) % count
      front.set(n)
      scheduleOnRN(lightTick)
      scheduleOnRN(report, n)
    })

  const tap = Gesture.Tap()
    .onBegin(() => {
      if (!reduceMotion) pressed.set(withTiming(0.97, { duration: 120, easing: EASE_OUT }))
    })
    .onEnd(() => {
      scheduleOnRN(onPress, front.get())
    })
    .onFinalize(() => {
      pressed.set(withTiming(1, { duration: 120, easing: EASE_OUT }))
    })

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressed.get() }] }))

  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <Animated.View
        style={[styles.deck, style, pressStyle]}
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityActions={
          count > 1 ? [{ name: 'activate' }, { name: 'increment', label: nextLabel }] : [{ name: 'activate' }]
        }
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'increment') next()
          else onPress(front.get())
        }}
      >
        {items.map((item, index) => (
          <DeckCard
            key={keyOf(item, index)}
            index={index}
            count={count}
            front={front}
            thrown={thrown}
            dragX={dragX}
            thrownX={thrownX}
            dealt={dealt}
            fan={fan}
            tiltPer={tiltPer}
            reduceMotion={reduceMotion}
            cardStyle={[{ width, height }, cardStyle]}
          >
            {renderCard(item, index)}
          </DeckCard>
        ))}
      </Animated.View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  deck: { alignItems: 'center', justifyContent: 'center' },
  card: { position: 'absolute', overflow: 'hidden' },
})

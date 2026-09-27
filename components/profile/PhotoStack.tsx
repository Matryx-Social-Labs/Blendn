import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import React, { useCallback, useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
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

import { EMBER, EMBER_RADIUS, TYPE } from '../../lib/theme'
import { OptimizedImage } from '../OptimizedImage'
import { Text } from '../ui/Text'

/** One photo card. Portrait, like the photos themselves. */
const CARD_W = 84
const CARD_H = 108

/*
 * Where each depth sits in the fan: the front card leans a little left, the
 * two behind it fan out to either side. Small angles — at 10°+ a portrait
 * card's corner pokes into the name beside it. Deeper than the third card,
 * a photo waits invisibly behind it.
 */
const DEPTHS = [0, 1, 2, 3]
const ROTATE = [-4, 7, -11, -11]
const SHIFT_X = [0, 14, -14, -14]
const SHIFT_Y = [0, 2, 4, 4]
const SCALE = [1, 0.96, 0.92, 0.92]
const OPACITY = [1, 1, 1, 0]

/** Past this, or past `FLICK_VELOCITY`, a drag sends the card to the back. */
const COMMIT_DISTANCE = 40
const FLICK_VELOCITY = 500
/** How far a committed card travels out before it tucks in behind. */
const THROW = 96

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)
const SETTLE = { duration: 400, dampingRatio: 0.8 } as const

function lightTick() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
}

function StackCard({
  uri,
  index,
  count,
  front,
  thrown,
  dragX,
  thrownX,
  dealt,
  reduceMotion,
}: {
  uri: string
  index: number
  count: number
  front: SharedValue<number>
  thrown: SharedValue<number>
  dragX: SharedValue<number>
  thrownX: SharedValue<number>
  dealt: SharedValue<number>
  reduceMotion: boolean
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
    const fan = dealt.get()
    // The front card follows the finger; the card just sent back rides its throw home.
    const offset = target === 0 ? dragX.get() : thrown.get() === index ? thrownX.get() : 0
    const at = (range: number[]) => interpolate(d, DEPTHS, range, Extrapolation.CLAMP)
    return {
      zIndex: count - target,
      opacity: at(OPACITY),
      transform: [
        { translateX: at(SHIFT_X) * fan + offset },
        { translateY: at(SHIFT_Y) * fan },
        // Tilts 1° per 12pt of drag, like a card held at the bottom edge.
        { rotate: `${at(ROTATE) * fan + offset / 12}deg` },
        { scale: at(SCALE) },
      ],
    }
  })

  return (
    <Animated.View style={[styles.card, style]}>
      <OptimizedImage
        source={uri}
        recyclingKey={uri}
        style={styles.fill as never}
        width={CARD_W}
        height={CARD_H}
        contentFit="cover"
      />
    </Animated.View>
  )
}

/**
 * Your photos as a small fanned pile beside your name.
 *
 * Tap it to see your page as others do. Drag or flick the top photo sideways
 * and it goes to the back of the pile: something to fidget with that also
 * shows which photos people will see. The order is only for this screen. It
 * resets to your real first photo whenever the photos change, and nothing is
 * written back.
 *
 * ## Motion
 *
 * - **Deal** (once, when it first appears): the cards start squared up and
 *   fan out, 320ms ease-out. It happens once per launch, so it's allowed to be seen.
 * - **Drag**: shared values on the UI thread; the order itself (`front`) is a
 *   shared value too, so a swap never waits on a React render.
 * - **Release**: past 40pt or 500pt/s it's committed. The card drops behind
 *   the pile, is thrown out 96pt and springs back in under it, with a light
 *   haptic on the same frame. Otherwise it springs home carrying the finger's velocity.
 * - **Reduce Motion**: no deal and no throw. A committed swipe just swaps the order.
 *
 * With no photos it's one card with your pseudonym mark, and it can't be swiped.
 */
export function PhotoStack({
  photos,
  fallback,
  onPress,
}: {
  photos: string[]
  /** Your pseudonym mark (`pseudonymAvatar`), drawn when there are no photos. */
  fallback: { colors: readonly [string, string]; character: string }
  onPress: () => void
}) {
  const reduceMotion = useReducedMotion()
  const count = photos.length
  const front = useSharedValue(0)
  const thrown = useSharedValue(-1)
  const dragX = useSharedValue(0)
  const thrownX = useSharedValue(0)
  const pressed = useSharedValue(1)
  const dealt = useSharedValue(reduceMotion ? 1 : 0)
  const key = photos.join('|')

  // New photos (an edit, a reorder): start again from the real first one.
  useEffect(() => {
    front.set(0)
    thrown.set(-1)
  }, [key, front, thrown])

  useEffect(() => {
    if (reduceMotion) {
      dealt.set(1)
      return
    }
    dealt.set(withDelay(120, withTiming(1, { duration: 320, easing: EASE_OUT })))
  }, [dealt, reduceMotion])

  // VoiceOver's "next photo" action: the same swap, without the throw.
  const next = useCallback(() => {
    if (count < 2) return
    thrown.set(-1)
    front.set((front.get() + 1) % count)
  }, [count, front, thrown])

  const pan = Gesture.Pan()
    .enabled(count > 1)
    // Sideways only: a vertical drag belongs to the page's scroll.
    .activeOffsetX([-10, 10])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      dragX.set(e.translationX)
    })
    .onEnd((e) => {
      const committed = Math.abs(e.translationX) > COMMIT_DISTANCE || Math.abs(e.velocityX) > FLICK_VELOCITY
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
              withTiming(dir * THROW, { duration: 140, easing: EASE_OUT }),
              withSpring(0, SETTLE)
            )
      )
      dragX.set(0)
      front.set((was + 1) % count)
      scheduleOnRN(lightTick)
    })

  const tap = Gesture.Tap()
    .onBegin(() => {
      if (!reduceMotion) pressed.set(withTiming(0.97, { duration: 120, easing: EASE_OUT }))
    })
    .onEnd(() => {
      scheduleOnRN(onPress)
    })
    .onFinalize(() => {
      pressed.set(withTiming(1, { duration: 120, easing: EASE_OUT }))
    })

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressed.get() }] }))

  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <Animated.View
        style={[styles.stack, pressStyle]}
        accessible
        accessibilityRole="imagebutton"
        accessibilityLabel="Preview your profile as others see it"
        accessibilityHint={count > 1 ? 'Swipe the photos sideways to see the next one' : undefined}
        accessibilityActions={
          count > 1 ? [{ name: 'activate' }, { name: 'increment', label: 'Next photo' }] : [{ name: 'activate' }]
        }
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'increment') next()
          else onPress()
        }}
      >
        {count ? (
          photos.map((uri, index) => (
            <StackCard
              key={`${index}:${uri}`}
              uri={uri}
              index={index}
              count={count}
              front={front}
              thrown={thrown}
              dragX={dragX}
              thrownX={thrownX}
              dealt={dealt}
              reduceMotion={reduceMotion}
            />
          ))
        ) : (
          <View style={[styles.card, styles.markTilt]}>
            <LinearGradient colors={fallback.colors} style={styles.mark}>
              <Text style={styles.glyph} maxFontSizeMultiplier={1}>
                {fallback.character}
              </Text>
            </LinearGradient>
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  // Room for the fan's widest card and the tilt at the corners.
  stack: {
    width: CARD_W + 2 * SHIFT_X[1] + 8,
    height: CARD_H + SHIFT_Y[2] + 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    position: 'absolute',
    width: CARD_W,
    height: CARD_H,
    borderRadius: EMBER_RADIUS.md,
    overflow: 'hidden',
    backgroundColor: EMBER.surface,
    // A page-coloured edge, so overlapping photos read as separate cards without a shadow.
    borderWidth: 2,
    borderColor: EMBER.bg,
  },
  fill: { width: '100%', height: '100%' },
  markTilt: { transform: [{ rotate: '-4deg' }] },
  mark: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  glyph: { ...TYPE.display },
})

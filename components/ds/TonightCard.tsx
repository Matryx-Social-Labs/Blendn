import { useCallback, useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { COLOR, DURATION, RADIUS, SPACE, SPRING } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useReducedMotion } from '../../lib/motion'
import { tint } from '../../lib/theme'
import { EventCard, eventLabel, type EventCardProps } from './EventCard'

export type DeckEvent = Omit<EventCardProps, 'kind' | 'onPress' | 'previewState' | 'testID' | 'style'>

/** The two back-cards (the page): rotated −5° and 4°, shifted, scaled from their foot. */
const FAN = [
  { rotate: -5, dx: -16, dy: 14, scale: 0.9 },
  { rotate: 4, dx: 16, dy: 8, scale: 0.95 },
] as const
/** The deepest a back-card drops below the top card. */
const FAN_DROP = FAN[0].dy
/** The 2 pt ink outline that makes the top card read as a card on cards. */
const OUTLINE = SPACE.xxs
/** A drag past this, or a flick past `FLING` pt/s, moves the deck. */
const COMMIT = 56
const FLING = 500
/** The top card leans this far (degrees) at a full card's width of drag. */
const TILT = 8
const PIP = { on: 16, off: 6, height: 6 } as const
const PIP_OFF = tint(COLOR.textPrimary, 0.35)

/**
 * Tonight, one event at a time (guidelines/components/TonightCard.html): the
 * hero EventCard at radius 32 with a 2 pt ink outline, up to two fanned
 * back-cards (plain surface, −5° and 4°), and pips. One card: no fan, no pips.
 *
 * A horizontal swipe past 56 pt (or a flick) moves the deck: the top card
 * leaves on a `quick` throw and `H.select` plays as the next one settles; a
 * short drag springs back on `M.snap`. Reduce Motion cuts between cards (the
 * drag still tracks the finger). A tap opens the event, silently.
 *
 * A screen reader hears "{title}, {time}, at {venue}, 1 of 3" and adjusts the
 * deck (swipe up or down); a double-tap opens it. The pips are not read. The
 * top card grows with its text; the fan does not.
 */
export function TonightCard({
  events,
  index,
  onIndexChange,
  onOpen,
  width,
  height,
  previewState,
  testID,
}: {
  events: DeckEvent[]
  index: number
  onIndexChange: (index: number) => void
  onOpen: (index: number) => void
  width: number
  height: number
  /** The design gallery only. */
  previewState?: 'pressed'
  testID?: string
}) {
  const reduceMotion = useReducedMotion()
  const count = events.length
  const event = events[index] ?? events[0]
  const dragX = useSharedValue(0)

  // The next card is drawn in place once the parent moves the index.
  useEffect(() => {
    dragX.set(0)
  }, [index, dragX])

  const settle = useCallback(
    (next: number) => {
      H.select()
      onIndexChange(next)
    },
    [onIndexChange]
  )
  const move = (dir: 1 | -1) => {
    const next = index + dir
    if (next >= 0 && next < count) settle(next)
  }

  const swipe = Gesture.Pan()
    .enabled(count > 1)
    .activeOffsetX([-SPACE.sm, SPACE.sm])
    .failOffsetY([-SPACE.sm, SPACE.sm])
    .onUpdate((e) => {
      dragX.set(e.translationX)
    })
    .onEnd((e) => {
      const dir = e.translationX < -COMMIT || e.velocityX < -FLING ? 1 : e.translationX > COMMIT || e.velocityX > FLING ? -1 : 0
      const next = index + dir
      if (dir === 0 || next < 0 || next >= count) {
        dragX.set(reduceMotion ? 0 : withSpring(0, SPRING.snap))
        return
      }
      if (reduceMotion) {
        scheduleOnRN(settle, next)
        return
      }
      dragX.set(
        withTiming(-dir * width, { duration: DURATION.quick }, (done) => {
          if (done) scheduleOnRN(settle, next)
        })
      )
    })
  if (testID) swipe.withTestId(`${testID}-swipe`)

  const lean = useAnimatedStyle(
    () => ({ transform: [{ translateX: dragX.get() }, { rotate: `${(dragX.get() / width) * TILT}deg` }] }),
    [width]
  )

  if (!event) return null
  const backs = FAN.slice(2 - Math.min(2, count - 1))
  const many = count > 1

  return (
    <View testID={testID} style={{ width }}>
      <View style={{ width, height: height + FAN_DROP }}>
        {backs.map((f, i) => (
          <View
            key={f.rotate}
            testID={testID && `${testID}-back-${i}`}
            style={[
              styles.back,
              {
                width,
                height,
                transform: [{ translateX: f.dx }, { translateY: f.dy }, { rotate: `${f.rotate}deg` }, { scale: f.scale }],
              },
            ]}
          />
        ))}
        <GestureDetector gesture={swipe}>
          <Animated.View
            accessible
            accessibilityRole={many ? 'adjustable' : 'button'}
            accessibilityLabel={many ? `${eventLabel(event)}, ${index + 1} of ${count}` : eventLabel(event)}
            accessibilityHint={many ? 'Swipe up or down to move through tonight.' : undefined}
            accessibilityActions={many ? [{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }] : [{ name: 'activate' }]}
            onAccessibilityAction={(e) => {
              const action = e.nativeEvent.actionName
              if (action === 'increment') move(1)
              else if (action === 'decrement') move(-1)
              else if (action === 'activate') onOpen(index)
            }}
            style={lean}
          >
            <View testID={testID && `${testID}-top`} style={styles.outline}>
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <EventCard kind="hero" {...event} onPress={() => onOpen(index)} previewState={previewState} style={{ width, height }} testID={testID && `${testID}-card`} />
              </View>
            </View>
          </Animated.View>
        </GestureDetector>
      </View>
      {many ? (
        <View testID={testID && `${testID}-pips`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.pips}>
          {events.map((_, i) => (
            <View key={i} testID={testID && `${testID}-pip-${i}`} style={[styles.pip, i === index ? styles.pipOn : styles.pipOff]} />
          ))}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  back: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: RADIUS.card,
    backgroundColor: COLOR.surface,
    borderWidth: OUTLINE,
    borderColor: COLOR.ink,
    transformOrigin: 'bottom',
  },
  outline: { margin: -OUTLINE, borderWidth: OUTLINE, borderColor: COLOR.ink, borderRadius: RADIUS.card + OUTLINE },
  pips: { flexDirection: 'row', justifyContent: 'center', gap: SPACE.sm, marginTop: SPACE.sm },
  pip: { height: PIP.height, borderRadius: RADIUS.capsule },
  pipOn: { width: PIP.on, backgroundColor: COLOR.textPrimary },
  pipOff: { width: PIP.off, backgroundColor: PIP_OFF },
})

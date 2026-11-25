import { Image } from 'expo-image'
import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { COLOR, RADIUS, SPACE } from '../../lib/design/tokens'
import { SwipeDeck, type DeckFan } from '../motion/SwipeDeck'
import { tint } from '../../lib/theme'
import { EventCard, eventLabel, type EventCardProps } from './EventCard'

export type DeckEvent = Omit<EventCardProps, 'kind' | 'onPress' | 'previewState' | 'testID' | 'style'>

/** Tonight's cards are photographs at their brightest under the Room's glow: the scrim meets solid ink at the foot (TG-14). */
export const TONIGHT_SCRIM_FOOT = 1

/**
 * The pile: the top card square, two behind it turned -5° and 4°, shifted and scaled from their foot, the rest waiting
 * invisibly. Each is a real card with its own photograph, so it is already there when it reaches the front.
 */
const FAN: DeckFan = {
  rotate: [0, -5, 4, 4],
  shiftX: [0, -16, 16, 16],
  shiftY: [0, 14, 8, 8],
  scale: [1, 0.9, 0.95, 0.95],
  opacity: [1, 1, 1, 0],
}
/** The deepest a back-card drops below the top card. */
const FAN_DROP = 14
/** The 2 pt ink outline that makes the top card read as a card on cards. */
const OUTLINE = SPACE.xxs
/** How many covers past the top one are fetched ahead, so a swipe never reveals a blank card. */
export const PREFETCH_AHEAD = 3
const PIP = { on: 16, off: 6, height: 6 } as const
const PIP_OFF = tint(COLOR.textPrimary, 0.35)

/**
 * Tonight, one event at a time (guidelines/components/TonightCard.html): the
 * hero EventCard at radius 32 with a 2 pt ink outline, two fanned cards
 * behind it, and pips. One card: no fan, no pips.
 *
 * The pile is the Me tab's photo stack (`SwipeDeck`): drag, throw and settle
 * run on the UI thread from shared values, and a swipe never waits on a React
 * render. Every card is drawn with its own cover, and the next few covers are
 * prefetched, so each arrives at the front with its picture. A tap opens the
 * event, silently.
 *
 * A screen reader hears "{title}, {time}, at {venue}", the value "1 of 3", and
 * adjusts the deck (VoiceOver: swipe up or down; TalkBack: Next event in its
 * actions); a double-tap opens it. The pips are not read.
 */
export function TonightCard({
  events,
  onIndexChange,
  onOpen,
  width,
  height,
  previewState,
  testID,
}: {
  events: DeckEvent[]
  /** The card on top changed (after a swipe), with its index into `events`. */
  onIndexChange?: (index: number) => void
  onOpen: (index: number) => void
  width: number
  height: number
  /** The design gallery only. */
  previewState?: 'pressed'
  testID?: string
}) {
  const count = events.length
  const [front, setFront] = useState(0)
  const shown = Math.min(front, count - 1)
  const covers = events.map((e) => e.cover).filter((c): c is string => !!c)
  const key = covers.join('|')

  useEffect(() => {
    // The covers behind the top one (and the top one's own), warmed into the same cache the cards read.
    const ahead = covers.slice(0, PREFETCH_AHEAD + 1)
    if (ahead.length) void Image.prefetch(ahead, 'memory-disk')
    // `covers` is derived from `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (!count) return null
  const move = (i: number) => {
    setFront(i)
    onIndexChange?.(i)
  }

  return (
    <View testID={testID} style={{ width }}>
      <View style={{ width, height: height + FAN_DROP }}>
        <SwipeDeck
          items={events}
          keyOf={(e, i) => `${i}:${e.title}`}
          width={width}
          height={height}
          fan={FAN}
          tiltPer={width / 8}
          commitDistance={56}
          throwDistance={width}
          style={{ width, height: height + FAN_DROP, justifyContent: 'flex-start' }}
          cardStyle={styles.card}
          onPress={onOpen}
          onFrontChange={move}
          accessibilityLabel={eventLabel(events[shown])}
          accessibilityHint="Swipe up or down to move through tonight."
          accessibilityValue={count > 1 ? { text: `${shown + 1} of ${count}` } : undefined}
          nextLabel="Next event"
          renderCard={(event, i) => (
            <View testID={testID && `${testID}-card-${i}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <EventCard kind="hero" {...event} scrimFoot={TONIGHT_SCRIM_FOOT} previewState={i === shown ? previewState : undefined} style={{ width, height }} testID={testID && i === shown ? `${testID}-card` : undefined} />
            </View>
          )}
        />
      </View>
      {count > 1 ? (
        <View testID={testID && `${testID}-pips`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.pips}>
          {events.map((_, i) => (
            <View key={i} testID={testID && `${testID}-pip-${i}`} style={[styles.pip, i === shown ? styles.pipOn : styles.pipOff]} />
          ))}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.card, borderWidth: OUTLINE, borderColor: COLOR.ink, transformOrigin: 'bottom' },
  pips: { flexDirection: 'row', justifyContent: 'center', gap: SPACE.sm, marginTop: SPACE.sm },
  pip: { height: PIP.height, borderRadius: RADIUS.capsule },
  pipOn: { width: PIP.on, backgroundColor: COLOR.textPrimary },
  pipOff: { width: PIP.off, backgroundColor: PIP_OFF },
})

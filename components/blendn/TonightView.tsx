import { useEffect, useState, type ReactNode } from 'react'
import { Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { GestureDetector } from 'react-native-gesture-handler'
import Animated from 'react-native-reanimated'

import { COLOR, FONT_FAMILY, ICON, MAX_FONT_SCALE, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { distanceText } from '../../lib/placesPane'
import { startsLabel } from '../../lib/roomMoments'
import { calendarDaysBetween, eventClock } from '../../lib/time'
import type { TonightEvent, TonightLocation } from '../../lib/useTonight'
import { Banner } from '../ds/Banner'
import type { PourFrame as PassFrame } from '../ds/MomentPour'
import { font, minTarget, useBoldText } from '../ds/shared'
import { StateScreen } from '../ds/StateScreen'
import { TonightCard, type DeckEvent } from '../ds/TonightCard'
import { VenuePass } from '../ds/VenuePass'
import { Icon } from '../ui/Icon'
import { useNow } from './RoomSections'
import { useStageScroll } from './RoomStage'

/** A deck, not a catalogue: the rest are one tap away under "See all" (Flow 4 Tonight #04, DECK_MAX). */
const DECK_MAX = 10
/** The deck card is inset 40 from each edge (Flow 4 Tonight). */
const DECK_INSET = SPACE.xxl + SPACE.sm
/** Portrait at 1.14 (the deck), 1.22 (the loading card), when there is room for it. */
const DECK_ASPECT = 1.14
const SKELETON_ASPECT = 1.22
/** Room under the card for the pips, and the fan's drop. */
const PIPS = SPACE.lg + SPACE.xs
const FAN_DROP = SPACE.md + SPACE.xxs
/** The empty and error states sit 72 below the sub line. */
const STATE_TOP = SPACE.xxxl + SPACE.xl
/** Below this a card stops reading as a card; the page scrolls instead. */
const MIN_CARD = 280

/** Today where the event is: the "You're going · 9 PM" ribbon is for tonight only (Flow 4 Tonight #05), its night (R6-4). */
function startsToday(iso: string, now: number, timeZone?: string | null) {
  return calendarDaysBetween(new Date(now), new Date(iso), timeZone ?? undefined) === 0
}

/** A Tonight event as the deck's hero card: "In 25 min", "9 going", "at {venue} · 1.2 km", the saved ribbon. */
export function deckEvent(e: TonightEvent, now: number): DeckEvent {
  return {
    title: e.title,
    time: startsLabel(e, now).text,
    venue: e.venue,
    distance: distanceText(e.distanceKm) ?? undefined,
    going: e.goingCount ?? undefined,
    cover: e.photo,
    category: e.category,
    // The event's clock, named when its zone is not the phone's: "9 PM IST" on a Berlin phone (R6-4).
    saved: e.going && startsToday(e.startsAt, now, e.timeZone) ? eventClock(e.startsAt, e.timeZone) : undefined,
  }
}

/** The deck, sized to the room it has (`maxHeight`, 0 while unmeasured). Flicks are the TonightCard's. */
function EventDeck({ events, now, onOpen, maxHeight }: { events: TonightEvent[]; now: number; onOpen: (id: string) => void; maxHeight: number }) {
  const { width: screen } = useWindowDimensions()
  const deck = events.slice(0, DECK_MAX)
  const [index, setIndex] = useState(0)
  const width = screen - DECK_INSET * 2
  const fit = maxHeight > 0 ? maxHeight - FAN_DROP - (deck.length > 1 ? PIPS : 0) : Infinity
  const height = Math.max(MIN_CARD, Math.min(Math.round(width * DECK_ASPECT), fit))
  // The list can shrink under the deck (an event ends); never point past it.
  const shown = Math.min(index, deck.length - 1)
  return (
    <View style={styles.deck}>
      <TonightCard
        events={deck.map((e) => deckEvent(e, now))}
        index={shown}
        onIndexChange={setIndex}
        onOpen={(i) => deck[i] && onOpen(deck[i].id)}
        width={width}
        height={height}
        testID="tonight-deck"
      />
    </View>
  )
}

export type TonightViewProps = {
  events: TonightEvent[]
  /** Nothing on screen yet: the one static card. */
  loading: boolean
  /** The feed failed and there is nothing on screen to keep. */
  error: boolean
  /** A refresh failed and the deck is what loaded earlier (#11). */
  offline?: boolean
  location?: TonightLocation
  onRetry: () => void
  insideEvent: TonightEvent | null
  /** In another event's room already: the pass's hold is a switch out of it (ROUND4 8.3 #06). */
  switchFrom?: string
  checkingIn: boolean
  /** The server said yes: the hold stays full under "You’re in" until the Room is there (motion #9). */
  youreIn?: boolean
  /** Where the docked pass is, in this view's frame: the pour fills exactly it (Flow 4 delta R2-D1, "success"). */
  onPassFrame?: (frame: PassFrame) => void
  onOpenEvent: (id: string) => void
  onSeeAll: () => void
  onBrowse: () => void
  onCheckIn: () => void
  /** The Room failed to load for someone checked in: Tonight stays, with a quiet line (Flow 4 Room #15). */
  onRoomRetry?: () => void
  /** After the server's yes: "Tell your crew" in the pass, which grows upward to hold it (Flow 4 delta R2-D1 "success"). */
  crewStrip?: ReactNode
  topInset: number
  bottomInset: number
}

/**
 * Blend'n before you are anywhere (Flow 4 Tonight, guidelines/flow-4): what is
 * on tonight as a deck, nearest first with yours on top, and, when you are
 * standing inside an event's fence, the VenuePass docked at the bottom with
 * the hold. The pass is the only gradient on this screen.
 *
 * The states are the frames': loading (one static card), the deck (1, 3,
 * 10), saved today (the ribbon), the pass, the pass only, empty, error,
 * location off (#10), offline (#11), approximate location (R3-D4 4.7: one
 * quiet line, and no pass), and the Room's error (#15) as a banner over it.
 */
export function TonightView({
  events,
  loading,
  error,
  offline = false,
  location = 'on',
  onRetry,
  insideEvent,
  switchFrom,
  checkingIn,
  youreIn = false,
  onPassFrame,
  onOpenEvent,
  onSeeAll,
  onBrowse,
  onCheckIn,
  onRoomRetry,
  crewStrip,
  topInset,
  bottomInset,
}: TonightViewProps) {
  const bold = useBoldText()
  const now = useNow(60_000)
  const { onScroll, native, scrollEventThrottle } = useStageScroll()
  // The pass's frame is the dock's place plus the pass's place in it.
  const [dockAt, setDockAt] = useState<PassFrame | null>(null)
  const [passAt, setPassAt] = useState<PassFrame | null>(null)
  useEffect(() => {
    if (dockAt && passAt) onPassFrame?.({ x: dockAt.x + passAt.x, y: dockAt.y + passAt.y, width: passAt.width, height: passAt.height })
  }, [dockAt, passAt, onPassFrame])

  // The deck takes the height left between the head and the pass.
  const [viewport, setViewport] = useState(0)
  const [headHeight, setHeadHeight] = useState(0)
  // R3-D4 4.7: with approximate location no door can be confirmed, so no pass is offered.
  const door = location === 'approximate' ? null : insideEvent
  const list = door ? events.filter((e) => e.id !== door.id) : events
  const deckRoom = viewport ? viewport - topInset - headHeight - SPACE.xl : 0
  const sub =
    location === 'approximate'
      ? 'Approximate location. Check-in needs your exact spot: turn on Precise Location for Blend’n.'
      : door
        ? 'You’re at an event. Hold the pass below to check in.'
        : 'Check in at an event to open its room.'

  return (
    <View style={styles.fill}>
      <GestureDetector gesture={native}>
        <Animated.ScrollView
          testID="tonight"
          style={styles.fill}
          onLayout={(e) => setViewport(Math.floor(e.nativeEvent.layout.height))}
          onScroll={onScroll}
          scrollEventThrottle={scrollEventThrottle}
          bounces={false}
          contentContainerStyle={{ paddingTop: topInset, paddingBottom: door ? SPACE.md : bottomInset + SPACE.xl }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.head} onLayout={(e) => setHeadHeight(Math.ceil(e.nativeEvent.layout.height))}>
            <View style={styles.titleRow}>
              <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE.display} style={[font('display', bold), styles.ink]}>
                Tonight
              </Text>
              {list.length > 0 ? (
                <Pressable
                  onPress={onSeeAll}
                  hitSlop={(minTarget() - SPACE.xl) / 2}
                  accessibilityRole="button"
                  accessibilityLabel="See all"
                  testID="tonight-see-all"
                  style={styles.seeAll}
                >
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE.button} style={[font('button', bold), styles.secondary]}>See all</Text>
                  <Icon name="chevron-right" size={ICON.inline} color={COLOR.textSecondary} />
                </Pressable>
              ) : null}
            </View>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>{sub}</Text>
            {onRoomRetry ? (
              <Banner kind="info" text="Couldn’t check your room. You can still browse tonight." action={{ label: 'Try again', onPress: onRoomRetry }} testID="tonight-room-error" />
            ) : null}
            {offline ? <Banner kind="offline" text="Offline. Showing what loaded earlier." testID="tonight-offline" /> : null}
            {location === 'off' ? (
              <Banner
                kind="info"
                text="Location is off. Events are listed by city, without distances."
                action={{ label: 'Turn on', onPress: () => void Linking.openSettings().catch(() => {}) }}
                testID="tonight-location-off"
              />
            ) : null}
          </View>

          {loading && events.length === 0 ? (
            <View style={styles.deck}>
              <Skeleton room={deckRoom} />
            </View>
          ) : error && list.length === 0 && !door ? (
            // A failed load is not "nothing on": that is a claim about the world the screen can't make.
            <View style={styles.state}>
              <StateScreen
                icon="cloud-off"
                title="Couldn’t load tonight’s events"
                body="Check your connection and try again."
                actions={[{ label: 'Try again', onPress: onRetry }]}
                testID="tonight-error"
              />
            </View>
          ) : list.length === 0 && !door ? (
            <View style={styles.state}>
              <StateScreen
                icon="moon"
                title="Nothing on near you right now"
                body="Save something on the Pulse and it shows up here on the night."
                actions={[{ label: 'Browse the Pulse', onPress: onBrowse }]}
                testID="tonight-empty"
              />
            </View>
          ) : list.length > 0 ? (
            <EventDeck events={list} now={now} onOpen={onOpenEvent} maxHeight={deckRoom} />
          ) : null}
        </Animated.ScrollView>
      </GestureDetector>

      {door ? (
        <View
          testID="tonight-pass-dock"
          style={[styles.passDock, { paddingBottom: bottomInset + SPACE.md }]}
          onLayout={(e) => setDockAt(e.nativeEvent.layout)}
        >
          <View testID="tonight-pass-slot" onLayout={(e) => setPassAt(e.nativeEvent.layout)}>
            <VenuePass
              title={door.title}
              cover={door.photo}
              hereCount={door.hereCount}
              tasteCount={door.tasteMatchCount}
              onConfirm={onCheckIn}
              holdLabel={switchFrom ? 'Hold to switch' : undefined}
              note={switchFrom ? `You’ll leave ${switchFrom}` : undefined}
              busy={checkingIn && !youreIn}
              confirmed={youreIn}
              testID="tonight-pass"
            >
              {youreIn ? crewStrip : null}
            </VenuePass>
          </View>
        </View>
      ) : location === 'approximate' ? (
        // ROUND4 8.3 #08: no pass at all; where it would dock, why, and the way to fix it.
        <View testID="tonight-approximate" style={[styles.passDock, { paddingBottom: bottomInset + SPACE.md }]}>
          <View style={styles.approx}>
            <Icon name="locate-off" size={ICON.control} color={COLOR.textPrimary} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.ink, styles.grow]}>No pass without precise location</Text>
            <Pressable
              onPress={() => void Linking.openSettings().catch(() => {})}
              hitSlop={(minTarget() - SPACE.xl) / 2}
              accessibilityRole="button"
              accessibilityLabel="Turn on Precise Location"
              testID="tonight-approximate-turn-on"
            >
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.ink]}>Turn on</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  )
}

/** Flow 4 Tonight #01: one static card, nothing loops. */
function Skeleton({ room }: { room: number }) {
  const { width: screen } = useWindowDimensions()
  const width = screen - DECK_INSET * 2
  const height = Math.max(MIN_CARD, Math.min(Math.round(width * SKELETON_ASPECT), room ? room - SPACE.xl : Infinity))
  return <View testID="tonight-skeleton" accessibilityLabel="Loading tonight" style={[styles.skeleton, { width, height }]} />
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { paddingHorizontal: SPACE.gutter, gap: SPACE.sm, paddingBottom: SPACE.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xxs },
  deck: { alignItems: 'center', paddingTop: SPACE.sm },
  state: { paddingHorizontal: SPACE.gutter, paddingTop: STATE_TOP },
  skeleton: { borderRadius: RADIUS.card, backgroundColor: COLOR.surfaceSunken },
  passDock: { paddingHorizontal: SPACE.md, paddingTop: SPACE.md },
  approx: {
    height: SIZE.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    // 24 from the screen edges, inside the dock's 12 (ROUND4 8.3 #08).
    marginHorizontal: SPACE.md,
    borderRadius: RADIUS.rowInCard,
    backgroundColor: COLOR.surface,
  },
  grow: { flex: 1 },
})

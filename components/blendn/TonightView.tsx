import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import React, { useState } from 'react'
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import { GestureDetector } from 'react-native-gesture-handler'
import Animated, { FadeInDown } from 'react-native-reanimated'

import { startsLabel } from '../../lib/roomMoments'
import type { TonightEvent } from '../../lib/useTonight'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE } from '../../lib/theme'
import ScalePress from '../motion/ScalePress'
import { SwipeDeck, type DeckFan } from '../motion/SwipeDeck'
import { OptimizedImage } from '../OptimizedImage'
import { RollingNumber } from '../profile/RollingNumber'
import { Text } from '../ui/Text'
import { HoldToConfirm } from './HoldToConfirm'
import { useNow } from './RoomSections'
import { useStageScroll } from './RoomStage'

const THUMB = CONTROL.lg

function distanceText(km: number | null) {
  if (km === null || !Number.isFinite(km)) return null
  return km < 1 ? `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m` : `${km.toFixed(1)} km`
}

/**
 * The time badge in the left column — Luma's LIVE / IN 12H.
 *
 * Live is the one that matters, so it is the only one with colour: a still
 * green dot and the word. Everything else is a neutral pill with the time.
 */
function TimeBadge({ event, now }: { event: TonightEvent; now: number }) {
  const s = startsLabel(event, now)
  const live = s.kind === 'live'
  return (
    <View style={[styles.badge, live && styles.badgeLive]}>
      {live ? <View style={styles.liveDot} /> : null}
      <Text variant="caption" color={live ? EMBER.textPrimary : EMBER.textSecondary} numberOfLines={1}>
        {s.text}
      </Text>
    </View>
  )
}

/*
 * The Me tab's fan, scaled up to a card you read: shallower angles (a 300pt
 * card at the photo stack's 11° swings its corner a long way), wider offsets
 * so the two behind peek out either side, and a longer throw to match.
 */
const FAN: DeckFan = {
  rotate: [-2, 4, -5, -5],
  shiftX: [0, 16, -16, -16],
  shiftY: [0, 8, 14, 14],
  scale: [1, 0.95, 0.9, 0.9],
  opacity: [1, 1, 1, 0],
}
/** A deck, not a catalogue: the rest are one tap away under "See all". */
const DECK_MAX = 10
/** The pager row under the deck: its pips plus the gap above them. */
const PAGER = SPACE.xl
/** Below this a card stops reading as a card; the page scrolls instead. */
const MIN_CARD = 280
/** What the deck area spends besides the card: pager, the fan's drop, breathing room. */
const DECK_CHROME = SPACE.lg

/**
 * One event as a card in the deck: the photo, full bleed, with what you need
 * to decide laid over its darkened foot — when, where, how many are there.
 */
function EventCard({ event, now, width, height }: { event: TonightEvent; now: number; width: number; height: number }) {
  const distance = distanceText(event.distanceKm)
  const where = [event.venue, distance].filter(Boolean).join(' · ')
  return (
    <View style={styles.cardFill}>
      {event.photo ? (
        <OptimizedImage
          source={event.photo}
          recyclingKey={event.photo}
          style={styles.cardFill as never}
          width={width}
          height={height}
          contentFit="cover"
        />
      ) : null}
      {/* A photo fade, the one gradient the system allows: it is what makes the type legible. */}
      <LinearGradient colors={['transparent', EMBER.scrim]} locations={[0.35, 1]} style={StyleSheet.absoluteFill} />
      <View style={styles.cardTop}>
        <TimeBadge event={event} now={now} />
        {event.hereCount > 0 ? (
          <View style={styles.herePill}>
            <RollingNumber value={event.hereCount} variant="caption" color={EMBER.textPrimary} duration={260} stagger={40} />
            <Text variant="caption" color={EMBER.textPrimary}>
              there
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.cardFoot}>
        {event.going ? (
          <Text variant="label" color={EMBER.textPrimary}>
            YOU&apos;RE GOING
          </Text>
        ) : null}
        <Text variant="title" color={EMBER.textPrimary} numberOfLines={2} maxFontSizeMultiplier={1.3}>
          {event.title}
        </Text>
        {where ? (
          <Text variant="meta" color={EMBER.textPrimary} numberOfLines={1}>
            {where}
          </Text>
        ) : null}
        {event.tasteMatchCount && event.tasteMatchCount > 0 ? (
          <Text variant="meta" color={EMBER.textSecondary} numberOfLines={1}>
            {event.tasteMatchCount} there share your taste
          </Text>
        ) : null}
      </View>
    </View>
  )
}

/**
 * Tonight as a deck you flick through — the Me tab's photo stack, at the size
 * of a decision.
 *
 * A list made every event the same weight and put the one you would actually
 * go to somewhere in a column. A deck shows one at a time, big, with the next
 * two peeking out behind it: flick it away and the next is already there,
 * tap it and you are on its page. It is ordered the way the list was — yours
 * first, then nearest — so the top card is the best guess.
 */
function EventDeck({
  events,
  now,
  onOpen,
  maxHeight,
}: {
  events: TonightEvent[]
  now: number
  onOpen: (id: string) => void
  /** The height the deck may take, pager included; 0 while unmeasured. */
  maxHeight: number
}) {
  const { width: screen } = useWindowDimensions()
  const deck = events.slice(0, DECK_MAX)
  const [front, setFront] = useState(0)
  const fullWidth = screen - GUTTER * 2 - FAN.shiftX[1] * 2
  // Portrait at 1.22 when it fits; shorter (and a touch narrower) when it doesn't.
  const fit = maxHeight > 0 ? maxHeight - FAN.shiftY[2] - PAGER : Infinity
  const height = Math.max(MIN_CARD, Math.min(Math.round(fullWidth * 1.22), fit))
  const width = Math.min(fullWidth, Math.round(height / 1.05))
  const top = deck[front] ?? deck[0]

  return (
    <View style={styles.deckWrap}>
      <SwipeDeck
        items={deck}
        keyOf={(e) => e.id}
        width={width}
        height={height}
        fan={FAN}
        commitDistance={56}
        throwDistance={Math.round(width * 0.55)}
        tiltPer={18}
        style={{ width: screen, height: height + FAN.shiftY[2] }}
        cardStyle={styles.card}
        onPress={(i) => deck[i] && onOpen(deck[i].id)}
        onFrontChange={setFront}
        accessibilityLabel={top ? `${top.title}. ${startsLabel(top, now).text}. ${top.venue}` : 'Tonight'}
        accessibilityHint={deck.length > 1 ? 'Swipe sideways for the next event. Double tap to open it.' : 'Double tap to open it.'}
        nextLabel="Next event"
        renderCard={(e) => <EventCard event={e} now={now} width={width} height={height} />}
      />
      {deck.length > 1 ? (
        <View style={styles.pager} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {deck.map((e, i) => (
            <View key={e.id} style={[styles.pip, i === front && styles.pipOn]} />
          ))}
        </View>
      ) : null}
    </View>
  )
}

/**
 * Faces you can't see yet — 222's "& your 4 closest matches" with blank discs.
 *
 * The count is real (`room-preview`, never under three people so it cannot
 * identify anybody); the faces are withheld until you check in, which is what
 * makes checking in the reveal rather than a chore.
 */
function Teaser({ count }: { count: number }) {
  const shown = Math.min(count, 3)
  return (
    <View style={styles.teaser} accessible accessibilityLabel={`${count} people here share your taste. Check in to see them.`}>
      <View style={styles.blankStack}>
        {Array.from({ length: shown }).map((_, i) => (
          <View key={i} style={[styles.blank, i > 0 && styles.blankOverlap]}>
            <Text variant="caption" color={EMBER.textTertiary}>
              ?
            </Text>
          </View>
        ))}
      </View>
      <Text variant="meta" color={EMBER.textPrimary} style={styles.teaserText}>
        {count} {count === 1 ? 'person' : 'people'} here share your taste
      </Text>
    </View>
  )
}

/**
 * The door. Docked at the bottom when you are standing inside an event's fence
 * — the boarding pass you hold to go through (FocusFlight + Opal).
 */
export function VenuePass({
  event,
  tasteMatchCount,
  busy,
  onHold,
}: {
  event: TonightEvent
  tasteMatchCount: number | null
  busy: boolean
  onHold: () => void
}) {
  return (
    <Animated.View entering={FadeInDown.duration(320)} style={styles.pass}>
      <View style={styles.passHead}>
        {event.photo ? (
          <OptimizedImage
            source={event.photo}
            recyclingKey={event.photo}
            style={styles.thumb as never}
            width={THUMB}
            height={THUMB}
            contentFit="cover"
          />
        ) : null}
        <View style={styles.rowText}>
          <Text variant="label">YOU&apos;RE HERE</Text>
          <Text variant="bodyStrong" numberOfLines={1}>
            {event.title}
          </Text>
          <Text variant="meta" numberOfLines={1}>
            {event.hereCount > 0 ? `${event.hereCount} inside now` : 'Be the first one in'}
          </Text>
        </View>
      </View>
      {tasteMatchCount && tasteMatchCount > 0 ? <Teaser count={tasteMatchCount} /> : null}
      <HoldToConfirm
        label="Hold to check in"
        icon="finger-print"
        busy={busy}
        busyLabel="Checking you in…"
        onConfirm={onHold}
        accessibilityHint="Checks you in and opens the room"
      />
    </Animated.View>
  )
}

/**
 * Blend'n before you are anywhere: what is on tonight, nearest first.
 *
 * This replaced three different destinations for one button — the event page
 * if you had one today, the nearby list if not — so the centre of the app had
 * no home of its own until you were checked in. Now it always opens here, and
 * *here* changes with you: a list tonight, a door when you arrive, the room
 * once you are in.
 */
export function TonightView({
  events,
  loading,
  insideEvent,
  tasteMatchCount,
  checkingIn,
  onOpenEvent,
  onSeeAll,
  onBrowse,
  onCheckIn,
  topInset,
  bottomInset,
}: {
  events: TonightEvent[]
  loading: boolean
  insideEvent: TonightEvent | null
  tasteMatchCount: number | null
  checkingIn: boolean
  onOpenEvent: (id: string) => void
  onSeeAll: () => void
  onBrowse: () => void
  onCheckIn: () => void
  topInset: number
  bottomInset: number
}) {
  const now = useNow(60_000)
  const { onScroll, native, scrollEventThrottle } = useStageScroll()
  /*
   * The deck is sized to the room it has, not to its width alone.
   *
   * It used to be `width × 1.22` in a scroll with the pass floating over the
   * bottom — on a phone the pass covered the foot of the deck and "See
   * everything nearby", and padding only helped once you scrolled, which
   * nobody does on a screen that looks complete (driven on device). Now the
   * pass sits *in* the column under the scroll, the link lives in the header,
   * and the card takes whatever height is left between them.
   */
  const [viewport, setViewport] = useState(0)
  const [headHeight, setHeadHeight] = useState(0)
  const list = insideEvent ? events.filter((e) => e.id !== insideEvent.id) : events
  const deckRoom = viewport ? viewport - topInset - headHeight - DECK_CHROME : 0

  return (
    <View style={styles.fill}>
      <GestureDetector gesture={native}>
        <Animated.ScrollView
          style={styles.fill}
          onLayout={(e) => setViewport(Math.floor(e.nativeEvent.layout.height))}
          onScroll={onScroll}
          scrollEventThrottle={scrollEventThrottle}
          bounces={false}
          contentContainerStyle={{
            paddingTop: topInset,
            paddingBottom: insideEvent ? SPACE.md : bottomInset + SPACE.xl,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.head} onLayout={(e) => setHeadHeight(Math.ceil(e.nativeEvent.layout.height))}>
            <View style={styles.titleRow}>
              <Text variant="display" accessibilityRole="header">
                Tonight
              </Text>
              {list.length > 0 ? (
                <Pressable
                  onPress={onSeeAll}
                  hitSlop={12}
                  style={({ pressed }) => [styles.seeAll, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="See everything nearby"
                >
                  <Text variant="button" color={EMBER.textSecondary}>
                    See all
                  </Text>
                  <Ionicons name="chevron-forward" size={ICON.sm} color={EMBER.textSecondary} />
                </Pressable>
              ) : null}
            </View>
            <Text variant="meta">
              {insideEvent
                ? 'You’re at an event — hold the pass below to check in.'
                : 'Check in at an event to open its room.'}
            </Text>
          </View>

          {loading && events.length === 0 ? (
            <View style={styles.skeletonWrap}>
              <View style={styles.skeleton} />
            </View>
          ) : list.length === 0 && !insideEvent ? (
            <View style={styles.empty}>
              <Ionicons name="moon-outline" size={ICON.lg} color={EMBER.textTertiary} />
              <Text variant="bodyStrong">Nothing on near you right now</Text>
              <Text variant="meta" style={styles.centre}>
                Save something on the Pulse and it shows up here on the night.
              </Text>
              <ScalePress onPress={onBrowse} style={styles.browse} accessibilityRole="button">
                <Text variant="button">Browse the Pulse</Text>
              </ScalePress>
            </View>
          ) : list.length > 0 ? (
            <EventDeck events={list} now={now} onOpen={onOpenEvent} maxHeight={deckRoom} />
          ) : null}
        </Animated.ScrollView>
      </GestureDetector>

      {insideEvent ? (
        <View style={[styles.passDock, { paddingBottom: bottomInset + SPACE.md }]}>
          <VenuePass
            event={insideEvent}
            tasteMatchCount={tasteMatchCount}
            busy={checkingIn}
            onHold={onCheckIn}
          />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { paddingHorizontal: GUTTER, gap: SPACE.xs, paddingBottom: SPACE.xl },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pressed: { opacity: 0.6 },
  skeletonWrap: { paddingHorizontal: GUTTER + SPACE.lg },
  skeleton: { aspectRatio: 1 / 1.22, borderRadius: EMBER_RADIUS.card, backgroundColor: EMBER.skeleton },
  deckWrap: { alignItems: 'center' },
  card: {
    borderRadius: EMBER_RADIUS.card,
    backgroundColor: EMBER.surface,
    // A page-coloured edge, so the cards behind read as separate without a shadow.
    borderWidth: 2,
    borderColor: EMBER.bg,
  },
  cardFill: { width: '100%', height: '100%' },
  cardTop: {
    position: 'absolute',
    top: SPACE.lg,
    left: SPACE.lg,
    right: SPACE.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  herePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    height: CONTROL.sm - SPACE.sm,
    paddingHorizontal: SPACE.sm,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.bg,
  },
  cardFoot: { position: 'absolute', left: SPACE.xl, right: SPACE.xl, bottom: SPACE.xl, gap: SPACE.xs },
  pager: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, height: PAGER },
  pip: { width: SPACE.xs + 2, height: SPACE.xs + 2, borderRadius: EMBER_RADIUS.pill, backgroundColor: EMBER.separator },
  pipOn: { backgroundColor: EMBER.textPrimary, width: SPACE.lg },
  badge: {
    width: CONTROL.lg + SPACE.sm,
    height: CONTROL.sm - SPACE.sm,
    borderRadius: EMBER_RADIUS.pill,
    // On a photo now, so the page colour rather than a surface tone.
    backgroundColor: EMBER.bg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.xs,
  },
  badgeLive: {},
  liveDot: { width: SPACE.sm - 2, height: SPACE.sm - 2, borderRadius: EMBER_RADIUS.pill, backgroundColor: EMBER.success },
  thumb: { width: THUMB, height: THUMB, borderRadius: EMBER_RADIUS.sm },
  thumbEmpty: { backgroundColor: EMBER.surface },
  rowText: { flex: 1, gap: SPACE.xxs },
  count: { alignItems: 'flex-end' },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xxs },
  empty: { alignItems: 'center', gap: SPACE.sm, paddingHorizontal: GUTTER, paddingTop: SPACE.xxl },
  centre: { textAlign: 'center' },
  browse: {
    marginTop: SPACE.md,
    height: CONTROL.md,
    paddingHorizontal: SPACE.xl,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    justifyContent: 'center',
  },
  passDock: { paddingHorizontal: SPACE.md, paddingTop: SPACE.xs },
  pass: {
    gap: SPACE.md,
    padding: SPACE.lg,
    borderRadius: EMBER_RADIUS.lg,
    backgroundColor: EMBER.surface,
  },
  passHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  teaser: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  teaserText: { flex: 1 },
  blankStack: { flexDirection: 'row' },
  blank: {
    width: CONTROL.sm,
    height: CONTROL.sm,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surfaceSunken,
    borderWidth: 2,
    borderColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blankOverlap: { marginLeft: -SPACE.sm },
})

import { Ionicons } from '@expo/vector-icons'
import React, { memo, useEffect, useState } from 'react'
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useReducedMotion,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

import { MOTION_SPRING, MOTION_STAGGER } from '../../lib/motion'
import { hereNowStack, reasonLine, shuffleCountdownLabel, timeHereLabel } from '../../lib/roomMoments'
import type { RoomPerson } from '../../lib/useRoom'
import { EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE } from '../../lib/theme'
import { RollingNumber } from '../profile/RollingNumber'
import { Text } from '../ui/Text'
import { Face } from './Face'
import { HeartPop } from './HeartPop'
import { TimeRing } from './TimeRing'

/** Re-render once a `period`, for labels that age ("12m", "4:12"). */
export function useNow(period: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), period)
    return () => clearInterval(id)
  }, [period])
  return now
}

/*
 * A face arriving in the stack: up from 0.6 with a little spring, never from 0
 * (Airbnb's add-guests, 60fps.design). The faces already there slide aside on
 * `LinearTransition` — plain views, no blur or shadow, so a layout transition
 * is cheap here (tasks/lessons.md).
 */
const faceIn = () => {
  'worklet'
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.6 }, { translateY: 8 }] },
    animations: {
      opacity: withTiming(1, { duration: 160 }),
      transform: [
        { scale: withSpring(1, MOTION_SPRING.snappy) },
        { translateY: withSpring(0, MOTION_SPRING.snappy) },
      ],
    },
  }
}

const STACK = 6
const STACK_FACE = 32

/**
 * The top of the room: that it is live, where, how many, and you.
 *
 * - **The count is the headline.** It rolls digit by digit when somebody walks
 *   in or leaves (Habitastic's counter flip), short enough (260ms) to tick
 *   twice in a second without queueing.
 * - **The stack under it is who just arrived**, newest first, each springing in
 *   as the socket says so, with a line naming the latest ("Priya walked in").
 *   Before anybody arrives this session it is simply the first few faces here.
 * - **Your face wears the time**, set around it as type (Bump): IN THE ROOM ·
 *   1H 12M. Presence without a halo.
 *
 * The LIVE dot is still, green, and small — `docs/NAVIGATION.md`: motion
 * cannot carry a state.
 */
export const RoomHero = memo(function RoomHero({
  title,
  hereCount,
  checkedInAt,
  me,
  arrivals,
  people,
}: {
  title: string
  hereCount: number
  checkedInAt: string | null
  me: { name: string; photo: string | null }
  arrivals: RoomPerson[]
  people: RoomPerson[]
}) {
  const reduceMotion = useReducedMotion()
  const now = useNow(30_000)
  const latest = arrivals[0]
  const fresh = latest?.arrivedAt && now - Date.parse(latest.arrivedAt) < 5 * 60_000 ? latest : null
  const stack = hereNowStack(arrivals, people, STACK)
  const others = Math.max(0, hereCount - stack.length - 1)
  const time = checkedInAt ? timeHereLabel(checkedInAt, now) : null

  return (
    <View style={styles.hero}>
      <View style={styles.heroText}>
        <View style={styles.liveRow}>
          <View style={styles.liveDot} />
          <Text variant="label" color={EMBER.textPrimary}>
            LIVE
          </Text>
        </View>
        <Text variant="heading" numberOfLines={2} maxFontSizeMultiplier={1.3} accessibilityRole="header">
          {title}
        </Text>
        <View
          style={styles.countRow}
          accessible
          accessibilityLabel={`${hereCount} ${hereCount === 1 ? 'person' : 'people'} here now`}
          accessibilityLiveRegion="polite"
        >
          <RollingNumber value={hereCount} variant="display" duration={260} stagger={40} />
          <Text variant="meta" style={styles.countLabel}>
            here now
          </Text>
        </View>
        {stack.length ? (
          <View style={styles.stackRow}>
            <View style={styles.stack}>
              {stack.map((p, i) => (
                <Animated.View
                  key={p.id}
                  entering={reduceMotion ? FadeIn : faceIn}
                  exiting={FadeOut.duration(120)}
                  layout={reduceMotion ? undefined : LinearTransition.springify().damping(18).stiffness(220)}
                  style={[styles.stackFace, { zIndex: STACK - i }]}
                >
                  <Face name={p.name} photo={p.photo} size={STACK_FACE} ring />
                </Animated.View>
              ))}
            </View>
            <Text variant="meta" numberOfLines={1} style={styles.stackText}>
              {fresh ? `${fresh.name} walked in` : others > 0 ? `+${others}` : ''}
            </Text>
          </View>
        ) : null}
      </View>

      <View accessible accessibilityLabel={time ? `You've been here ${time}` : 'You'}>
        <TimeRing text={time ? `IN THE ROOM · ${time.toUpperCase()}` : 'IN THE ROOM'} size={112}>
          <Face name={me.name} photo={me.photo} size={72} />
        </TimeRing>
      </View>
    </View>
  )
})

/**
 * Three people to meet next, reshuffled every 15 minutes — and the clock says so.
 *
 * TikTok LIVE's "Next update: 19:44:04" over a podium. The server already ranks
 * the room; this shows its top three with the *reason* under each, and rotates
 * through the top nine on a window every phone agrees on (`meetNext`). A
 * visible countdown is a reason to come back to the screen that the list
 * itself never gave.
 *
 * On a shuffle the three cards fade and rise in again, staggered, keyed by
 * person — so a card that survives the shuffle does not flicker.
 */
export const MeetNext = memo(function MeetNext({
  picks,
  nextShuffleAt,
  onOpen,
}: {
  picks: RoomPerson[]
  nextShuffleAt: number
  onOpen: (p: RoomPerson) => void
}) {
  const now = useNow(1000)
  const { width } = useWindowDimensions()
  const reduceMotion = useReducedMotion()
  if (picks.length === 0) return null
  const tile = (width - GUTTER * 2 - SPACE.md * 2) / 3

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text variant="heading">Meet next</Text>
        <View style={styles.timer} accessible accessibilityLabel={`Shuffles in ${shuffleCountdownLabel(nextShuffleAt, now)}`}>
          <Ionicons name="shuffle" size={ICON.sm} color={EMBER.textSecondary} />
          <Text variant="caption" style={styles.tabular}>
            {shuffleCountdownLabel(nextShuffleAt, now)}
          </Text>
        </View>
      </View>
      <View style={styles.meetRow}>
        {picks.map((p, i) => (
          <Animated.View
            key={p.id}
            entering={reduceMotion ? FadeIn : FadeIn.delay(i * MOTION_STAGGER.normal * 2).duration(320)}
            exiting={FadeOut.duration(120)}
            style={{ width: tile }}
          >
            <Pressable
              onPress={() => onOpen(p)}
              style={({ pressed }) => [styles.meetCard, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`${p.name}. ${reasonLine(p)}. Open`}
            >
              <Face name={p.name} photo={p.photo} size={tile - SPACE.lg * 2} />
              {/* Pseudonyms are two words; shrink a little rather than clip one. */}
              <Text variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.centre}>
                {p.name}
              </Text>
              <Text variant="caption" numberOfLines={2} style={styles.centre}>
                {reasonLine(p)}
              </Text>
            </Pressable>
          </Animated.View>
        ))}
      </View>
    </View>
  )
})

/** One face in the grid: tap to open, double-tap to like. */
export const GridFace = memo(function GridFace({
  person,
  size,
  index,
  animateIn,
  onOpen,
  onLike,
}: {
  person: RoomPerson
  size: number
  index: number
  animateIn: boolean
  onOpen: (p: RoomPerson) => void
  onLike: (p: RoomPerson) => void
}) {
  const [pop, setPop] = useState(0)
  // Pressed under the finger, like Meet next's cards; the tap gesture has no press style of its own.
  const [pressed, setPressed] = useState(false)
  const reduceMotion = useReducedMotion()
  const likeable = !person.liked && !person.matched && !person.pending

  const single = Gesture.Tap()
    .runOnJS(true)
    .onBegin(() => setPressed(true))
    .onFinalize(() => setPressed(false))
    .onEnd((_e, ok) => ok && onOpen(person))
  const double = Gesture.Tap()
    .numberOfTaps(2)
    .runOnJS(true)
    .onEnd((_e, ok) => {
      if (!ok || !likeable) return
      setPop((n) => n + 1)
      onLike(person)
    })

  return (
    <Animated.View
      entering={
        animateIn && !reduceMotion
          ? FadeIn.delay(Math.min(index, 11) * MOTION_STAGGER.fast).duration(260)
          : undefined
      }
      style={[styles.gridCell, { width: size }]}
    >
      <GestureDetector gesture={Gesture.Exclusive(double, single)}>
        <Animated.View
          accessible
          accessibilityRole="button"
          accessibilityLabel={`${person.name}. ${person.matched ? 'Matched' : reasonLine(person)}`}
          accessibilityHint={likeable ? 'Opens their card. Like is in the actions menu.' : 'Opens their card.'}
          // Like is offered only while it can do something: not once liked,
          // matched, or while a like is still in flight.
          accessibilityActions={likeable ? [{ name: 'activate' }, { name: 'longpress', label: 'Like' }] : [{ name: 'activate' }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'activate') onOpen(person)
            else if (e.nativeEvent.actionName === 'longpress' && likeable) {
              setPop((n) => n + 1)
              onLike(person)
            }
          }}
          style={{
            transform: [{ scale: pressed && !reduceMotion ? PRESSED_SCALE : 1 }],
            transitionProperty: 'transform',
            transitionDuration: 120,
          }}
        >
          <Face name={person.name} photo={person.photo} size={size - SPACE.lg} />
          <HeartPop trigger={pop} size={ICON.lg * 1.5} />
          {person.matched || person.liked ? (
            <View style={styles.badge}>
              <Ionicons
                name={person.matched ? 'chatbubble' : 'heart'}
                size={ICON.sm - 4}
                color={EMBER.textPrimary}
              />
            </View>
          ) : person.insideNow ? (
            <View style={styles.hereDot} />
          ) : null}
        </Animated.View>
      </GestureDetector>
      <Text variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.centre}>
        {person.name}
      </Text>
      <Text variant="caption" numberOfLines={1} style={styles.centre}>
        {person.matched ? 'Matched' : reasonLine(person)}
      </Text>
    </Animated.View>
  )
})

/**
 * Everybody here, as faces — X Spaces' roster, not a column of forms.
 *
 * Three across with one reason each. The old Grid spent a full-width card per
 * person, so a room of 40 was a long scroll of 40 near-identical boxes and the
 * room never *looked* full. A face grid lets you see the crowd.
 *
 * Rendered by the screen's `FlatList` (`numColumns={3}`) rather than mapped
 * here: the roster was virtualised for a measured reason — twenty cards in a
 * ScrollView was one 98ms commit — and faces are cheaper but a busy night is
 * still a hundred of them. This is only the heading.
 */
export function FaceGridHead({ title, count, empty }: { title: string; count: number; empty: boolean }) {
  return (
    <View style={[styles.section, styles.gridHead]}>
      <View style={styles.sectionHead}>
        <Text variant="heading">{title}</Text>
        {count > 0 ? <Text variant="meta">{count}</Text> : null}
      </View>
      {empty ? (
        <Text variant="body" color={EMBER.textSecondary}>
          Nobody else is here yet. People show up as they check in.
        </Text>
      ) : null}
    </View>
  )
}

export function FaceGridMore({ loading, onMore }: { loading: boolean; onMore: () => void }) {
  return (
    <Pressable
      onPress={onMore}
      disabled={loading}
      style={({ pressed }) => [styles.more, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <Text variant="button" color={EMBER.textSecondary}>
        {loading ? 'Loading…' : 'Show more'}
      </Text>
    </Pressable>
  )
}

/** Width of one grid cell for the current window. */
export function useGridCell() {
  const { width } = useWindowDimensions()
  return (width - GUTTER * 2 - SPACE.md * 2) / 3
}

/** The press scale Meet next's cards use (`styles.pressed`). */
const PRESSED_SCALE = 0.97

export const GRID_GAP = SPACE.md
export const GRID_ROW_GAP = SPACE.lg

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: GUTTER,
    gap: SPACE.lg,
  },
  heroText: { flex: 1, gap: SPACE.xs },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  liveDot: {
    width: SPACE.sm,
    height: SPACE.sm,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.success,
  },
  countRow: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.sm, marginTop: SPACE.xs },
  countLabel: { marginBottom: SPACE.xs },
  stackRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginTop: SPACE.xs },
  stack: { flexDirection: 'row', paddingLeft: SPACE.sm },
  stackFace: { marginLeft: -SPACE.sm },
  stackText: { flexShrink: 1 },
  section: { paddingHorizontal: GUTTER, gap: SPACE.md },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xs,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
  },
  tabular: { fontVariant: ['tabular-nums'] },
  meetRow: { flexDirection: 'row', gap: SPACE.md },
  meetCard: {
    alignItems: 'center',
    gap: SPACE.xs,
    padding: SPACE.lg,
    paddingHorizontal: SPACE.sm,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surface,
  },
  centre: { textAlign: 'center', alignSelf: 'stretch' },
  gridCell: { alignItems: 'center', gap: SPACE.xxs },
  gridHead: { marginBottom: SPACE.md },
  badge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: SPACE.xl,
    height: SPACE.xl,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    borderWidth: 2,
    borderColor: EMBER.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hereDot: {
    position: 'absolute',
    right: SPACE.xs,
    bottom: SPACE.xs,
    width: SPACE.md,
    height: SPACE.md,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.success,
    borderWidth: 2,
    borderColor: EMBER.bg,
  },
  more: { alignSelf: 'center', paddingVertical: SPACE.sm },
  pressed: { transform: [{ scale: PRESSED_SCALE }] },
})

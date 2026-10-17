import { memo, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { Easing, FadeIn, FadeOut, withDelay, withSpring, withTiming } from 'react-native-reanimated'

import { COLOR, DURATION, EASING, FONT_FAMILY, ICON, RADIUS, SIZE, SPACE, SPRING, STAGGER } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { hereNowStack, reasonLine, shuffleCountdownLabel, timeHereLabel } from '../../lib/roomMoments'
import type { RoomPerson } from '../../lib/useRoom'
import { Avatar } from '../ds/Avatar'
import type { Face } from '../ds/Facepile'
import { Facepile } from '../ds/Facepile'
import { GridFace } from '../ds/GridFace'
import { MeetNextCard } from '../ds/MeetNextCard'
import { PresenceDot } from '../ds/MonoFamily'
import { RollingNumber } from '../ds/RollingNumber'
import { SectionHeader } from '../ds/SectionHeader'
import { font, minTarget, useBoldText } from '../ds/shared'
import { TimeRing } from '../ds/TimeRing'
import { Icon } from '../ui/Icon'

/** Re-render once a `period`, for labels that age ("12m", "4:12"). */
export function useNow(period: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), period)
    return () => clearInterval(id)
  }, [period])
  return now
}

/** Three columns between the gutters, 12 apart: 110 at 402, 96 at 360 (Flow 4 Room). */
export const GRID_GAP = SPACE.md
export function useGridCell() {
  const { width } = useWindowDimensions()
  return Math.floor((width - SPACE.gutter * 2 - GRID_GAP * 2) / 3)
}

/** A person's face as the room shows it: their photo only if they revealed, else their pseudonym's creature. */
export function faceOf(p: { name: string; photo: string | null }): Face {
  return p.photo ? { kind: 'photo', uri: p.photo } : { kind: 'creature', pseudonym: p.name }
}

/** The hero's stack: six faces, then "+N" (Flow 4 Room). */
const STACK = 6
const RING = 112
const RING_FACE = 72

/**
 * The top of the room (Flow 4 Room, R3-0): the still LIVE dot and "Live", the
 * title, the headcount rolling in Geist Mono with "here now", the stack of
 * faces and "+N" — and your face in the TimeRing, "In the room · 1h 12m".
 *
 * Nothing names an arrival (ROUND3 C1): a name at the moment someone walks in
 * ties them to the door. Arrivals are the count step and the grid (#25); the
 * newest face in the stack wears the white ring for a while.
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
  me: Face
  arrivals: RoomPerson[]
  people: RoomPerson[]
}) {
  const bold = useBoldText()
  const now = useNow(30_000)
  const stack = hereNowStack(arrivals, people, STACK)
  const fresh = stack[0]?.arrivedAt && now - Date.parse(stack[0].arrivedAt) < 5 * 60_000 && arrivals.some((a) => a.id === stack[0].id)
  const time = checkedInAt ? timeHereLabel(checkedInAt, now) : null
  const others = Math.max(0, hereCount - 1)

  return (
    <View style={styles.hero}>
      <View style={styles.heroText}>
        <View style={styles.liveRow}>
          <PresenceDot kind="live" />
          <Text style={[font('caption', bold), styles.secondary]}>Live</Text>
        </View>
        <Text accessibilityRole="header" numberOfLines={2} maxFontSizeMultiplier={1.3} style={[font('heading', bold), styles.ink]}>
          {title}
        </Text>
        <View style={styles.countRow} accessible accessibilityLabel={`${hereCount} ${hereCount === 1 ? 'person' : 'people'} here now`}>
          <RollingNumber value={hereCount} testID="room-count" />
          <Text style={[font('meta', bold), styles.secondary]}>{hereCount === 1 ? 'here now · just you' : 'here now'}</Text>
        </View>
        {stack.length ? (
          <View style={styles.stack}>
            <Facepile faces={stack.map(faceOf)} total={others} max={STACK} highlight={fresh ? 0 : undefined} testID="room-stack" />
          </View>
        ) : null}
      </View>
      <View accessible accessibilityLabel={time ? `You, in the room ${time}` : 'You'}>
        <TimeRing text={time ? `In the room · ${time}` : 'In the room'} size={RING}>
          <Avatar size={RING_FACE} ring={COLOR.ink} {...me} />
        </TimeRing>
      </View>
    </View>
  )
})

/** #52: the three leave together 8 pt left over `quick`; three new enter 16 pt from the right, 40 ms apart, on `M.settle`. */
const LEAVE_BY = SPACE.sm
const ENTER_FROM = SPACE.lg
const cardOut = () => {
  'worklet'
  return {
    initialValues: { opacity: 1, transform: [{ translateX: 0 }] },
    animations: {
      opacity: withTiming(0, { duration: DURATION.quick, easing: Easing.bezier(...EASING.exit) }),
      transform: [{ translateX: withTiming(-LEAVE_BY, { duration: DURATION.quick, easing: Easing.bezier(...EASING.exit) }) }],
    },
  }
}
const cardIn = (i: number) => () => {
  'worklet'
  const delay = DURATION.quick + i * STAGGER.loose
  return {
    initialValues: { opacity: 0, transform: [{ translateX: ENTER_FROM }] },
    animations: {
      opacity: withDelay(delay, withTiming(1, { duration: DURATION.base })),
      transform: [{ translateX: withDelay(delay, withSpring(0, SPRING.settle)) }],
    },
  }
}

/**
 * Meet next (Flow 4 Room): three MeetNextCards and the shared 15-minute clock
 * in a 32 pt pill. The cards reshuffle together on the clock (#52); the
 * screen holds the old three while a card or sheet is open (`picks` is the
 * caller's). Reduce Motion: a crossfade.
 */
export const MeetNextRow = memo(function MeetNextRow({
  picks,
  nextShuffleAt,
  width,
  onOpen,
}: {
  picks: RoomPerson[]
  nextShuffleAt: number
  width: number
  onOpen: (p: RoomPerson) => void
}) {
  const bold = useBoldText()
  const reduceMotion = useReducedMotion()
  const now = useNow(1000)
  if (picks.length === 0) return null
  const left = shuffleCountdownLabel(nextShuffleAt, now)
  return (
    <View style={styles.section}>
      <SectionHeader
        title="Meet next"
        testID="meet-next-head"
        right={
          <View style={styles.timer} accessible accessibilityLabel={`Shuffles in ${left}`}>
            <Icon name="shuffle" size={ICON.inline} color={COLOR.textSecondary} />
            <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.ink, styles.tabular]}>{left}</Text>
          </View>
        }
      />
      <View style={styles.meetRow}>
        {picks.map((p, i) => (
          <Animated.View
            key={p.id}
            entering={reduceMotion ? FadeIn.duration(DURATION.base) : cardIn(i)}
            exiting={reduceMotion ? FadeOut.duration(DURATION.base) : cardOut}
          >
            <MeetNextCard
              face={faceOf(p)}
              name={p.name}
              reason={p.matched ? 'Matched' : reasonLine(p)}
              width={width}
              liked={p.liked}
              onPress={() => onOpen(p)}
              testID={`meet-next-${i}`}
            />
          </Animated.View>
        ))}
      </View>
    </View>
  )
})

/** One face in "Everyone here": the GridFace, with the double tap's like while a like can do something. */
export const RoomGridFace = memo(function RoomGridFace({
  person,
  width,
  index,
  arriving,
  waveKey,
  onOpen,
  onLike,
}: {
  person: RoomPerson
  width: number
  index: number
  arriving: boolean
  waveKey?: number
  onOpen: (p: RoomPerson) => void
  onLike: ((p: RoomPerson) => void) | null
}) {
  const likeable = !!onLike && !person.liked && !person.matched && !person.pending
  return (
    <GridFace
      face={faceOf(person)}
      name={person.name}
      reason={person.matched ? 'Matched' : reasonLine(person)}
      width={width}
      here={person.insideNow}
      liked={person.liked}
      matched={person.matched}
      onPress={() => onOpen(person)}
      onLike={likeable ? () => onLike?.(person) : undefined}
      arriving={arriving}
      waveKey={waveKey}
      testID={`room-face-${index}`}
    />
  )
})

/** "Everyone here · 14" (or "Everyone who came"), and the empty room's state under it. */
export function EveryoneHead({ title, count }: { title: string; count: number }) {
  return (
    <View style={[styles.section, styles.gridHead]}>
      <SectionHeader title={title} count={count > 0 ? count : undefined} testID="everyone-head" />
    </View>
  )
}

/** "Show 20 more", centred, 700 16 white (Flow 4 Room #04). */
export function ShowMore({ count, loading, onMore }: { count: number | null; loading: boolean; onMore: () => void }) {
  const bold = useBoldText()
  return (
    <Pressable
      onPress={onMore}
      disabled={loading}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: loading }}
      testID="room-show-more"
      style={[styles.more, { minHeight: minTarget() }]}
    >
      <Text style={[font('button', bold), loading ? styles.secondary : styles.ink]}>
        {loading ? 'Loading…' : count ? `Show ${count} more` : 'Show more'}
      </Text>
    </Pressable>
  )
}

/** A Meet next card's height (MeetNextCard). */
const SKELETON_CARD = 164

/** Flow 4 Room #01: the hero, Meet next and the grid as still blocks. Nothing loops. */
export function RoomSkeleton({ topInset }: { topInset: number }) {
  const cell = useGridCell()
  const { width } = useWindowDimensions()
  return (
    <View testID="room-skeleton" accessibilityLabel="Loading the room" style={[styles.skeleton, { paddingTop: topInset }]}>
      <View style={styles.skeletonHero}>
        <View style={[styles.block, { width: width - SPACE.gutter * 2 - RING - SPACE.lg, height: RING + SPACE.sm }]} />
        <View style={[styles.block, styles.round, { width: RING, height: RING }]} />
      </View>
      <View style={[styles.block, { height: SIZE.primary }]} />
      <View style={styles.meetRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.block, { width: cell, height: SKELETON_CARD }]} />
        ))}
      </View>
      <View style={styles.meetRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.skeletonFace, { width: cell }]}>
            <View style={[styles.block, styles.round, { width: cell - SPACE.lg, height: cell - SPACE.lg }]} />
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: SPACE.gutter, gap: SPACE.lg },
  heroText: { flex: 1, minWidth: 0, gap: SPACE.xs, paddingTop: SPACE.xs },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  countRow: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.sm },
  stack: { marginTop: SPACE.xs },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  tabular: { fontVariant: ['tabular-nums'] },
  section: { paddingHorizontal: SPACE.gutter, gap: SPACE.lg },
  gridHead: { marginBottom: SPACE.md },
  timer: {
    height: SIZE.tag,
    paddingLeft: SPACE.sm,
    paddingRight: SPACE.sm + SPACE.xxs,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
  },
  meetRow: { flexDirection: 'row', gap: GRID_GAP },
  more: { alignSelf: 'center', justifyContent: 'center', paddingHorizontal: SPACE.lg },
  skeleton: { paddingHorizontal: SPACE.gutter, gap: SPACE.xl },
  skeletonHero: { flexDirection: 'row', justifyContent: 'space-between' },
  skeletonFace: { alignItems: 'center' },
  block: { borderRadius: RADIUS.rowInCard, backgroundColor: COLOR.surfaceSunken },
  round: { borderRadius: RADIUS.capsule },
})

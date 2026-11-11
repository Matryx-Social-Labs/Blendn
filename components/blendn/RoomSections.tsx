import { memo, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { Easing, FadeIn, FadeOut, withDelay, withSpring, withTiming } from 'react-native-reanimated'

import { COLOR, DURATION, EASING, FONT_FAMILY, ICON, RADIUS, SPACE, SPRING, STAGGER, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { overlapOf } from '../../lib/overlapLine'
import { printable } from '../../lib/pulseSections'
import { reasonLine, shuffleCountdownLabel, timeHereLabel } from '../../lib/roomMoments'
import { compactCount } from '../../lib/format'
import { groupedCount } from '../../lib/friendsHere'
import type { Visibility } from '../ds/Banner'
import { tint } from '../../lib/theme'
import { RadialWash } from '../ui/GradientFill'
import type { RoomPerson } from '../../lib/useRoom'
import { pickReason, type RoomLens } from '../../lib/roomLens'
import { Avatar } from '../ds/Avatar'
import { Facepile, type Face } from '../ds/Facepile'
import { TimeRing } from '../ds/TimeRing'
import ScalePress from '../motion/ScalePress'
import { Icon } from '../ui/Icon'
import { GridFace } from '../ds/GridFace'
import { MeetNextCard } from '../ds/MeetNextCard'
import { SectionHeader } from '../ds/SectionHeader'
import { CONTROL_FONT_CAP, font, minTarget, useBoldText } from '../ds/shared'

/** Re-render once a `period`, for labels that age ("12m", "4:12"). */
export function useNow(period: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), period)
    return () => clearInterval(id)
  }, [period])
  return now
}

/** Three columns between the gutters, 8 apart, rows 16 apart: 109 at 393, 98 at 360 (Flow 5 R-A `grid`, `meetNext`). */
export const GRID_GAP = SPACE.sm
export const GRID_ROW_GAP = SPACE.lg
export function useGridCell() {
  const { width } = useWindowDimensions()
  return Math.floor((width - SPACE.gutter * 2 - GRID_GAP * 2) / 3)
}

/** A person's face as the room shows it: their photo only if they revealed, else their pseudonym's creature. */
export function faceOf(p: { name: string; photo: string | null }): Face {
  return p.photo ? { kind: 'photo', uri: p.photo } : { kind: 'creature', pseudonym: p.name }
}

/** The R-A you-card's light: violet from the top-left corner (`.xme`). */
const YOU_WASH = [{ color: COLOR.brandViolet, alpha: 0.22, at: [0, 0], size: [90, 120], reach: 0.7 }] as const
/** The friends row's height (FriendsHere ROW), so the two rows read as one kind. */
const CREWS_ROW = 60
/** What the others in the room see of you, under the hairline (H-1). The room name itself is drawn bold in the line. */
const SEEN_AS: Record<Visibility, string | null> = {
  anon: null,
  blocked: null,
  named: 'Others here see your name and photo.',
  hidden: 'You’re not listed here. Show online status is off.',
}
const NOBODY_SEES = 'Nobody here sees your name or photo.'
/** H-1: your face in the TimeRing, as the room's hero drew it before C1 (owner, 2026-11-11). */
const YOU_RING = 96
const YOU_RING_FACE = 64
const YOU_PILE = 4
const YOU_PILE_FACE = 24
const YOU_ROOM_FACE = 24

/** "You and 213 others here": compact in the line, exact to a screen reader. */
export function othersHereLine(hereCount: number): { text: string; spoken: string } {
  const others = Math.max(0, hereCount - 1)
  if (others === 0) return { text: 'Just you so far', spoken: 'Just you so far' }
  const word = others === 1 ? 'other' : 'others'
  return { text: `You and ${compactCount(others)} ${word} here`, spoken: `You and ${others.toLocaleString('en-US')} ${word} here` }
}

/**
 * You, at the top of People (audit H-1, owner-picked 2026-11-11): the old hero's best parts and the R-A you-card in one
 * block. Your own photo in the TimeRing ("In the room · 1h 20m") and your name, because the room is yours to see; who else
 * is here as a pile of their faces and "You and 213 others here"; then, under a hairline, what the others see of you and
 * Change (Room settings), or "Turn on" when you are not listed. Nothing here changes what the room shows of you: that line
 * says so. Violet, as everything that is you.
 */
export const RoomYouCard = memo(function RoomYouCard({
  face,
  name,
  self,
  checkedInAt,
  hereCount,
  others,
  now,
  state,
  onChange,
  testID = 'room-you',
}: {
  /** Your face as the room shows it (your creature until you show yourself). */
  face: Face
  /** The name the room knows you by. */
  name: string
  /** You, as only you see yourself here: your name and photo (or your creature when you have no photo). */
  self: { name: string; face: Face }
  checkedInAt: string | null
  hereCount: number
  /** The first few faces of the others here, for the pile. */
  others: Face[]
  /** For tests; the ring ages on its own clock. */
  now?: number
  state: Visibility
  onChange: () => void
  testID?: string
}) {
  const bold = useBoldText()
  const clock = useNow(30_000)
  const time = checkedInAt ? timeHereLabel(checkedInAt, now ?? clock) : ''
  const here = othersHereLine(hereCount)
  const hidden = state === 'hidden'
  const seen = SEEN_AS[state]
  return (
    <View testID={testID} style={styles.you}>
      <RadialWash layers={YOU_WASH} style={StyleSheet.absoluteFill} />
      <View style={styles.youTop}>
        <View accessible accessibilityLabel={time ? `You, in the room ${time}` : 'You, in the room'}>
          <TimeRing text={time ? `In the room · ${time}` : 'In the room'} size={YOU_RING}>
            <Avatar size={YOU_RING_FACE} ring={COLOR.surface} testID={`${testID}-face`} {...self.face} />
          </TimeRing>
        </View>
        <View style={styles.youText}>
          <Text numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE.rowTitle} style={[font('heading', bold), styles.ink]}>
            {self.name}
          </Text>
          <View style={styles.youHere} accessible accessibilityLabel={here.spoken}>
            {others.length && hereCount > 1 ? (
              <Facepile faces={others.slice(0, YOU_PILE)} total={others.length} max={YOU_PILE} size={YOU_PILE_FACE} ring={COLOR.surface} text="" testID={`${testID}-pile`} />
            ) : null}
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.note} style={[font('note', bold), styles.secondary, styles.youHereText]}>
              {here.text}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.youSeen}>
        {hidden ? null : <Avatar size={YOU_ROOM_FACE} {...face} />}
        <View style={styles.youText} accessible accessibilityLabel={seen ?? `Others here see you as ${name}. ${NOBODY_SEES}`}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.note} style={[font('note', bold), styles.secondary]}>
            {seen ?? (
              <>
                Others here see you as <Text style={[font('note', bold, FONT_FAMILY.brand[500]), styles.ink]}>{name}</Text>
              </>
            )}
          </Text>
        </View>
        <Pressable
          onPress={onChange}
          hitSlop={SPACE.md}
          accessibilityRole="button"
          accessibilityLabel={hidden ? 'Turn on Show online status' : 'Change your room name and who sees you'}
          testID={`${testID}-change`}
        >
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.control} style={[font('control', bold, FONT_FAMILY.brand[700]), styles.youChange]}>
            {hidden ? 'Turn on' : 'Change'}
          </Text>
        </Pressable>
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
  onLike,
  lens = null,
}: {
  picks: RoomPerson[]
  /** Flow 5 P-A: the room's lens; a pick says their answer, or what the lens leads with. */
  lens?: RoomLens | null
  nextShuffleAt: number
  width: number
  onOpen: (p: RoomPerson) => void
  /** The card's like; null when a like must ask first, and then the heart opens their card. */
  onLike: ((p: RoomPerson) => void) | null
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
          <Text accessibilityLabel={`New picks in ${left}`} maxFontSizeMultiplier={MAX_FONT_SCALE.note} style={[font('note', bold, FONT_FAMILY.mono[500]), styles.secondary, styles.tabular]}>
            {`New picks in ${left}`}
          </Text>
        }
      />
      <View style={styles.meetRow}>
        {picks.map((p, i) => {
          // P-A: their answer to tonight's question first, else the lens lead; nothing through the lens, the room's line.
          const said = p.matched ? null : pickReason(p, lens, p.tonightAnswer)
          return (
          <Animated.View
            key={p.id}
            entering={reduceMotion ? FadeIn.duration(DURATION.base) : cardIn(i)}
            exiting={reduceMotion ? FadeOut.duration(DURATION.base) : cardOut}
          >
            <MeetNextCard
              face={faceOf(p)}
              name={p.name}
              reason={p.matched ? 'Matched' : (said ?? reasonLine(p))}
              overlap={p.matched || said ? null : overlapOf(p).line}
              width={width}
              liked={p.liked || p.matched}
              onPress={() => onOpen(p)}
              onLike={p.liked || p.matched || p.pending ? undefined : () => (onLike ? onLike(p) : onOpen(p))}
              testID={`meet-next-${i}`}
            />
          </Animated.View>
          )
        })}
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
      overlap={person.matched ? null : overlapOf(person).line}
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

/**
 * "Everyone here" and the room's exact count, "12,480" (R-A `everyoneHead`: the bar is where it is compact). Five and up,
 * as every people count (the owner's floor).
 */
export function EveryoneHead({ title, count }: { title: string; count: number }) {
  const bold = useBoldText()
  const shown = printable(count)
  return (
    <View style={[styles.section, styles.gridHead]}>
      <SectionHeader
        title={title}
        testID="everyone-head"
        right={
          shown == null ? undefined : (
            <Text testID="everyone-head-count" maxFontSizeMultiplier={MAX_FONT_SCALE.note} style={[font('note', bold, FONT_FAMILY.mono[500]), styles.secondary, styles.tabular]}>
              {shown.toLocaleString('en-US')}
            </Text>
          )
        }
      />
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
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.button} style={[font('button', bold), loading ? styles.secondary : styles.ink]}>
        {loading ? 'Loading…' : count ? `Show ${count} more` : 'Show more'}
      </Text>
    </Pressable>
  )
}

/** R-A's blocks: the you-card (84), a Meet next card (206), a grid face (126). */
const SKELETON_YOU = 84
const SKELETON_CARD = 206
/** People's blocks, still while the room loads (Flow 4 Room #01, in R-A's shapes). Nothing loops. */
export function RoomSkeleton({ topInset }: { topInset: number }) {
  const cell = useGridCell()
  return (
    <View accessible testID="room-skeleton" accessibilityLabel="Loading the room" style={[styles.skeleton, { paddingTop: topInset }]}>
      <View style={[styles.block, { height: SKELETON_YOU }]} />
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

/** "3 crews here" (audit A-1): crews open from a row in the list, as friends do, so the room has one tab row. */
export function crewsRowLine(count: number): string {
  return count > 0 ? `${groupedCount(count)} ${count === 1 ? 'crew' : 'crews'} here` : 'Your crews'
}

/**
 * The way into the room's crews and back (audit A-1, owner 2026-11-11), in the friends row's shape: People's row says how
 * many crews are here and opens them; the Crews view's row goes back to everyone. Replaces the People | Crews switch that
 * stacked a second tab row under the bar's.
 */
export function RoomCrewsRow({ count, back = false, onPress }: { count: number; back?: boolean; onPress: () => void }) {
  const bold = useBoldText()
  const line = back ? 'Everyone here' : crewsRowLine(count)
  return (
    <View style={styles.crewsGutter}>
      <ScalePress
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={back ? 'Back to everyone here' : line}
        testID={back ? 'room-crews-back' : 'room-crews-row'}
        style={styles.crewsRow}
      >
        <Icon name={back ? 'chevron-left' : 'users'} size={ICON.control} color={back ? COLOR.textSecondary : COLOR.textPrimary} />
        <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('rowTitle', bold, FONT_FAMILY.brand[500]), styles.crewsLine]}>
          {line}
        </Text>
        {back ? null : <Icon name="chevron-right" size={ICON.control} color={COLOR.textSecondary} />}
      </ScalePress>
    </View>
  )
}

const styles = StyleSheet.create({
  crewsGutter: { paddingHorizontal: SPACE.gutter },
  crewsRow: { height: CREWS_ROW, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.md + SPACE.xxs, borderRadius: RADIUS.tile, backgroundColor: COLOR.surface },
  crewsLine: { flex: 1, minWidth: 0, color: COLOR.textPrimary },
  you: {
    marginHorizontal: SPACE.gutter,
    borderRadius: RADIUS.tile,
    borderWidth: 1,
    borderColor: tint(COLOR.brandViolet, 0.45),
    backgroundColor: COLOR.surface,
    overflow: 'hidden',
  },
  youTop: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md + SPACE.xxs, paddingTop: SPACE.md + SPACE.xxs, paddingBottom: SPACE.md, paddingHorizontal: SPACE.md + SPACE.xxs },
  youText: { flex: 1, minWidth: 0, gap: SPACE.xs },
  youHere: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' },
  youHereText: { flexShrink: 1 },
  youSeen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md - SPACE.xxs,
    paddingTop: SPACE.md - SPACE.xxs,
    paddingBottom: SPACE.md,
    paddingHorizontal: SPACE.md + SPACE.xxs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLOR.hairline,
  },
  youChange: { color: COLOR.selectionVioletGlyph },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  tabular: { fontVariant: ['tabular-nums'] },
  section: { paddingHorizontal: SPACE.gutter, gap: SPACE.md },
  gridHead: { marginBottom: SPACE.md },
  meetRow: { flexDirection: 'row', gap: GRID_GAP },
  more: { alignSelf: 'center', justifyContent: 'center', paddingHorizontal: SPACE.lg },
  skeleton: { paddingHorizontal: SPACE.gutter, gap: SPACE.xl },
  skeletonFace: { alignItems: 'center' },
  block: { borderRadius: RADIUS.rowInCard, backgroundColor: COLOR.surfaceSunken },
  round: { borderRadius: RADIUS.capsule },
})

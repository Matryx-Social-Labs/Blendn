import { BAR_BOTTOM, barCircle, barHeight, barTop } from '../../lib/barGeometry'
import { useBanterPress } from './pressGuard'
import { Image } from 'expo-image'
import type { ReactNode } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, FadeOut, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { COLOR, DURATION, EASING, FONT_FAMILY, ICON, RADIUS, SIZE, SPACE, TYPE } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { OPACITY } from '../../lib/theme'
import { clockTime } from '../../lib/time'
import { Avatar } from '../ds/Avatar'
import { Button } from '../ds/Button'
import { CrewEmblem } from '../ds/CrewEmblem'
import { IconButton } from '../ds/IconButton'
import { Orbs } from '../ds/Orbs'
import { Badge, monoCaption, PresenceDot, ScrimPill, TimeBadge } from '../ds/MonoFamily'
import { RollingNumber } from '../ds/RollingNumber'
import { CONTROL_FONT_CAP, font, useBoldText } from '../ds/shared'
import { Icon, type IconName } from '../ui/Icon'
import { Material } from '../ui/Material'
import { glassContentsIn, glassRiseIn } from '../motion/presence'
import { PhotoScrim } from '../ui/GradientFill'

/** The Banter's rows: 52 pt avatars on a 64 pt row (Flow 5 Banter frames). */
export const ROW_AVATAR = 52
const ROW_HEIGHT = 64
/** A room's or crew's square: 12 pt corners. */
const SQUARE_RADIUS = RADIUS.rowInCard - SPACE.xs
/** A Blend's two emblems, 36 pt, overlapping corner to corner. */
const PAIR = 36
/** The Live now hero: 148 tall, 24 round. */
const HERO_HEIGHT = 148
const REQUEST_FACE = 40
/** A Blend under Live now: an 88 pt card. */
const BLEND_HEIGHT = 88

/**
 * The Banter's glass header (Flow 5 #01–#15, R2-D2 #05): "Banter" in the
 * display face; on the right the bell (Notifications), search, and Mark all
 * read — dimmed when nothing is unread.
 */
export function BanterHeader({
  bell,
  searching,
  onSearch,
  canMarkAll,
  onMarkAll,
}: {
  bell: ReactNode
  searching: boolean
  onSearch: () => void
  canMarkAll: boolean
  onMarkAll: () => void
}) {
  const insets = useSafeAreaInsets()
  const bold = useBoldText()
  const android = Platform.OS === 'android'
  return (
    // The height is the one the list below is laid out from (`banterHeaderHeight`), so it cannot drift from it.
    <Material role="bar" style={[styles.header, { paddingTop: barTop(insets.top), height: banterHeaderHeight(insets.top, android) }]}>
      <Text accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={titleScaleCap(android)} style={[font('display', bold), styles.ink, styles.grow]}>
        Banter
      </Text>
      <View style={styles.actions}>
        {bell}
        <IconButton icon="search" accessibilityLabel="Search conversations" selected={searching} onPress={onSearch} testID="banter-search-toggle" />
        <IconButton icon="check-check" accessibilityLabel="Mark all read" disabled={!canMarkAll} onPress={onMarkAll} testID="banter-mark-all" />
      </View>
    </Material>
  )
}

/** The header's height under the status bar: the frames' 116 on a 402 pt iPhone, 120 on Android's 48 dp circles. */
export const banterHeaderHeight = (insetTop: number, android: boolean) => barHeight(insetTop, android)

/** The title grows with the text size only as far as its line still fits the circle row (40 pt in 44, 48 on Android), so the header's height holds. */
export const titleScaleCap = (android: boolean) => barCircle(android) / TYPE.display.lineHeight

/**
 * The room you're standing in (Flow 5 #03): its cover full-bleed under a
 * scrim, a still Live badge, a rolling "N in the room", the last line — or,
 * when the organiser locked it, that, as a status rather than speech.
 */
export function LiveHero({
  title,
  coverUrl,
  count,
  here = false,
  line,
  unread,
  muted,
  onPress,
  testID,
}: {
  title: string
  coverUrl?: string | null
  count: number
  /** A place's room: "You’re here", never a count (R4-D5 5-3, D-19). */
  here?: boolean
  line: string | null
  unread: number
  muted: boolean
  onPress: () => void
  testID?: string
}) {
  onPress = useBanterPress(onPress)
  const bold = useBoldText()
  const reduceMotion = useReducedMotion()
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, 'live', here ? 'You’re here' : count ? `${count} in the room` : null, unread ? `${unread} new` : null, line].filter(Boolean).join(', ')}
      style={({ pressed }) => [styles.hero, pressed && styles.pressed]}
    >
      {/* No cover is the brand orbs, still, as the Scene and Room info draw it (r7 M6): never a flat grey card. */}
      {coverUrl ? (
        <Image source={{ uri: coverUrl }} recyclingKey={coverUrl} contentFit="cover" style={StyleSheet.absoluteFill} accessible={false} />
      ) : (
        <View testID={testID && `${testID}-orbs`} style={StyleSheet.absoluteFill}>
          <Orbs set="brand" paused />
        </View>
      )}
      <PhotoScrim style={styles.heroScrim} />
      <View style={styles.heroTop}>
        <TimeBadge when="Live" />
        {muted ? (
          <ScrimPill>
            <Icon name="bell-off" size={ICON.inline} />
          </ScrimPill>
        ) : null}
      </View>
      {unread ? (
        <Animated.View style={styles.heroBadge} exiting={leaves(reduceMotion)}>
          <Badge text={`${unread} new`} size={22} />
        </Animated.View>
      ) : null}
      <View style={styles.heroFoot}>
        <View style={styles.grow}>
          <Text numberOfLines={1} style={[font('heading', bold), styles.ink]}>
            {title}
          </Text>
          {line ? (
            <Text numberOfLines={1} style={[font('meta', bold), styles.ink]}>
              {line}
            </Text>
          ) : null}
        </View>
        {here ? (
          <Text style={[font('meta', bold), styles.ink]}>You’re here</Text>
        ) : count ? (
          <View style={styles.heroCount}>
            <RollingNumber value={count} role="title" />
            <Text style={[font('caption', bold), styles.ink]}>in the room</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

/** A Blend open tonight, under Live now (R2-D2 #03): the two sides' emblems, "Open now · closes 4 AM". */
export function BlendLiveCard({
  title,
  seeds,
  closesAt,
  unread,
  onPress,
}: {
  title: string
  seeds: [string | null, string | null]
  closesAt: string | null
  unread: number
  onPress: () => void
}) {
  onPress = useBanterPress(onPress)
  const bold = useBoldText()
  const reduceMotion = useReducedMotion()
  // "4 AM": a Blend's closing hour, the app's one clock.
  const closes = closesAt ? clockTime(closesAt) : null
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, closes ? `open now, closes ${closes}` : 'open now', unread ? `${unread} new` : null].filter(Boolean).join(', ')}
      style={({ pressed }) => [styles.blend, pressed && styles.pressed]}
    >
      <PairEmblem seeds={seeds} ring={COLOR.surface} />
      <View style={styles.grow}>
        <Text numberOfLines={1} style={[font('bodyStrong', bold), styles.ink]}>
          {title}
        </Text>
        <View style={styles.inline}>
          <PresenceDot kind="live" />
          <Text style={[font('meta', bold), styles.secondary]}>
            {closes ? 'Open now · closes ' : 'Open now'}
            {closes ? <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.ink]}>{closes}</Text> : null}
          </Text>
        </View>
      </View>
      {unread ? (
        <Animated.View exiting={leaves(reduceMotion)}>
          <Badge text={`${unread} new`} size={22} />
        </Animated.View>
      ) : null}
    </Pressable>
  )
}


/**
 * A request that needs an answer (Flow 5 #05, R3-0 C11, R2-D2 #02): a solid
 * card, the asker and their note verbatim in two lines, the time, ⋯, then
 * Decline and Accept (or Join, for a crew invite) at 48 — Decline first.
 */
export function RequestCard({
  face,
  name,
  note,
  foot,
  time,
  accept = 'Accept',
  pending = false,
  onAccept,
  onDecline,
  onMore,
  onOpen,
  testID,
}: {
  face: ReactNode
  name: string
  note: string
  /** A quiet line under the answers: what became of one that did not go through. */
  foot?: string
  time: string
  accept?: string
  pending?: boolean
  onAccept: () => void
  onDecline: () => void
  onMore?: () => void
  /** The face and name open their profile. */
  onOpen?: () => void
  testID?: string
}) {
  onAccept = useBanterPress(onAccept)
  onDecline = useBanterPress(onDecline)
  onMore = useBanterPress(onMore)
  onOpen = useBanterPress(onOpen)
  const bold = useBoldText()
  return (
    <View testID={testID} style={styles.request}>
      <View style={styles.requestHead}>
        <Pressable
          onPress={onOpen}
          disabled={!onOpen}
          accessibilityRole={onOpen ? 'button' : 'text'}
          accessibilityLabel={`${name}. ${note}`}
          accessibilityHint={onOpen ? 'Opens their profile' : undefined}
          style={styles.requestWho}
        >
          {face}
          <View style={styles.grow}>
            <Text numberOfLines={1} style={[font('bodyStrong', bold), styles.ink]}>
              {name}
            </Text>
            <Text numberOfLines={2} style={[font('meta', bold), styles.secondary]}>
              {note}
            </Text>
          </View>
        </Pressable>
        <Text style={[monoCaption(bold), styles.tertiary]}>{time}</Text>
        {onMore ? <IconButton icon="ellipsis" accessibilityLabel={`More options for the request from ${name}`} onPress={onMore} testID={testID && `${testID}-more`} /> : null}
      </View>
      <View style={styles.requestActions}>
        <Button
          kind="secondary"
          size="md"
          label="Decline"
          accessibilityLabel={`Decline the ${accept === 'Join' ? 'invite to' : 'request from'} ${name}`}
          disabled={pending}
          onPress={onDecline}
          style={styles.grow}
          testID={testID && `${testID}-decline`}
        />
        {/* Its H.success comes with the server's answer (Flow 5 #05), so no press haptic. */}
        <Button
          kind="lit"
          size="md"
          icon={accept === 'Join' ? 'users' : 'user-check'}
          label={accept}
          accessibilityLabel={accept === 'Join' ? `Join ${name}` : `Accept the request from ${name}`}
          loading={pending}
          pressHaptic={false}
          onPress={onAccept}
          style={styles.grow}
          testID={testID && `${testID}-accept`}
        />
      </View>
      {foot ? <Text style={[font('meta', bold), styles.secondary]}>{foot}</Text> : null}
    </View>
  )
}

/** A request's 40 pt face: a person round, a crew its emblem. */
export function RequestFace({ photo, pseudonym, emblemSeed }: { photo?: string | null; pseudonym?: string; emblemSeed?: string }) {
  if (emblemSeed) {
    return (
      <View style={[styles.square, { width: REQUEST_FACE, height: REQUEST_FACE }]}>
        <CrewEmblem seed={emblemSeed} size={REQUEST_FACE} />
      </View>
    )
  }
  return photo ? <Avatar size={REQUEST_FACE} kind="photo" uri={photo} /> : <Avatar size={REQUEST_FACE} kind="creature" pseudonym={pseudonym ?? 'Someone'} />
}

export type RowFace =
  | { kind: 'person'; photo?: string | null; pseudonym: string }
  | { kind: 'room'; cover?: string | null }
  | { kind: 'crew'; seed: string | null }
  | { kind: 'pair'; seeds: [string | null, string | null] }

/** What line 2 says (precedence: a status chip, then not sent, then a draft, then the last message). */
export type RowLine =
  | { kind: 'text'; text: string }
  | { kind: 'chip'; icon: IconName; text: string; warn?: boolean }
  | { kind: 'failed' }
  | { kind: 'draft'; text: string }

/**
 * A conversation row (Flow 5 #03–#15, R2-D2, R3-D5 5.8): 64 tall, never a
 * hairline. A person is round; a room or a crew is a rounded square. Unread
 * is three changes and a dot, never a height change: the line goes white and
 * medium, the time white, and the dot pops in (#28) into a slot kept for it.
 * Muted is a bell-slash, never the word. Opaque, so a SwipeRow's tray stays
 * under it.
 */
export function BanterRow({
  face,
  title,
  line,
  time,
  unread,
  muted = false,
  onPress,
  accessibilityLabel,
  testID,
}: {
  face: RowFace
  title: string
  line: RowLine
  time: string
  unread: boolean
  muted?: boolean
  /** Its own press; inside a SwipeRow the SwipeRow takes it. */
  onPress?: () => void
  /** Read as one element ("{title}, {line}, {time}, unread"); inside a SwipeRow the SwipeRow is read. */
  accessibilityLabel?: string
  testID?: string
}) {
  onPress = useBanterPress(onPress)
  const bold = useBoldText()
  const reduceMotion = useReducedMotion()
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      accessible={!!accessibilityLabel}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <RowAvatar face={face} />
      <View style={styles.rowText}>
        <View style={styles.inline}>
          <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('bodyStrong', bold), styles.ink, styles.shrink]}>
            {title}
          </Text>
          {muted ? <Icon name="bell-off" size={ICON.inline} color={COLOR.textSecondary} /> : null}
        </View>
        <Line line={line} unread={unread} />
      </View>
      <View style={styles.rowEnd}>
        <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[monoCaption(bold), unread ? styles.ink : styles.tertiary]}>
          {time}
        </Text>
        <View style={styles.dotSlot}>
          {unread ? (
            <Animated.View entering={reduceMotion ? undefined : dotIn} exiting={reduceMotion ? undefined : FadeOut.duration(DURATION.quick)}>
              <PresenceDot kind="unread" />
            </Animated.View>
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}

/** #29: the unread pill leaves as a fade over `quick`; Reduce Motion: it is simply gone. */
const leaves = (reduceMotion: boolean) => (reduceMotion ? undefined : FadeOut.duration(DURATION.quick))

/**
 * DS #28: the unread dot appears 0.8 → 1 with a fade over quick: never from nothing (the stock zoom starts at scale 0). Under Reduce
 * Motion it is simply there.
 */
export const dotIn = () => {
  'worklet'
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.8 }] },
    animations: {
      opacity: withTiming(1, { duration: DURATION.quick }),
      transform: [{ scale: withTiming(1, { duration: DURATION.quick, easing: Easing.bezier(...EASING.snapOut) }) }],
    },
  }
}

/** How a row is read: "{title}, {line}, {time}, unread". */
export function rowLabel(title: string, line: RowLine, time: string, unread: boolean, muted = false) {
  const said = line.kind === 'failed' ? 'Not sent, tap to retry' : line.kind === 'draft' ? `Draft, ${line.text}` : line.text
  return [title, muted ? 'muted' : null, said, time, unread ? 'unread' : null].filter(Boolean).join(', ')
}

function Line({ line, unread }: { line: RowLine; unread: boolean }) {
  const bold = useBoldText()
  if (line.kind === 'chip') {
    return (
      <View style={[styles.chip, line.warn && styles.chipWarn]}>
        <Icon name={line.icon} size={ICON.inline} />
        <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold), styles.ink]}>
          {line.text}
        </Text>
      </View>
    )
  }
  if (line.kind === 'failed') {
    // Never colour alone: the circle-alert says it too (R3-D5 5.8).
    return (
      <View style={styles.inline}>
        <Icon name="circle-alert" size={ICON.inline} color={COLOR.destructive} />
        <Text numberOfLines={1} style={[font('meta', bold), styles.ink]}>
          Not sent · Tap to retry
        </Text>
      </View>
    )
  }
  if (line.kind === 'draft') {
    return (
      <Text numberOfLines={1} style={[font('meta', bold), styles.secondary]}>
        <Text style={font('meta', bold, FONT_FAMILY.brand[500])}>Draft · </Text>
        {line.text}
      </Text>
    )
  }
  return (
    <Text numberOfLines={1} style={[font('meta', bold, unread ? FONT_FAMILY.brand[500] : undefined), unread ? styles.ink : styles.secondary]}>
      {line.text}
    </Text>
  )
}

function RowAvatar({ face }: { face: RowFace }) {
  switch (face.kind) {
    case 'person':
      return face.photo ? <Avatar size={ROW_AVATAR} kind="photo" uri={face.photo} /> : <Avatar size={ROW_AVATAR} kind="creature" pseudonym={face.pseudonym} />
    case 'room':
      return face.cover ? (
        <Image source={{ uri: face.cover }} recyclingKey={face.cover} contentFit="cover" accessible={false} style={styles.squareFace} />
      ) : (
        <View style={[styles.squareFace, styles.centre]}>
          <Icon name="users" size={ICON.control} color={COLOR.textSecondary} />
        </View>
      )
    case 'crew':
      return face.seed ? (
        <View style={styles.squareFace}>
          <CrewEmblem seed={face.seed} size={ROW_AVATAR} />
        </View>
      ) : (
        <View style={[styles.squareFace, styles.centre]}>
          <Icon name="users" size={ICON.control} color={COLOR.textSecondary} />
        </View>
      )
    case 'pair':
      return <PairEmblem seeds={face.seeds} ring={COLOR.ink} />
  }
}

/** A Blend's two sides: yours top left, theirs bottom right, cut out by a 2 pt ring of what's behind. */
function PairEmblem({ seeds, ring }: { seeds: [string | null, string | null]; ring: string }) {
  const one = (seed: string | null, style: object) => (
    <View style={[styles.pairTile, style]}>
      {seed ? <CrewEmblem seed={seed} size={PAIR} /> : <Icon name="users" size={ICON.inline} color={COLOR.textSecondary} />}
    </View>
  )
  return (
    <View style={styles.pair}>
      {one(seeds[0], styles.pairTop)}
      {one(seeds[1], [styles.pairBottom, { borderColor: ring }])}
    </View>
  )
}

/** Loading (Flow 5 #01): four rows at the real geometry — round, square, round, round. Still. */
export function BanterSkeleton() {
  return (
    <View testID="banter-skeleton" accessibilityLabel="Loading your chats">
      {[true, false, true, true].map((round, i) => (
        <View key={i} style={styles.row}>
          <View style={[styles.block, { width: ROW_AVATAR, height: ROW_AVATAR, borderRadius: round ? RADIUS.capsule : SQUARE_RADIUS }]} />
          <View style={styles.skeletonLines}>
            <View style={[styles.block, styles.lineShort]} />
            <View style={[styles.block, styles.lineLong]} />
          </View>
        </View>
      ))}
    </View>
  )
}
const LINE_SHORT = 140
const LINE_LONG = 220

/** #27: a message landed while your finger was down — "↑ New" instead of moving the rows under it. */
export function NewAbovePill({ top, onPress }: { top: number; onPress: () => void }) {
  const bold = useBoldText()
  return (
    <Animated.View entering={glassRiseIn} exiting={FadeOut.duration(DURATION.quick)} style={[styles.newPlace, { top }]}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="New messages above">
        <Material role="control" style={styles.newPill}>
          <Animated.View entering={glassContentsIn} style={styles.newPillContents}>
            <Icon name="arrow-up" size={ICON.inline} />
            <Text style={[font('caption', bold), styles.ink]}>New</Text>
          </Animated.View>
        </Material>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingLeft: SPACE.gutter,
    paddingRight: SPACE.lg,
    paddingBottom: BAR_BOTTOM,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  grow: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  tertiary: { color: COLOR.textTertiary },
  pressed: { opacity: OPACITY.pressed },
  inline: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  centre: { alignItems: 'center', justifyContent: 'center' },
  hero: { height: HERO_HEIGHT, borderRadius: RADIUS.sheet, overflow: 'hidden', backgroundColor: COLOR.ink },
  heroScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '80%' },
  heroTop: { position: 'absolute', left: SPACE.md, top: SPACE.md, flexDirection: 'row', gap: SPACE.xs },
  heroBadge: { position: 'absolute', right: SPACE.lg, top: SPACE.md },
  heroFoot: {
    position: 'absolute',
    left: SPACE.lg,
    right: SPACE.lg,
    bottom: SPACE.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACE.md,
  },
  heroCount: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.xs },
  blend: {
    minHeight: BLEND_HEIGHT,
    borderRadius: RADIUS.sheet,
    backgroundColor: COLOR.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
  },
  request: { borderRadius: RADIUS.sheet, backgroundColor: COLOR.surface, paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg, gap: SPACE.sm },
  requestHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  requestWho: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  requestActions: { flexDirection: 'row', gap: SPACE.sm },
  square: { borderRadius: SPACE.sm + SPACE.xxs, overflow: 'hidden' },
  row: { minHeight: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, backgroundColor: COLOR.ink },
  rowPressed: { backgroundColor: COLOR.surfaceSunken },
  rowText: { flex: 1, minWidth: 0, gap: SPACE.xxs },
  rowEnd: { alignItems: 'flex-end', gap: SPACE.xs },
  dotSlot: { height: SIZE.badge - SPACE.sm, justifyContent: 'center' },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    height: SPACE.xl,
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.surface,
  },
  chipWarn: { backgroundColor: COLOR.warningTint },
  squareFace: { width: ROW_AVATAR, height: ROW_AVATAR, borderRadius: SQUARE_RADIUS, overflow: 'hidden', backgroundColor: COLOR.surface },
  pair: { width: ROW_AVATAR, height: ROW_AVATAR },
  pairTile: {
    position: 'absolute',
    width: PAIR,
    height: PAIR,
    borderRadius: SPACE.sm + SPACE.xxs,
    overflow: 'hidden',
    backgroundColor: COLOR.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pairTop: { left: 0, top: 0 },
  pairBottom: { right: 0, bottom: 0, borderWidth: SPACE.xxs },
  block: { backgroundColor: COLOR.surface, borderRadius: RADIUS.thumb },
  skeletonLines: { flex: 1, gap: SPACE.sm },
  lineShort: { width: LINE_SHORT, height: SPACE.lg },
  lineLong: { width: LINE_LONG, height: SPACE.md + SPACE.xxs },
  newPlace: { position: 'absolute', alignSelf: 'center', zIndex: 3 },
  newPillContents: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  newPill: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, height: SPACE.xxl - SPACE.xs, paddingHorizontal: SPACE.md, borderRadius: RADIUS.capsule },
})

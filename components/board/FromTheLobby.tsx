import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming, Extrapolation, ReduceMotion } from 'react-native-reanimated'

import { font, SELECTION, useBoldText } from '../ds/shared'
import { Icon } from '../ui/Icon'
import { RadialWash, type RadialLayer } from '../ui/GradientFill'
import { cardSettleIn, fadeIn, rowRiseIn } from './boardMotion'
import { apiClient } from '../../lib/apiClient'
import { fromLobbyCard, untilWords, type FromLobbyCard, type FromLobbyOpen, type FromLobbyRow } from '../../lib/lobby'
import { Logger } from '../../lib/logger'
import { useReducedMotion } from '../../lib/motion'
import { COLOR, DURATION, FONT_FAMILY, ICON, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import { tint } from '../../lib/theme'

const ROSE = SELECTION.rose
const EMBER = SELECTION.ember

/** `.ftbar`: the folded card is one 52 pt line. */
const BAR_HEIGHT = 52
/** `.ftr .gl`: the row's glyph disc. */
const GLYPH_DISC = 40
/** `.ftr`: a row is at least 60 tall. */
const ROW_MIN = 60
/** `.ftl .h`: the card's head is 28 tall. */
const HEAD_HEIGHT = 28
/** The rose rim. The board draws it as an inset shadow, outside the layout; a border takes its width from the padding. */
const RIM = 1
/** `.ftr .tx .t`: 500 16/22, the button's size on the row title's leading. */
const ROW_TITLE_LEADING = 22
/** handover.mp4: the fold is 500 ms in-out (card out over the first half, the line in over the second); Reduce Motion crossfades over `base`. */
const FOLD_MS = 500
const FOLD = Easing.bezier(0.65, 0, 0.35, 1)
// design-exception: `.ftl`'s light, rose at 20% from the top-left corner, gone by 70% (lobby.css), and its rim's glow.
const WASH: readonly RadialLayer[] = [{ color: ROSE.edge, alpha: 0.2, at: [0, 0], size: [90, 100], reach: 0.7 }]
const GLOW = [
  {
    offsetX: 0,
    offsetY: 18,
    blurRadius: 50,
    spreadDistance: -24,
    color: tint(ROSE.edge, 0.7),
  },
]

type Summary = { card: FromLobbyCard | null; timeZone: string | null }

/** The event's zone, from the event's own record (cached: the event page and the Lobby read the same). Null if unread. */
const eventZone = (eventId: string) =>
  Promise.resolve()
    .then(() => apiClient.getEvent(eventId))
    .then((r) => (r.success ? ((r.data as { timezone?: string | null } | undefined)?.timezone ?? null) : null))
    .catch(() => null)

/**
 * Read on focus, so the card says what changed while you were in a ride's room or a 1:1. A refusal draws nothing.
 * The summary carries no zone, so the event's is read beside it: "Until" is the event city's day and clock.
 */
function useSummary(eventId: string): Summary | null {
  const [summary, setSummary] = useState<Summary | null>(null)
  useFocusEffect(
    useCallback(() => {
      let gone = false
      Promise.all([apiClient.getBoardSummary(eventId), eventZone(eventId)])
        .then(([r, timeZone]) => !gone && setSummary(r.success && r.data ? { card: fromLobbyCard(r.data), timeZone } : null))
        .catch((error) =>
          Logger.warn('board', 'summary failed', {
            eventId,
            error: String(error),
          })
        )
      return () => {
        gone = true
      }
    }, [eventId])
  )
  return summary
}

function openRow(open: FromLobbyOpen) {
  if (open.kind === 'room') router.push({ pathname: '/chat/[id]', params: { id: open.id } } as never)
  else if (open.kind === 'dm')
    router.push({
      pathname: '/private-chat/[conversationId]',
      params: { conversationId: open.id },
    } as never)
  else router.push('/(tabs)/chat')
}

/**
 * "From the Lobby" (SCRUM-1026, H-A): pinned at the top of an event's room once doors open, what you joined in the
 * Lobby and the host's note. It folds to one line when you scroll the room (`folded`) and opens again on a tap. Nothing
 * at all when the server says there is nothing (4b). Pseudonyms only: every name on it is the server's.
 */
export function FromTheLobby({ eventId, folded, onFold, onUnfold }: { eventId: string; folded: boolean; onFold: () => void; onUnfold: () => void }) {
  const summary = useSummary(eventId)
  const card = summary?.card
  const reduceMotion = useReducedMotion()
  const fold = useSharedValue(folded ? 1 : 0)
  const open = useSharedValue(0)

  useEffect(() => {
    fold.value = withTiming(folded ? 1 : 0, {
      duration: reduceMotion ? DURATION.base : FOLD_MS,
      easing: FOLD,
      reduceMotion: ReduceMotion.Never,
    })
  }, [folded, reduceMotion, fold])

  const measure = useCallback((e: LayoutChangeEvent) => open.set(e.nativeEvent.layout.height), [open])
  // The slot is the card's height, then the line's: the room below gives back what the card gave up.
  const slot = useAnimatedStyle(() => (open.value > 0 ? { height: interpolate(fold.value, [0, 1], [open.value, BAR_HEIGHT]) } : {}))
  const cardFade = useAnimatedStyle(() => ({
    opacity: interpolate(fold.value, [0, 0.5], [1, 0], Extrapolation.CLAMP),
  }))
  const barFade = useAnimatedStyle(() => ({
    opacity: interpolate(fold.value, [0.5, 1], [0, 1], Extrapolation.CLAMP),
  }))

  if (!card) return null
  return (
    <Animated.View testID="from-lobby" entering={reduceMotion ? fadeIn(0) : cardSettleIn} style={[styles.slot, slot]}>
      <Animated.View
        style={cardFade}
        onLayout={measure}
        pointerEvents={folded ? 'none' : 'auto'}
        accessibilityElementsHidden={folded}
        importantForAccessibility={folded ? 'no-hide-descendants' : 'auto'}
      >
        <TheCard card={card} timeZone={summary?.timeZone ?? null} eventId={eventId} rise={!reduceMotion} onFold={onFold} />
      </Animated.View>
      <Animated.View
        style={[styles.barLayer, barFade]}
        pointerEvents={folded ? 'auto' : 'none'}
        accessibilityElementsHidden={!folded}
        importantForAccessibility={folded ? 'auto' : 'no-hide-descendants'}
      >
        <TheBar line={card.bar} onPress={onUnfold} />
      </Animated.View>
    </Animated.View>
  )
}

function TheCard({
  card,
  timeZone,
  eventId,
  rise,
  onFold,
}: {
  card: FromLobbyCard
  timeZone: string | null
  eventId: string
  rise: boolean
  onFold: () => void
}) {
  const bold = useBoldText()
  return (
    <View style={styles.card}>
      <RadialWash layers={WASH} style={StyleSheet.absoluteFill} />
      <Pressable
        onPress={onFold}
        accessibilityRole="button"
        accessibilityLabel="From the Lobby"
        accessibilityHint="Folds it to one line"
        style={styles.head}
        testID="from-lobby-fold"
      >
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.label} style={[font('label', bold), styles.label, styles.flex]}>
          From the Lobby
        </Text>
        <Icon name="chevron-up" size={ICON.inline} color={COLOR.textSecondary} />
      </Pressable>
      {card.rows.map((row, i) => (
        <Animated.View key={row.key} entering={rise ? rowRiseIn(i) : undefined}>
          <Row row={row} last={i === card.rows.length - 1 && !card.readUntil} />
        </Animated.View>
      ))}
      {card.readUntil ? (
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/board/[eventId]',
              params: { eventId },
            } as never)
          }
          accessibilityRole="button"
          style={styles.foot}
          testID="from-lobby-read"
        >
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.control} style={[font('control', bold, FONT_FAMILY.brand[700]), styles.ink]}>
            {card.more > 0 ? `Read the Lobby · ${card.more} more` : 'Read the Lobby'}
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.note} numberOfLines={1} style={[font('note', bold), styles.secondary, styles.until]}>
            Until {untilWords(card.readUntil, timeZone)}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function Row({ row, last }: { row: FromLobbyRow; last: boolean }) {
  const bold = useBoldText()
  const { open } = row
  const body = (
    <>
      <View style={[styles.disc, row.host && styles.hostDisc]} importantForAccessibility="no-hide-descendants">
        <Icon name={row.glyph} size={ICON.control} color={row.host ? EMBER.glyph : ROSE.glyph} />
      </View>
      <View style={[styles.flex, styles.words]}>
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={MAX_FONT_SCALE.rowTitle}
          style={[styles.title, font('button', bold, FONT_FAMILY.brand[500]), styles.titleLine]}
        >
          {row.title}
        </Text>
        <Text numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
          {row.line}
        </Text>
      </View>
      {open ? <Icon name="chevron-right" size={ICON.inline} color={COLOR.textSecondary} /> : null}
    </>
  )
  const style = [styles.row, !last && styles.rule]
  if (!open) {
    return (
      <View style={style} accessible testID={`from-lobby-row-${row.key}`}>
        {body}
      </View>
    )
  }
  return (
    <Pressable onPress={() => openRow(open)} accessibilityRole="button" style={style} testID={`from-lobby-row-${row.key}`}>
      {body}
    </Pressable>
  )
}

function TheBar({ line, onPress }: { line: string; onPress: () => void }) {
  const bold = useBoldText()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`From the Lobby: ${line}`}
      accessibilityHint="Opens it"
      style={styles.bar}
      testID="from-lobby-bar"
    >
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[font('label', bold), styles.label]}>
        From the Lobby
      </Text>
      <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[font('meta', bold), styles.secondary, styles.flex]}>
        {line}
      </Text>
      <Icon name="chevron-down" size={ICON.inline} color={COLOR.textSecondary} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  label: { color: ROSE.glyph },
  title: { color: COLOR.textPrimary },
  titleLine: { lineHeight: ROW_TITLE_LEADING },
  // `.tx`: the meta sits 2 below the title.
  words: { gap: SPACE.xxs },
  slot: {
    marginTop: SPACE.md,
    marginHorizontal: SPACE.lg,
    overflow: 'visible',
  },
  barLayer: { position: 'absolute', left: 0, right: 0, top: 0 },
  // `.ftl`: r24, 12 14 6, a rose rim at 60% and its glow.
  card: {
    borderRadius: RADIUS.sheet,
    backgroundColor: COLOR.surface,
    paddingTop: SPACE.md - RIM,
    paddingHorizontal: SPACE.md + SPACE.xxs - RIM,
    paddingBottom: SPACE.xs + SPACE.xxs - RIM,
    borderWidth: RIM,
    borderColor: tint(ROSE.edge, 0.6),
    boxShadow: GLOW,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    minHeight: HEAD_HEIGHT,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    minHeight: ROW_MIN,
    paddingVertical: SPACE.xs + SPACE.xxs,
  },
  rule: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLOR.hairline,
  },
  disc: {
    width: GLYPH_DISC,
    height: GLYPH_DISC,
    borderRadius: RADIUS.capsule,
    backgroundColor: ROSE.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostDisc: {
    backgroundColor: EMBER.fill,
    borderWidth: 1,
    borderColor: EMBER.edge,
  },
  // Wraps: at the largest text "Until …" takes its own line rather than an ellipsis beside "Read the Lobby · N more".
  foot: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.sm,
    paddingTop: SPACE.sm + SPACE.xxs,
    paddingBottom: SPACE.sm,
  },
  until: { flexShrink: 1, textAlign: 'right' },
  // `.ftbar`: 52 tall, r26, 0 14, 10 apart, the rim without the glow.
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm + SPACE.xxs,
    height: BAR_HEIGHT,
    paddingHorizontal: SPACE.md + SPACE.xxs - RIM,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.surface,
    borderWidth: RIM,
    borderColor: tint(ROSE.edge, 0.6),
  },
})

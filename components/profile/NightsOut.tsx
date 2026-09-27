import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  cubicBezier,
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { NIGHTS_WEEKS, nightsGrid } from '../../lib/meProfile'
import { EMBER, EMBER_RADIUS, ICON, SPACE } from '../../lib/theme'
import ScalePress from '../motion/ScalePress'
import { Text } from '../ui/Text'

/** A day's dot. Small, so twelve weeks fit a phone's width with room between. */
const DOT = 12
/** A day's cell, and the gap between cells. The scrub maths below reads these. */
const CELL_W = DOT + SPACE.sm
const CELL_H = DOT + SPACE.xs
const ROW_GAP = SPACE.xs
/** Where row 0 starts: under the month label and one gap. */
const ROWS_TOP = CELL_H + ROW_GAP

/** Soft ease-out (easeOutCubic, `MOTION_EASING.gentle`): moves early, settles slowly. */
const EASE_OUT = Easing.bezier(0.33, 1, 0.68, 1)
const EASE_OUT_CSS = cubicBezier(0.33, 1, 0.68, 1)
/** A small overshoot for the selected dot: it lands like something set down. */
const POP_CSS = cubicBezier(0.34, 1.56, 0.64, 1)
/** Per column, oldest first: the grid fills in left to right, like time. */
const COLUMN_STAGGER = 45

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function dayLabel(d: Date): string {
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/*
 * Entrances are driven by shared values set in an effect, not by layout
 * `entering` animations. An `entering` animation that is interrupted (the
 * tab frozen mid-way, a remount) can stay stuck on its first frame, and here
 * that frame is opacity 0: the grid simply vanished on a phone. A shared
 * value's timing always runs to its end on the UI thread.
 */
const REVEAL_DELAY = 200
const COLUMN_MS = 460
const REVEAL_MS = REVEAL_DELAY + (NIGHTS_WEEKS - 1) * COLUMN_STAGGER + COLUMN_MS
const gentle = Easing.bezierFn(0.33, 1, 0.68, 1)

/** A week's column. Its dots rise into place (opacity, 0.6 → 1 scale) in its turn, oldest first. */
function Column({
  index,
  reveal,
  children,
}: {
  index: number
  reveal: SharedValue<number>
  children: React.ReactNode
}) {
  const style = useAnimatedStyle(() => {
    const start = REVEAL_DELAY + index * COLUMN_STAGGER
    const t = gentle(Math.min(1, Math.max(0, (reveal.get() - start) / COLUMN_MS)))
    return { opacity: t, transform: [{ scale: 0.6 + 0.4 * t }] }
  })
  return <Animated.View style={[styles.column, style]}>{children}</Animated.View>
}

/**
 * The caption arrives from the side you moved towards: a later night slides
 * in from the right, an earlier one from the left. 16pt and a fade, 320ms.
 * Remounted per night (keyed by the caller), so each mount plays it once.
 */
function SlideIn({
  direction,
  animate,
  children,
}: {
  direction: number
  animate: boolean
  children: React.ReactNode
}) {
  const t = useSharedValue(animate ? 0 : 1)
  useEffect(() => {
    if (animate) t.set(withTiming(1, { duration: 320, easing: EASE_OUT }))
  }, [animate, t])
  const style = useAnimatedStyle(() => ({
    opacity: t.get(),
    transform: [{ translateX: direction * 16 * (1 - t.get()) }],
  }))
  return <Animated.View style={[styles.captionText, style]}>{children}</Animated.View>
}

/**
 * One day. Selecting grows it 1.5× with a small overshoot and whitens it: a
 * CSS transition on the UI thread, so scrubbing across twelve weeks costs one
 * re-render per night landed on, not per frame.
 */
function Dot({ state, selected }: { state: 'empty' | 'went' | 'future'; selected: boolean }) {
  return (
    <Animated.View
      style={[
        styles.dot,
        styles[state],
        selected ? styles.selected : null,
        {
          transitionProperty: ['transform', 'backgroundColor'],
          transitionDuration: [380, 260],
          transitionTimingFunction: [POP_CSS, EASE_OUT_CSS],
        },
      ]}
    />
  )
}

/**
 * Twelve weeks of nights out, one dot a day, with the nights you went filled in.
 *
 * The Outsiders' weekly dot chart, pointed at the one thing Blend'n knows
 * about your social life: which evenings you showed up. Counts nights, not
 * events. There's no streak and no goal. A quiet month is a month, not a debt
 * (the same rule as the "Finish your profile" rows).
 *
 * ## Scrub
 *
 * Tap a week, or drag a finger along the grid, and the selection follows the
 * finger to the nearest night in the week under it, with a selection haptic
 * each time it lands on a new one. The caption below names that night and
 * opens it. The finger's position lives in a shared value and the nearest
 * night is worked out on the UI thread; React hears about it only when the
 * night changes. The most recent night is selected to start with.
 *
 * The drag only claims sideways movement, so a vertical swipe starting on the
 * grid still scrolls the page.
 *
 * ## Motion
 *
 * - Columns rise in left to right when the section first appears.
 * - The selected dot pops to 1.5× with a small overshoot.
 * - The caption slides in from the side you moved towards.
 * - Reduce Motion: all of that goes; selection and the caption just change.
 *
 * Colours come from the neutral table in docs/DESIGN_SYSTEM.md: an empty day is
 * `surface` on the `surfaceSunken` card (one step away), a night out is
 * `textSecondary`, and the selected night is `textPrimary`. No accent.
 *
 * Only rendered when there's at least one night in the window: an empty grid
 * reads as something you failed at.
 */
export function NightsOut({
  events,
  onOpenEvent,
}: {
  /** Past events you attended, newest first (`pastEventRows`). */
  events: { id: string; title: string; start_time: string }[]
  onOpenEvent: (id: string) => void
}) {
  const reduceMotion = useReducedMotion()
  const grid = useMemo(() => nightsGrid(events), [events])
  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events])

  /** Per column, the rows (0 = Monday) with a night out. Plain arrays, so a worklet can read them. */
  const filled = useMemo(
    () => grid.weeks.map((week) => week.flatMap((day, d) => (day.eventIds.length ? [d] : []))),
    [grid]
  )

  const newest = useMemo(() => {
    for (let w = filled.length - 1; w >= 0; w--) {
      const rows = filled[w]
      if (rows.length) return w * 7 + rows[rows.length - 1]
    }
    return -1
  }, [filled])

  const [picked, setPicked] = useState<number | null>(null)
  const [direction, setDirection] = useState(1)
  const selected = picked ?? newest

  const width = useSharedValue(0)
  const hover = useSharedValue(-1)
  // Milliseconds into the entrance; linear, each column eases its own slice.
  const reveal = useSharedValue(reduceMotion ? REVEAL_MS : 0)

  useEffect(() => {
    if (reduceMotion) {
      reveal.set(REVEAL_MS)
      return
    }
    reveal.set(withTiming(REVEAL_MS, { duration: REVEAL_MS, easing: Easing.linear }))
  }, [reduceMotion, reveal])

  const onLayout = (e: LayoutChangeEvent) => width.set(e.nativeEvent.layout.width)

  const select = useCallback(
    (cell: number) => {
      if (cell < 0 || cell === selected) return
      setDirection(cell > selected ? 1 : -1)
      setPicked(cell)
      Haptics.selectionAsync().catch(() => {})
    },
    [selected]
  )

  // The finger's cell, on the UI thread. React hears only when it lands on a new night.
  useAnimatedReaction(
    () => hover.get(),
    (cell, previous) => {
      if (cell >= 0 && cell !== previous) scheduleOnRN(select, cell)
    },
    [select]
  )

  /** The nearest night in the week under (x, y), as `column * 7 + row`, or -1. */
  const cellAt = (x: number, y: number) => {
    'worklet'
    const w = width.get()
    if (w <= CELL_W) return -1
    const pitch = (w - CELL_W) / (NIGHTS_WEEKS - 1)
    const col = Math.min(NIGHTS_WEEKS - 1, Math.max(0, Math.round((x - CELL_W / 2) / pitch)))
    const rows = filled[col]
    if (!rows.length) return -1
    const row = (y - ROWS_TOP - CELL_H / 2) / (CELL_H + ROW_GAP)
    let best = rows[0]
    for (const r of rows) if (Math.abs(r - row) < Math.abs(best - row)) best = r
    return col * 7 + best
  }

  const scrub = Gesture.Pan()
    // Sideways only: a vertical drag belongs to the page's scroll.
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onStart((e) => {
      hover.set(cellAt(e.x, e.y))
    })
    .onUpdate((e) => {
      hover.set(cellAt(e.x, e.y))
    })
    .onFinalize(() => {
      hover.set(-1)
    })

  const tap = Gesture.Tap().onEnd((e) => {
    const cell = cellAt(e.x, e.y)
    if (cell >= 0) scheduleOnRN(select, cell)
  })

  if (!grid.nights || selected < 0) return null

  const sw = Math.floor(selected / 7)
  const sd = selected % 7
  const cell = grid.weeks[sw]?.[sd]
  const first = cell ? byId.get(cell.eventIds[0]) : undefined
  const more = cell ? cell.eventIds.length - 1 : 0

  return (
    <View style={styles.card}>
      <Text variant="meta" color={EMBER.textSecondary} maxFontSizeMultiplier={1.3}>
        {grid.nights} {grid.nights === 1 ? 'night' : 'nights'} out in the last {NIGHTS_WEEKS} weeks
      </Text>

      <GestureDetector gesture={Gesture.Race(scrub, tap)}>
        <View
          style={styles.grid}
          onLayout={onLayout}
          accessibilityHint="Drag across the weeks to move between nights"
        >
          {grid.weeks.map((week, w) => (
            <Column key={w} index={w} reveal={reveal}>
              {/* A fixed slot, so a label never widens its column and knocks the dots out of line. */}
              <View style={styles.monthSlot}>
                {grid.monthLabels[w] ? (
                  <Text
                    variant="caption"
                    color={EMBER.textTertiary}
                    maxFontSizeMultiplier={1}
                    numberOfLines={1}
                    style={styles.month}
                  >
                    {grid.monthLabels[w]}
                  </Text>
                ) : null}
              </View>
              {week.map((day, d) => {
                const went = day.eventIds.length > 0
                const index = w * 7 + d
                const isSelected = selected === index
                return (
                  <View
                    key={d}
                    style={styles.cell}
                    // VoiceOver can't scrub, so each night is its own button.
                    accessible={went}
                    accessibilityRole={went ? 'button' : undefined}
                    accessibilityState={went ? { selected: isSelected } : undefined}
                    accessibilityLabel={
                      went
                        ? `${dayLabel(day.date)}: ${day.eventIds
                            .map((id) => byId.get(id)?.title)
                            .filter(Boolean)
                            .join(', ')}`
                        : undefined
                    }
                    onAccessibilityTap={went ? () => select(index) : undefined}
                  >
                    <Dot state={day.future ? 'future' : went ? 'went' : 'empty'} selected={isSelected} />
                  </View>
                )
              })}
            </Column>
          ))}
        </View>
      </GestureDetector>

      {cell && first ? (
        <ScalePress
          onPress={() => onOpenEvent(first.id)}
          haptic={false}
          pressedScale={0.98}
          accessibilityRole="button"
          accessibilityLabel={`${first.title}, ${dayLabel(cell.date)}`}
          accessibilityHint="Opens the event"
          style={styles.caption}
        >
          {/* Keyed on the night, so each new one slides in rather than swapping in place. */}
          <SlideIn key={selected} direction={direction} animate={!reduceMotion && picked !== null}>
            <Text variant="label" color={EMBER.textSecondary} maxFontSizeMultiplier={1.3}>
              {dayLabel(cell.date).toUpperCase()}
            </Text>
            <Text variant="bodyStrong" numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {first.title}
              {more > 0 ? <Text variant="body" color={EMBER.textSecondary}>{`  +${more} more`}</Text> : null}
            </Text>
          </SlideIn>
          <Ionicons name="chevron-forward" size={ICON.sm} color={EMBER.textSecondary} />
        </ScalePress>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: SPACE.lg,
    padding: SPACE.lg,
    borderRadius: EMBER_RADIUS.lg,
    backgroundColor: EMBER.surfaceSunken,
  },
  grid: { flexDirection: 'row', justifyContent: 'space-between' },
  column: { alignItems: 'center', gap: ROW_GAP },
  monthSlot: { width: CELL_W, height: CELL_H },
  // Wider than its slot on purpose: "SEP" overhangs into the next column, which has no label.
  month: { position: 'absolute', left: 0, width: CELL_W * 3 },
  cell: { width: CELL_W, height: CELL_H, alignItems: 'center', justifyContent: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: EMBER_RADIUS.pill, transform: [{ scale: 1 }] },
  empty: { backgroundColor: EMBER.surface },
  went: { backgroundColor: EMBER.textSecondary },
  future: { backgroundColor: 'transparent' },
  selected: { backgroundColor: EMBER.textPrimary, transform: [{ scale: 1.5 }] },
  caption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingTop: SPACE.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: EMBER.separator,
  },
  captionText: { flex: 1, gap: SPACE.xxs },
})

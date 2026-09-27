import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import React, { useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, { cubicBezier, Easing, ReduceMotion, useReducedMotion, withDelay, withTiming } from 'react-native-reanimated'

import { NIGHTS_WEEKS, nightsGrid } from '../../lib/meProfile'
import { EMBER, EMBER_RADIUS, ICON, SPACE } from '../../lib/theme'
import { fadeInFast } from '../motion/presence'
import ScalePress from '../motion/ScalePress'
import { Text } from '../ui/Text'

/** A day's dot. Small, so twelve weeks fit a phone's width with room between. */
const DOT = 12
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)
/** The same curve, in the form CSS transitions take. */
const EASE_OUT_CSS = cubicBezier(0.23, 1, 0.32, 1)
/** Per column, oldest first: the grid fills in left to right, like time. */
const COLUMN_STAGGER = 24

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function dayLabel(d: Date): string {
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** A column's dots rise into place: opacity and a 0.6 → 1 scale, never from 0. */
function columnIn(index: number) {
  return () => {
    'worklet'
    const t = { duration: 220, easing: EASE_OUT, reduceMotion: ReduceMotion.System }
    const delay = 80 + index * COLUMN_STAGGER
    return {
      initialValues: { opacity: 0, transform: [{ scale: 0.6 }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, t)),
        transform: [{ scale: withDelay(delay, withTiming(1, t)) }],
      },
    }
  }
}

/**
 * One day. Selecting grows it 1.5× and whitens it: a CSS transition on the UI
 * thread, 160ms ease-out, because it's a two-state change with no finger on it.
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
          transitionDuration: 160,
          transitionTimingFunction: EASE_OUT_CSS,
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
 * Tap a filled night to see what it was, and tap that line to open the event.
 * The most recent night is selected to start with, so the line is never empty.
 *
 * Colours come from the neutral table in docs/DESIGN_SYSTEM.md: an empty day is
 * `surface` on the `surfaceSunken` card (one step away), a night out is
 * `textSecondary`, and the selected night is `textPrimary`, grown 1.5×. No
 * accent. The screen's one accent is the "Add a photo" row.
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

  // Newest night first, as `events` is.
  const newest = useMemo(() => {
    for (let w = grid.weeks.length - 1; w >= 0; w--) {
      for (let d = 6; d >= 0; d--) if (grid.weeks[w][d].eventIds.length) return `${w}:${d}`
    }
    return null
  }, [grid])
  const [picked, setPicked] = useState<string | null>(null)
  const selected = picked ?? newest

  if (!grid.nights || !selected) return null

  const [sw, sd] = selected.split(':').map(Number)
  const cell = grid.weeks[sw]?.[sd]
  const first = cell ? byId.get(cell.eventIds[0]) : undefined
  const more = cell ? cell.eventIds.length - 1 : 0

  return (
    <View style={styles.card}>
      <Text variant="meta" color={EMBER.textSecondary} maxFontSizeMultiplier={1.3}>
        {grid.nights} {grid.nights === 1 ? 'night' : 'nights'} out in the last {NIGHTS_WEEKS} weeks
      </Text>

      <View style={styles.grid}>
        {grid.weeks.map((week, w) => (
          <Animated.View key={w} style={styles.column} entering={reduceMotion ? undefined : columnIn(w)}>
            {/* A fixed slot, so a label never widens its column and knocks the dots out of line. */}
            <View style={styles.monthSlot}>
              {grid.monthLabels[w] ? (
                <Text variant="caption" color={EMBER.textTertiary} maxFontSizeMultiplier={1} numberOfLines={1} style={styles.month}>
                  {grid.monthLabels[w]}
                </Text>
              ) : null}
            </View>
            {week.map((day, d) => {
              const went = day.eventIds.length > 0
              const isSelected = selected === `${w}:${d}`
              const dot = <Dot state={day.future ? 'future' : went ? 'went' : 'empty'} selected={isSelected} />
              if (!went) return <View key={d} style={styles.cell}>{dot}</View>
              return (
                <Pressable
                  key={d}
                  style={styles.cell}
                  // The dot is 12pt; the finger gets the whole cell and a little more.
                  hitSlop={SPACE.xs}
                  onPress={() => {
                    if (isSelected) return
                    Haptics.selectionAsync().catch(() => {})
                    setPicked(`${w}:${d}`)
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${dayLabel(day.date)}: ${day.eventIds
                    .map((id) => byId.get(id)?.title)
                    .filter(Boolean)
                    .join(', ')}`}
                >
                  {dot}
                </Pressable>
              )
            })}
          </Animated.View>
        ))}
      </View>

      {cell && first ? (
        <ScalePress
          // Keyed on the night, so a new pick fades in rather than swapping in place.
          key={selected}
          onPress={() => onOpenEvent(first.id)}
          haptic={false}
          pressedScale={0.98}
          accessibilityRole="button"
          accessibilityLabel={`${first.title}, ${dayLabel(cell.date)}`}
          accessibilityHint="Opens the event"
          style={styles.caption}
        >
          <Animated.View entering={fadeInFast} style={styles.captionText}>
            <Text variant="label" color={EMBER.textSecondary} maxFontSizeMultiplier={1.3}>
              {dayLabel(cell.date).toUpperCase()}
            </Text>
            <Text variant="bodyStrong" numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {first.title}
              {more > 0 ? <Text variant="body" color={EMBER.textSecondary}>{`  +${more} more`}</Text> : null}
            </Text>
          </Animated.View>
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
  column: { alignItems: 'center', gap: SPACE.xs },
  monthSlot: { width: DOT + SPACE.sm, height: DOT + SPACE.xs },
  // Wider than its slot on purpose: "SEP" overhangs into the next column, which has no label.
  month: { position: 'absolute', left: 0, width: (DOT + SPACE.sm) * 3 },
  cell: { width: DOT + SPACE.sm, height: DOT + SPACE.xs, alignItems: 'center', justifyContent: 'center' },
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

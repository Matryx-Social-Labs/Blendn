import { useRef } from 'react'
import { FlatList, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'

import { COLOR, FONT_FAMILY, ICON, RADIUS, SPACE } from '../../lib/design/tokens'
import { dayLabel, type EventDays } from '../../lib/eventDays'
import type { ChangeLine } from '../../lib/eventChange'
import { notificationWhen } from '../../lib/notificationRows'
import { CONTROL_FONT_CAP, font, useBoldText, useSelection } from '../ds/shared'
import { SolidBarFade } from '../ui/GradientFill'
import { Icon } from '../ui/Icon'

/** "2 h ago" as it is said: lowercase, in words ("2 hours ago", "just now"). */
export const spokenAge = (ago: string): string =>
  ago
    .toLowerCase()
    .replace(/^(\d+) min ago$/, (_, n) => `${n} ${n === '1' ? 'minute' : 'minutes'} ago`)
    .replace(/^(\d+) h ago$/, (_, n) => `${n} ${n === '1' ? 'hour' : 'hours'} ago`)

/**
 * "Updated · new start time / venue" (Flow 3 · 3.1): a solid line under the hero, one per thing that moved, the old value struck
 * through and the new one in Geist Mono. Read as one sentence ("Updated, new start time. Was 9 PM, now 10 PM"), with how long ago
 * it moved when the server said. No haptic: it is a fact on the page, not an answer to a tap.
 */
export function SceneChangedLines({ lines, changedAt, testID }: { lines: readonly ChangeLine[]; changedAt?: string; testID?: string }) {
  const bold = useBoldText()
  const ago = changedAt ? spokenAge(notificationWhen(changedAt)) : ''
  return (
    <View testID={testID} style={styles.stack}>
      {lines.map((l) => (
        <View
          key={l.key}
          testID={`scene-change-${l.key}`}
          accessible
          accessibilityLabel={`${l.label.replace(' · ', ', ')}. Was ${l.was}, now ${l.now}.${ago ? ` Changed ${ago}.` : ''}`}
          style={styles.line}
        >
          <Icon name="refresh-cw" size={ICON.control} color={COLOR.textPrimary} />
          {/* A sentence to be read, not a control: it grows with the reader's type (the line's 48 is a minimum). */}
          <Text style={[font('meta', bold), styles.text]}>
            <Text style={font('meta', bold, FONT_FAMILY.brand[500])}>{l.label}</Text>
            {'  '}
            <Text style={styles.was}>{l.was}</Text>
            {'  '}
            <Text style={font('meta', bold, FONT_FAMILY.mono[500])}>{l.now}</Text>
          </Text>
        </View>
      ))}
    </View>
  )
}

/** Up to this many days are the frame's equal chips in one row; a longer run scrolls (below). */
const ROW_MAX = 4
/** A scrolling strip draws this many chips at first, and keeps about three screens of them: a screen reader meets only those. */
const STRIP_FIRST = 7
const STRIP_WINDOW = 3

type Chip = { date: string; cancelled: boolean; n: number }

/**
 * The days of a run (Flow 3 · 3.2): "Sat 27 / Day 1" in chips, the day the session is on in the screen's hue (the light, never
 * white), a day called off struck through and labelled so. Not a control: the days are read, not picked.
 *
 * The server lists at most 31 days of a run (`daysFrom` says where its window starts in `dayCount`). Up to four days are the
 * frame's equal row; more are one horizontal list of fixed-width chips that opens a day before the current one, rendered a
 * window at a time so a 120-day run is never 120 stops for a screen reader. `today` says whether that day is today in the event's
 * zone: when it is not, the chip is the next one, and says so.
 */
export function SceneDayStrip({ days, today, testID }: { days: EventDays; today: boolean; testID?: string }) {
  const chips: Chip[] = days.days.map((d, i) => ({ ...d, n: days.daysFrom + i }))
  if (chips.length <= ROW_MAX) {
    return (
      <View testID={testID} style={styles.strip}>
        {chips.map((c) => (
          <DayChip key={c.date} chip={c} days={days} today={today} wide />
        ))}
      </View>
    )
  }
  return <DayRail chips={chips} days={days} today={today} testID={testID} />
}

/**
 * Where a scrolling strip opens: on the day before the current one, at a chip's edge. Near the end of the run the list
 * cannot scroll that far and `initialScrollIndex` clamped to the end, an offset between two chips, so the first chip was cut
 * mid-word (B-S8). The offset is the furthest whole chip the list can reach instead; the right edge's fade takes the cut.
 */
export function dayStripOffset(first: number, count: number, width: number): number {
  const slot = DAY_WIDTH + SPACE.sm
  const reach = Math.max(0, count * slot - SPACE.sm - width)
  return Math.min(first, Math.floor(reach / slot)) * slot
}

function DayRail({ chips, days, today, testID }: { chips: Chip[]; days: EventDays; today: boolean; testID?: string }) {
  const list = useRef<FlatList<Chip>>(null)
  const current = Math.max(0, chips.findIndex((c) => c.n === days.dayNumber))
  const first = Math.max(0, current - 1)
  const slot = DAY_WIDTH + SPACE.sm
  const settle = (e: LayoutChangeEvent) => list.current?.scrollToOffset({ offset: dayStripOffset(first, chips.length, e.nativeEvent.layout.width), animated: false })
  return (
    <View>
      <FlatList
        ref={list}
        testID={testID}
        horizontal
        data={chips}
        keyExtractor={(c) => c.date}
        renderItem={({ item }) => <DayChip chip={item} days={days} today={today} />}
        getItemLayout={(_, index) => ({ length: slot, offset: slot * index, index })}
        initialScrollIndex={first}
        onLayout={settle}
        // A fling lands on a chip's edge, never mid-word.
        snapToInterval={slot}
        decelerationRate="fast"
        initialNumToRender={STRIP_FIRST}
        maxToRenderPerBatch={STRIP_FIRST}
        windowSize={STRIP_WINDOW}
        ItemSeparatorComponent={Gap}
        showsHorizontalScrollIndicator={false}
        accessibilityLabel={`Days ${days.daysFrom} to ${days.daysFrom + chips.length - 1} of ${days.dayCount}`}
      />
      {/* The rails' edge fade (the onboarding prompts rail's): a chip cut by the edge dissolves into the page. */}
      <SolidBarFade testID={testID && `${testID}-fade`} color={COLOR.ink} toward="right" pointerEvents="none" style={styles.fade} />
    </View>
  )
}

const Gap = () => <View style={styles.gap} />

function DayChip({ chip, days, today, wide = false }: { chip: Chip; days: EventDays; today: boolean; wide?: boolean }) {
  const bold = useBoldText()
  const sel = useSelection()
  const now = days.dayNumber === chip.n && !chip.cancelled
  const date = dayLabel(chip.date)
  const where = now ? (today ? ', today' : ', next') : ''
  return (
    <View
      testID={`scene-day-${chip.n}`}
      accessible
      accessibilityLabel={`${date}, ${chip.cancelled ? 'cancelled' : `day ${chip.n} of ${days.dayCount}`}${where}`}
      style={[wide ? styles.dayWide : styles.day, chip.cancelled && styles.called, now && { backgroundColor: sel.fill, borderWidth: 1, borderColor: sel.edge }]}
    >
      <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.ink, chip.cancelled && styles.struck]}>
        {date}
      </Text>
      <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold), styles.sub]}>
        {chip.cancelled ? 'Cancelled' : `Day ${chip.n}`}
      </Text>
    </View>
  )
}

const DAY_WIDTH = 72
const DAY_HEIGHT = 44
const CALLED_OPACITY = 0.6
const LINE_HEIGHT = 48

const styles = StyleSheet.create({
  stack: { gap: SPACE.sm },
  line: { minHeight: LINE_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm, borderRadius: RADIUS.rowInCard, backgroundColor: COLOR.surface },
  text: { flex: 1, color: COLOR.textPrimary },
  was: { color: COLOR.textSecondary, textDecorationLine: 'line-through' },
  strip: { flexDirection: 'row', gap: SPACE.sm },
  day: { width: DAY_WIDTH, minHeight: DAY_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.rowInCard, backgroundColor: COLOR.surface, paddingVertical: SPACE.xs },
  dayWide: { flexGrow: 1, flexBasis: DAY_WIDTH, minHeight: DAY_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.rowInCard, backgroundColor: COLOR.surface, paddingVertical: SPACE.xs },
  gap: { width: SPACE.sm },
  called: { opacity: CALLED_OPACITY },
  ink: { color: COLOR.textPrimary },
  sub: { color: COLOR.textSecondary },
  struck: { textDecorationLine: 'line-through' },
  fade: { position: 'absolute', top: 0, bottom: 0, right: 0, width: SPACE.xxxl },
})

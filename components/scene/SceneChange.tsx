import { StyleSheet, Text, View } from 'react-native'

import { COLOR, FONT_FAMILY, ICON, RADIUS, SPACE } from '../../lib/design/tokens'
import { dayLabel, type EventDays } from '../../lib/eventDays'
import type { ChangeLine } from '../../lib/eventChange'
import { notificationWhen } from '../../lib/notificationRows'
import { CONTROL_FONT_CAP, font, useBoldText, useSelection } from '../ds/shared'
import { Icon } from '../ui/Icon'

/**
 * "Updated · new start time / venue" (Flow 3 · 3.1): a solid line under the hero, one per thing that moved, the old value struck
 * through and the new one in Geist Mono. Read as one sentence ("Updated, new start time. Was 9 PM, now 10 PM"), with how long ago
 * it moved when the server said. No haptic: it is a fact on the page, not an answer to a tap.
 */
export function SceneChangedLines({ lines, changedAt, testID }: { lines: readonly ChangeLine[]; changedAt?: string; testID?: string }) {
  const bold = useBoldText()
  const ago = changedAt ? notificationWhen(changedAt) : ''
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
          <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold), styles.text]}>
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

/**
 * The days of a run (Flow 3 · 3.2): "Sat 27 / Day 1" in equal chips, today's day in the screen's hue (the light, never white), a
 * day called off struck through and labelled so. Not a control: the days are read, not picked.
 */
export function SceneDayStrip({ days, testID }: { days: EventDays; testID?: string }) {
  const bold = useBoldText()
  const sel = useSelection()
  return (
    <View testID={testID} style={styles.strip}>
      {days.days.map((d, i) => {
        const n = i + 1
        const now = days.dayNumber === n && !d.cancelled
        const date = dayLabel(d.date)
        return (
          <View
            key={d.date}
            testID={`scene-day-${n}`}
            accessible
            accessibilityLabel={`${date}, ${d.cancelled ? 'cancelled' : `day ${n} of ${days.days.length}`}${now ? ', today' : ''}`}
            style={[styles.day, d.cancelled && styles.called, now && { backgroundColor: sel.fill, borderWidth: 1, borderColor: sel.edge }]}
          >
            <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.ink, d.cancelled && styles.struck]}>
              {date}
            </Text>
            <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold), styles.sub]}>
              {d.cancelled ? 'Cancelled' : `Day ${n}`}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

/** Flow 3 · 3.2: a day chip is 44 pt tall; a called-off day sits at 60%. */
const DAY_MIN_WIDTH = 72
const DAY_HEIGHT = 44
const CALLED_OPACITY = 0.6
const LINE_HEIGHT = 48

const styles = StyleSheet.create({
  stack: { gap: SPACE.sm },
  line: { minHeight: LINE_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm, borderRadius: RADIUS.rowInCard, backgroundColor: COLOR.surface },
  text: { flex: 1, color: COLOR.textPrimary },
  was: { color: COLOR.textSecondary, textDecorationLine: 'line-through' },
  strip: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  day: { flexGrow: 1, flexBasis: DAY_MIN_WIDTH, minHeight: DAY_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.rowInCard, backgroundColor: COLOR.surface, paddingVertical: SPACE.xs },
  called: { opacity: CALLED_OPACITY },
  ink: { color: COLOR.textPrimary },
  sub: { color: COLOR.textSecondary },
  struck: { textDecorationLine: 'line-through' },
})

import { Image } from 'expo-image'
import { memo } from 'react'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'

import { PresenceDot } from '../ds/MonoFamily'
import { font, PRESSED_WASH, useBoldText } from '../ds/shared'
import { Icon, type IconName } from '../ui/Icon'
import type { BlendnEvent } from '../../lib/api'
import { COLOR, FONT_FAMILY, ICON, MAX_FONT_SCALE, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { liveWindow } from '../../lib/eventSession'
import { reachLabel } from '../../lib/nearby'
import { isLiveNow, printable, PROMOTED_LABEL } from '../../lib/pulseSections'
import { eventClock } from '../../lib/time'
import { splitClock } from './SetList'

/** "From ₹799": a price on sale, whole units in its own currency. */
export const priceText = (p: { minor: number; currency: string }) =>
  `From ${new Intl.NumberFormat('en-US', { style: 'currency', currency: p.currency, maximumFractionDigits: 0 }).format(p.minor / 100)}`

type RowEvent = Pick<BlendnEvent, 'id' | 'title' | 'start_time' | 'end_time' | 'timezone' | 'venue_name' | 'distance' | 'going_count' | 'cover_image_url'> &
  Partial<Pick<BlendnEvent, 'session' | 'promoted' | 'from_price'>> & { here_count?: number | null }

const people = (e: RowEvent, live: boolean): string | null => {
  const here = live ? printable(e.here_count) : null
  if (here) return `${here.toLocaleString('en-US')} here now`
  const going = printable(e.going_count)
  return going ? `${going.toLocaleString('en-US')} going` : null
}

/** The row as one element (board: Promoted, Live, name, time, venue, reach, price, people). */
export function nearbyRowLabel(e: RowEvent, now: number, withDistance: boolean): string {
  const live = isLiveNow(e, now)
  const w = liveWindow(e)
  const when = live ? (w.end_time ? `till ${eventClock(w.end_time, e.timezone)}` : null) : eventClock(w.start_time, e.timezone)
  const parts = [e.title, when, e.venue_name ? `at ${e.venue_name}` : null, withDistance ? reachLabel(e.distance)?.text : null, e.from_price ? priceText(e.from_price) : null, people(e, live)]
  return [e.promoted ? PROMOTED_LABEL : null, live ? 'Live' : null, parts.filter(Boolean).join(', ')].filter(Boolean).join('. ')
}

function Tag({ icon, text, lit = false }: { icon?: IconName; text: string; lit?: boolean }) {
  const bold = useBoldText()
  return (
    <View style={styles.tag}>
      {icon ? <Icon name={icon} size={ICON.inline - 2} color={lit ? COLOR.selectionEmberGlyph : COLOR.textSecondary} /> : null}
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[font('caption', bold), styles.ink]}>
        {text}
      </Text>
    </View>
  )
}

/**
 * One event under a time group (Flow 3b · N1 board `.rrow`): the time leads in Geist Mono (the Pulse's set-list grammar),
 * then a 56 pt photo, the name in two lines, where, and the tags in a fixed order: Promoted, reach, price, people. Live
 * says LIVE and "till 10 PM". A price only when a ticket is on sale; people only from five; no reach without a fix.
 */
function NearbyRowImpl<E extends RowEvent>({
  event,
  now,
  withDistance,
  onPress,
  onPressIn,
}: {
  event: E
  now: number
  withDistance: boolean
  onPress: (event: E) => void
  onPressIn?: (event: E) => void
}) {
  const bold = useBoldText()
  // Largest text (board N1ax): the time moves above the name and the photo goes, so no column squeezes the name.
  const stacked = useWindowDimensions().fontScale >= AX_STACK_SCALE
  const live = isLiveNow(event, now)
  const w = liveWindow(event)
  const { time, meridiem } = splitClock(Date.parse(w.start_time), event.timezone)
  const reach = withDistance ? reachLabel(event.distance) : null
  const who = people(event, live)
  const where = [live && w.end_time ? `till ${eventClock(w.end_time, event.timezone)}` : null, event.venue_name].filter(Boolean).join(' · ')
  return (
    <Pressable
      testID={`nearby-row-${event.id}`}
      onPress={() => onPress(event)}
      onPressIn={onPressIn ? () => onPressIn(event) : undefined}
      android_ripple={{ color: PRESSED_WASH.android }}
      accessibilityRole="button"
      accessibilityLabel={nearbyRowLabel(event, now, withDistance)}
      style={stacked ? styles.stackedRow : styles.row}
    >
      {stacked ? null : (
        <>
          <View testID="nearby-row-time-col" style={styles.timeCol} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {live ? (
              <View style={styles.live}>
                <PresenceDot kind="live" />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE.label} style={[font('label', bold), styles.ink]}>
                  LIVE
                </Text>
              </View>
            ) : (
              <>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE.control} style={[font('control', bold, FONT_FAMILY.mono[700]), styles.ink, styles.tabular, styles.right]}>
                  {time}
                </Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE.label} style={[font('label', bold), styles.secondary, styles.right]}>
                  {meridiem}
                </Text>
              </>
            )}
          </View>
          <View testID="nearby-row-thumb" style={styles.thumb} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {event.cover_image_url ? <Image source={{ uri: event.cover_image_url }} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} /> : null}
          </View>
        </>
      )}
      <View style={styles.text} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {stacked ? (
          <View style={styles.live}>
            {live ? <PresenceDot kind="live" /> : null}
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.control} style={[font('control', bold, FONT_FAMILY.mono[700]), styles.ink, styles.tabular]}>
              {live ? 'LIVE' : eventClock(w.start_time, event.timezone)}
            </Text>
          </View>
        ) : null}
        <Text numberOfLines={stacked ? 3 : 2} maxFontSizeMultiplier={MAX_FONT_SCALE.rowTitle} style={[font('rowTitle', bold), styles.ink]}>
          {event.title}
        </Text>
        {where ? (
          <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
            {where}
          </Text>
        ) : null}
        {event.promoted || reach || event.from_price || who ? (
          <View style={styles.tags}>
            {event.promoted ? <Tag icon="megaphone" text={PROMOTED_LABEL} /> : null}
            {reach ? <Tag icon={reach.kind === 'walk' ? 'footprints' : 'navigation'} text={reach.text} lit={reach.kind === 'walk'} /> : null}
            {event.from_price ? <Tag text={priceText(event.from_price)} /> : null}
            {who ? <Tag text={who} /> : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}
export const NearbyRow = memo(NearbyRowImpl) as typeof NearbyRowImpl

/** A time group's heading (board `.gh`): the words, the count in Geist Mono, and its end on the right ("by 9:10 PM"). */
export function WhenHeading({ title, count, note }: { title: string; count: number | null; note?: string }) {
  const bold = useBoldText()
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={[title, count === null ? null : `${count.toLocaleString('en-US')} ${count === 1 ? 'event' : 'events'}`, note].filter(Boolean).join(', ')}
      style={styles.heading}
    >
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.group} style={[font('group', bold), styles.ink]}>
        {title}
      </Text>
      {count === null ? null : (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.secondary, styles.tabular]}>
          {count.toLocaleString('en-US')}
        </Text>
      )}
      {note ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.note} style={[font('note', bold), styles.secondary, styles.note]}>
          {note}
        </Text>
      ) : null}
    </View>
  )
}

/** Board `.rrow`: a 50 pt time column, a 56 pt photo, 12 between, 10 above and below, 76 tall at least. */
const TIME_COL = 50
const ROW_MIN = 76
/** iOS's first accessibility size (AX1) is ~1.65× and Android's largest 2×: from here the row restacks. */
const AX_STACK_SCALE = 1.6

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md, paddingVertical: SPACE.sm + SPACE.xxs, paddingHorizontal: SPACE.gutter, minHeight: ROW_MIN },
  // Board `.ax` row: 12 above and below, 24 in, the lines 6 apart.
  stackedRow: { paddingVertical: SPACE.md, paddingHorizontal: SPACE.gutter },
  timeCol: { width: TIME_COL, paddingTop: SPACE.xxs, alignItems: 'flex-end' },
  live: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  right: { textAlign: 'right' },
  thumb: { width: SIZE.primary, height: SIZE.primary, borderRadius: RADIUS.thumb, overflow: 'hidden', backgroundColor: COLOR.surface },
  text: { flex: 1, minWidth: 0, gap: SPACE.xxs },
  // Board `.tags` / `.tg`: 6 apart, 4 under the words; each 24 tall, 8 in, on the glass fill.
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs + SPACE.xxs, marginTop: SPACE.xs },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    height: SPACE.xl,
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS.rowInCard - SPACE.xs,
    backgroundColor: COLOR.chipFillOnGlass,
  },
  // Board `.gh`: 24 in, 18 above, 2 below, the words and the count on one baseline, the end on the right.
  heading: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.sm, paddingHorizontal: SPACE.gutter, marginTop: SPACE.lg + SPACE.xxs, marginBottom: SPACE.xxs },
  note: { marginLeft: 'auto' },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  tabular: { fontVariant: ['tabular-nums'] },
})

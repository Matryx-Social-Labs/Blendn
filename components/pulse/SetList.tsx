import { Image } from 'expo-image'
import { memo, useRef, type RefObject } from 'react'
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'

import { measureAnchor } from '../ds/anchor'
import type { Rect } from '../ds/chatShared'
import { font, PRESSED_WASH, useBoldText } from '../ds/shared'
import type { BlendnEvent } from '../../lib/api'
import { COLOR, FONT_FAMILY, RADIUS, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { liveWindow } from '../../lib/eventSession'
import { distanceText } from '../../lib/placesPane'
import { clockTime } from '../../lib/roomMoments'
import { eventClock, zoneSuffix } from '../../lib/time'
import { H } from '../../lib/haptics'
import { printable } from '../../lib/pulseSections'

/**
 * Tonight, as a running order (BUILD-SPEC A4; pulse.html `setlist`): a mono time
 * rail with a NOW tick, one row a slot. Not a card list: the time leads, the
 * rail says "this, then this", and the NOW tick says where the evening is.
 */

/** Row geometry, from the page: time 68 · rail node 22 · thumb 48 · text, with a 10 gap (the page's 12 − 2). */
const TIME_COL = 68
const NODE_COL = 22
const COL_GAP = SPACE.md - SPACE.xxs
const THUMB = 48
const ROW_MIN = 64
const NOW_ROW = 36
const NODE = 9
/** From this font scale the row stacks: the time on its own line above the title, no thumb (the AX frame). */
export const STACK_AT_FONT_SCALE = 1.5

/**
 * "10:00" and "PM", for the time over its meridiem; "PM IST" when the event's zone is not the phone's (the zone-name rule,
 * `eventClock`), so a Berlin phone never reads an IST night's clock as its own (R6-4).
 */
export function splitClock(ms: number, timeZone?: string | null): { time: string; meridiem: string } {
  const zone = timeZone ?? undefined
  const match = /^(\d{1,2})(?::(\d{2}))? (AM|PM)$/.exec(clockTime(ms, zone))
  if (!match) return { time: clockTime(ms, zone), meridiem: '' }
  return { time: `${match[1]}:${match[2] ?? '00'}`, meridiem: `${match[3]}${zoneSuffix(ms, timeZone)}` }
}

/** What a row is read as: "10 PM. Techno in the Tunnel, at Kitty Ko, 2.9 km, 64 going". */
export function setRowLabel(event: BlendnEvent, withDistance: boolean): string {
  const start = Date.parse(liveWindow(event).start_time)
  const going = printable(event.going_count)
  return [
    eventClock(start, event.timezone),
    [event.title, event.venue_name ? `at ${event.venue_name}` : null, withDistance ? distanceText(event.distance) : null, going ? `${going} going` : null]
      .filter(Boolean)
      .join(', '),
  ].join('. ')
}

const QUICK_ACTIONS = [{ name: 'quickActions', label: 'Quick actions' }]

type RowProps = {
  event: BlendnEvent
  /** Distances mean something (a fix, in the city you are in). */
  withDistance: boolean
  stacked: boolean
  onPress: (event: BlendnEvent) => void
  onPressIn?: (event: BlendnEvent) => void
  onLongPress?: (event: BlendnEvent, anchor: Rect) => void
}

const Row = memo(function Row({ event, withDistance, stacked, onPress, onPressIn, onLongPress }: RowProps) {
  const bold = useBoldText()
  const start = Date.parse(liveWindow(event).start_time)
  // The event's own zone (RC drive 5 D-4).
  const { time, meridiem } = splitClock(start, event.timezone)
  const distance = withDistance ? distanceText(event.distance) : null
  const going = printable(event.going_count)
  const box = useRef<View>(null)
  return (
    <Pressable
      ref={box}
      collapsable={false}
      testID={`set-row-${event.id}`}
      onPress={() => onPress(event)}
      onPressIn={onPressIn ? () => onPressIn(event) : undefined}
      onLongPress={
        onLongPress
          ? () => {
              H.longPress()
              measureAnchor(box.current, (anchor) => onLongPress(event, anchor))
            }
          : undefined
      }
      accessibilityActions={onLongPress ? QUICK_ACTIONS : undefined}
      onAccessibilityAction={
        onLongPress
          ? (e) => {
              if (e.nativeEvent.actionName === 'quickActions') measureAnchor(box.current, (anchor) => onLongPress(event, anchor))
            }
          : undefined
      }
      android_ripple={{ color: PRESSED_WASH.android }}
      accessibilityRole="button"
      accessibilityLabel={setRowLabel(event, withDistance)}
      style={({ pressed }) => [styles.row, stacked && styles.rowStacked, pressed && Platform.OS === 'ios' && styles.pressed]}
    >
      {stacked ? null : (
        <View style={styles.timeCol}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold, FONT_FAMILY.mono[700]), styles.ink, styles.tabular, styles.timeText]}>{time}</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.label} style={[font('label', bold), styles.secondary]}>{meridiem}</Text>
        </View>
      )}
      <View style={styles.nodeCol} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={styles.node} />
      </View>
      {stacked ? null : (
        <View style={styles.thumb} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {event.cover_image_url ? <Image source={{ uri: event.cover_image_url }} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} /> : null}
        </View>
      )}
      <View style={styles.text}>
        {stacked ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold, FONT_FAMILY.mono[700]), styles.ink, styles.tabular]}>{`${time} ${meridiem}`}</Text>
        ) : null}
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} numberOfLines={stacked ? undefined : 1} style={[font('bodyStrong', bold), styles.ink]}>
          {event.title}
        </Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} numberOfLines={stacked ? undefined : 1} style={[font('meta', bold), styles.secondary]}>
          {event.venue_name ? `at ${event.venue_name}` : ''}
          {distance ? (
            <>
              {event.venue_name ? ' · ' : ''}
              <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.tabular]}>{distance}</Text>
            </>
          ) : null}
          {going ? (
            <>
              {' · '}
              <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.tabular]}>{going}</Text>
              {' going'}
            </>
          ) : null}
        </Text>
      </View>
    </Pressable>
  )
})

/** The NOW tick: an orange node and "NOW" with the clock; decorative, hidden from a screen reader. */
function NowTick({ clock, stacked }: { clock: string; stacked: boolean }) {
  const bold = useBoldText()
  return (
    <View style={[styles.nowRow, stacked && styles.rowStacked]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden testID="set-now">
      {stacked ? null : (
        <View style={styles.timeCol}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.label} style={[font('label', bold), styles.orange]}>NOW</Text>
        </View>
      )}
      <View style={styles.nodeCol}>
        <View style={[styles.node, styles.nodeNow]} />
      </View>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.label} style={[font('label', bold), styles.orange, styles.nowClock]}>{stacked ? `NOW · ${clock}` : clock}</Text>
    </View>
  )
}

/** The rail runs through the nodes: one hairline from the NOW tick down through the last row. */
export const SetList = memo(function SetList({
  events,
  now,
  withDistance,
  onPress,
  onPressIn,
  onLongPress,
  coachRef,
}: {
  events: BlendnEvent[]
  now: number
  withDistance: boolean
  /** The first row, when it is the first card the page draws: the coach mark's hole. */
  coachRef?: RefObject<View | null>
  onPress: (event: BlendnEvent) => void
  onPressIn?: (event: BlendnEvent) => void
  onLongPress?: (event: BlendnEvent, anchor: Rect) => void
}) {
  const { fontScale } = useWindowDimensions()
  const stacked = fontScale >= STACK_AT_FONT_SCALE
  return (
    <View style={styles.list} testID="set-list">
      <View style={[styles.rail, stacked && styles.railStacked]} pointerEvents="none" />
      <NowTick clock={clockTime(now)} stacked={stacked} />
      {events.map((event, i) => {
        const row = <Row key={event.id} event={event} withDistance={withDistance} stacked={stacked} onPress={onPress} onPressIn={onPressIn} onLongPress={onLongPress} />
        return i === 0 && coachRef ? (
          <View key={event.id} ref={coachRef} collapsable={false}>
            {row}
          </View>
        ) : (
          row
        )
      })}
    </View>
  )
})

/** The rail's x: the node column's centre, past the gutter and the time column. */
const RAIL_X = SPACE.gutter + TIME_COL + COL_GAP + NODE_COL / 2
const RAIL_X_STACKED = SPACE.gutter + NODE_COL / 2

const styles = StyleSheet.create({
  list: { position: 'relative' },
  // The page's rail starts under the NOW node and ends before the last row's foot.
  rail: { position: 'absolute', left: RAIL_X, top: SPACE.sm + SPACE.xxs, bottom: SPACE.xl, width: StyleSheet.hairlineWidth, backgroundColor: COLOR.hairlineStrong },
  railStacked: { left: RAIL_X_STACKED },
  row: { minHeight: ROW_MIN, flexDirection: 'row', alignItems: 'center', columnGap: COL_GAP, paddingHorizontal: SPACE.gutter },
  rowStacked: { alignItems: 'flex-start', paddingVertical: SPACE.sm },
  pressed: { backgroundColor: PRESSED_WASH.ios },
  nowRow: { height: NOW_ROW, flexDirection: 'row', alignItems: 'center', columnGap: COL_GAP, paddingHorizontal: SPACE.gutter },
  timeCol: { width: TIME_COL, alignItems: 'flex-end', justifyContent: 'center' },
  timeText: { textAlign: 'right' },
  nodeCol: { width: NODE_COL, alignItems: 'center', justifyContent: 'center' },
  // The ink ring round the node cuts the rail behind it (the page's 2 pt ink halo).
  node: { width: NODE, height: NODE, borderRadius: RADIUS.capsule, backgroundColor: COLOR.surfaceRaised, borderWidth: SPACE.xxs, borderColor: COLOR.ink },
  nodeNow: { backgroundColor: COLOR.brandOrange },
  thumb: { width: THUMB, height: THUMB, borderRadius: RADIUS.thumb, overflow: 'hidden', backgroundColor: COLOR.surface },
  text: { flex: 1, minWidth: 0 },
  nowClock: { flex: 1 },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  orange: { color: COLOR.brandOrange },
  tabular: { fontVariant: ['tabular-nums'] },
})


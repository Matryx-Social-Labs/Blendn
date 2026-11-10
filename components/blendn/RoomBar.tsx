import { useRef } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, StretchInX } from 'react-native-reanimated'

import { useFocusWhen } from '../../lib/focusReturn'
import { compactCount } from '../../lib/format'
import { COLOR, FONT_FAMILY, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useReducedMotion } from '../../lib/motion'
import { chatTabBadge, chatTabLabel, type RoomTab } from '../../lib/roomTab'
import { IconButton } from '../ds/IconButton'
import { PresenceDot } from '../ds/MonoFamily'
import { font, useBoldText, useIncreaseContrast, useSelection } from '../ds/shared'
import ScalePress from '../motion/ScalePress'
import { Material } from '../ui/Material'

/** The bar's two rows (R-A `roomBar`, 393 × 158 under a 54 pt status bar): the title row and the tabs. */
const TITLE_ROW = 56
const TABS_ROW = 48
/** Between the tab words (R-A `tabs`: People at 24, Chat at 108.7). */
const TAB_GAP = 28
const UNDERLINE = 3
const STRETCH_MS = 300
const FADE_MS = 200
const BADGE = 22

/** Where the bar ends, for what sits under it (the People list's top, the chat's feed). */
export const roomBarHeight = (insetTop: number) => insetTop + TITLE_ROW + TABS_ROW

/**
 * The room's bar (Flow 5 R-A): close · "The room" over the event · the live count in its own slot · Room info, and under
 * them the People | Chat tabs, a tablist. The count is compact in the bar ("12k here") and exact to a screen reader
 * ("12,480 here"). The Chat tab carries the unread badge, 9+ past nine, and says so ("Chat, 9 or more new"). The chosen
 * tab is white over a 3 pt rose underline that stretches in (300 ms; a 200 ms fade under Reduce Motion). The board's glow
 * under it is not drawn: content is flat (`lint:design`), as TitleTabs' underline.
 */
export function RoomBar({
  insetTop,
  event,
  hereCount,
  tab,
  chatUnread,
  onTab,
  onClose,
  onInfo,
}: {
  insetTop: number
  event: string
  hereCount: number
  tab: RoomTab
  chatUnread: number
  onTab: (tab: RoomTab) => void
  onClose: () => void
  onInfo: () => void
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const badge = chatTabBadge(chatUnread)
  // The room's name takes a screen reader's focus as the room comes up, as the hero's title did (Flow 4 Room).
  const titleRef = useRef<View>(null)
  useFocusWhen(titleRef, event)
  return (
    <View testID="room-bar" style={[styles.bar, { paddingTop: insetTop }]}>
      <Material role="bar" style={StyleSheet.absoluteFill} />
      <View testID={contrast ? 'room-bar-contrast' : undefined} style={[styles.hairline, contrast && styles.hairlineStrong]} />
      <View style={styles.titleRow}>
        <IconButton icon="chevron-down" accessibilityLabel="Close the room" onPress={onClose} testID="room-close" />
        <View ref={titleRef} style={styles.titles} accessible accessibilityRole="header" accessibilityLabel={`The room, ${event}`}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.tab} numberOfLines={1} style={[font('group', bold, FONT_FAMILY.brand[700]), styles.ink]}>
            The room
          </Text>
          <Text testID="room-bar-event" maxFontSizeMultiplier={MAX_FONT_SCALE.tab} numberOfLines={1} style={[font('note', bold), styles.secondary]}>
            {event}
          </Text>
        </View>
        <View testID="room-bar-here" style={styles.here} accessible accessibilityLabel={`${hereCount.toLocaleString('en-US')} here`}>
          <PresenceDot kind="live" />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.tab} style={[font('note', bold, FONT_FAMILY.mono[500]), styles.live]}>
            {`${compactCount(hereCount)} here`}
          </Text>
        </View>
        <IconButton icon="ellipsis" accessibilityLabel="Room info" onPress={onInfo} testID="room-info" />
      </View>
      <View testID="room-tabs" accessibilityRole="tablist" style={styles.tabs}>
        <TabWord label="People" spoken="People" on={tab === 'people'} onPress={() => onTab('people')} testID="room-tab-people-word" />
        <TabWord label="Chat" spoken={chatTabLabel(chatUnread)} badge={badge} on={tab === 'chat'} onPress={() => onTab('chat')} testID="room-tab-chat-word" />
      </View>
    </View>
  )
}

function TabWord({ label, spoken, badge, on, onPress, testID }: { label: string; spoken: string; badge?: string | null; on: boolean; onPress: () => void; testID: string }) {
  const bold = useBoldText()
  const sel = useSelection()
  const reduceMotion = useReducedMotion()
  return (
    <ScalePress
      testID={testID}
      haptic={false}
      onPress={() => {
        if (on) return
        H.select()
        onPress()
      }}
      accessibilityRole="tab"
      accessibilityLabel={spoken}
      accessibilityState={{ selected: on }}
      style={styles.tab}
    >
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.tab} numberOfLines={1} style={[font('group', bold, FONT_FAMILY.brand[700]), on ? styles.ink : styles.secondary]}>
        {label}
      </Text>
      {badge ? (
        <View testID={`${testID}-badge`} style={[styles.badge, { backgroundColor: sel.edge }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.tab} style={[font('caption', bold, FONT_FAMILY.mono[700]), styles.ink]}>
            {badge}
          </Text>
        </View>
      ) : null}
      {on ? (
        <Animated.View
          testID={`${testID}-underline`}
          entering={reduceMotion ? FadeIn.duration(FADE_MS) : StretchInX.duration(STRETCH_MS)}
          style={[styles.underline, { backgroundColor: sel.edge }]}
        />
      ) : null}
    </ScalePress>
  )
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: SPACE.lg, overflow: Platform.OS === 'android' ? 'hidden' : 'visible' },
  hairline: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: COLOR.hairline },
  hairlineStrong: { height: 1, backgroundColor: COLOR.hairlineStrong },
  titleRow: { height: TITLE_ROW, flexDirection: 'row', alignItems: 'center', gap: SPACE.md - SPACE.xxs },
  titles: { flex: 1, minWidth: 0 },
  here: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs + SPACE.xxs, flexShrink: 0 },
  tabs: { height: TABS_ROW, flexDirection: 'row', alignItems: 'stretch', gap: TAB_GAP, paddingHorizontal: SPACE.sm },
  tab: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  badge: { minWidth: BADGE, height: BADGE, borderRadius: RADIUS.capsule, paddingHorizontal: SPACE.xs + SPACE.xxs, alignItems: 'center', justifyContent: 'center' },
  underline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: UNDERLINE,
    borderRadius: SPACE.xxs,
  },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  live: { color: COLOR.live, fontVariant: ['tabular-nums'] },
})

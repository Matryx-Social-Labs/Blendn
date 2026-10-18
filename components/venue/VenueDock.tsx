import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button } from '../ds/Button'
import { PresenceDot } from '../ds/MonoFamily'
import { font, IC_HAIRLINE, PRESSED_WASH, useBoldText, useIncreaseContrast } from '../ds/shared'
import { Material } from '../ui/Material'
import type { VenueDetail } from '../../lib/apiClient'
import { COLOR, FONT_FAMILY, MATERIAL, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useSessionTime } from '../../lib/useSessionTime'
import { againLabel, spokenLeft, type DockMode } from '../../lib/venuePage'

/** The live pill is 36 tall (Flow 11 `livePill`); its chips 22 and 24. */
const PILL_HEIGHT = 36
const ENDING_CHIP = 22
const EXTEND_CHIP = 24

/**
 * "● Live · Toit · 32 min": minutes only, stepped once a minute; in the last
 * five minutes mm:ss, a solid Ending chip and an Extend chip; "staying" with
 * Stay. Monochrome even then: the chip carries the warning colour, not the
 * pill. It sits on the dock's glass, so it is a fill, never glass on glass.
 * A leaf: it ticks itself.
 */
function LivePill({ name, live, onZero, onPress }: { name: string; live: VenueDetail['live']; onZero: () => void; onPress: () => void }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const time = useSessionTime(live, onZero)
  const ending = time?.kind === 'ending'
  return (
    <Pressable
      testID="venue-live-pill"
      onPress={() => {
        // The Extend chip's cue: the sheet it opens has Extend ready.
        if (ending) H.primary()
        onPress()
      }}
      android_ripple={{ color: PRESSED_WASH.android }}
      accessibilityRole="button"
      accessibilityLabel={`Live at ${name}${time ? `, ${spokenLeft(time)}` : ''}`}
      accessibilityHint="Opens your live time"
      style={[styles.pill, contrast && IC_HAIRLINE]}
    >
      <PresenceDot kind="live" />
      <Text numberOfLines={1} style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.ink, styles.pillText]}>
        {`Live · ${name}`}
        {time ? (
          <>
            {' · '}
            {time.kind === 'stay' ? (
              'staying'
            ) : (
              <Text style={[font('meta', bold, FONT_FAMILY.mono[ending ? 700 : 500]), styles.tabular]}>{time.kind === 'minutes' ? time.left : time.clock}</Text>
            )}
            {time.kind === 'minutes' ? ' min' : ''}
          </>
        ) : null}
      </Text>
      {ending ? (
        <>
          <View style={styles.endingChip} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text style={[font('caption', bold, FONT_FAMILY.brand[700]), styles.onWhite]}>Ending</Text>
          </View>
          <View style={styles.extendChip} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text style={[font('caption', bold, FONT_FAMILY.brand[700]), styles.onWhite]}>Extend</Text>
          </View>
        </>
      ) : null}
    </Pressable>
  )
}

/**
 * The dock: one slot, by where you are and what the venue answers (Flow 11
 * `venueBoard`, Places.html). Go live; Go live again in one tap with Pick
 * another time under it; the live pill with Open the room and Leave; the
 * hand-off to an event's check-in; or the server's sentence when going live is
 * not possible here. The client never draws a boundary: it asks the server.
 */
export function VenueDock({
  mode,
  name,
  live,
  eventTitle,
  busy,
  onGoLive,
  onPickAnother,
  onOpenRoom,
  onPill,
  onLeave,
  onEvent,
  onZero,
  onHeight,
}: {
  mode: DockMode
  name: string
  live: VenueDetail['live']
  /** The event that has the place, when its title is known. */
  eventTitle: string | null
  busy: boolean
  onGoLive: () => void
  onPickAnother: () => void
  onOpenRoom: () => void
  onPill: () => void
  onLeave: () => void
  onEvent: () => void
  onZero: () => void
  /** The dock's height as laid out: the page scrolls clear of it. */
  onHeight: (height: number) => void
}) {
  const insets = useSafeAreaInsets()
  const contrast = useIncreaseContrast()
  return (
    <Material
      role="bar"
      onLayout={(e) => onHeight(e.nativeEvent.layout.height)}
      testID="venue-dock"
      style={[styles.dock, { paddingBottom: Math.max(insets.bottom, SPACE.lg) }, contrast && IC_HAIRLINE]}
    >
      {mode.kind === 'goLive' ? (
        <>
          <Button
            label={mode.again ? againLabel(mode.again) : 'Go live'}
            kind="primary"
            loading={busy}
            onPress={onGoLive}
            testID="venue-go-live"
          />
          {mode.again ? <Button label="Pick another time" kind="tertiary" size="md" onPress={onPickAnother} disabled={busy} testID="venue-pick-another" /> : null}
        </>
      ) : null}
      {mode.kind === 'live' ? (
        <View style={styles.liveRow}>
          <LivePill name={name} live={live} onZero={onZero} onPress={onPill} />
          {live.chatGroupId ? (
            <Button label="Open the room" kind="secondary" size="md" icon="radio" onGlass onPress={onOpenRoom} style={styles.grow} testID="venue-open-room" />
          ) : (
            <View style={styles.grow} />
          )}
          <Button label="Leave" kind="secondary" size="md" onGlass onPress={onLeave} testID="venue-leave" />
        </View>
      ) : null}
      {mode.kind === 'handoff' ? (
        <Button label={eventTitle ? `Check in to ${eventTitle} instead` : 'Check in to the event'} kind="primary" onPress={onEvent} testID="venue-handoff" />
      ) : null}
      {mode.kind === 'closed' ? (
        <Button label={mode.message} kind="secondary" icon="map-pin-off" onGlass disabled testID="venue-closed" />
      ) : null}
    </Material>
  )
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: SPACE.lg,
    paddingHorizontal: SPACE.gutter,
    gap: SPACE.xs,
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
  },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: SIZE.primary },
  grow: { flex: 1 },
  pill: {
    height: PILL_HEIGHT,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.capsule,
    backgroundColor: MATERIAL.fillOnGlass,
  },
  pillText: { flexShrink: 1 },
  extendChip: { height: EXTEND_CHIP, justifyContent: 'center', paddingHorizontal: SPACE.md, borderRadius: RADIUS.capsule, backgroundColor: COLOR.textPrimary },
  endingChip: { height: ENDING_CHIP, justifyContent: 'center', paddingHorizontal: SPACE.sm, borderRadius: RADIUS.capsule, backgroundColor: COLOR.warning },
  ink: { color: COLOR.textPrimary },
  onWhite: { color: COLOR.ink },
  tabular: { fontVariant: ['tabular-nums'] },
})

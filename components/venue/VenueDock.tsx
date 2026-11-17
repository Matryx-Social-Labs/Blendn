import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button } from '../ds/Button'
import { font, IC_HAIRLINE, useBoldText, useIncreaseContrast } from '../ds/shared'
import { Icon } from '../ui/Icon'
import { Material } from '../ui/Material'
import { useToastDock } from '../toastDock'
import type { VenueDetail } from '../../lib/apiClient'
import { COLOR, ICON, MAX_FONT_SCALE, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useSessionTime } from '../../lib/useSessionTime'
import { againLabel, liveDockLine, venueDockLine, type DockMode } from '../../lib/venuePage'
import { DockRow } from '../ds/DockRow'
import { Swap } from '../motion/Swap'

const ENDING_SAID = 'Your live time is ending. Open it to extend.'

/**
 * While you are live (venue live pill B, owner 2026-11-17, SCRUM-1063): the event page's checked-in line. "● Live ·
 * 2h 45m" over "Extend or stop" on the left, which opens the live sheet (the time, Extend, and Stop with the neutral
 * hold); Open the room on the right. In the last five minutes "● Ending · 4:59" over "Extend". Leaving is the sheet's
 * Stop: there is no Leave button. A leaf: it ticks itself, so the page above does not re-render with the clock.
 */
function LiveLine({ name, live, onZero, onPress, onOpenRoom }: { name: string; live: VenueDetail['live']; onZero: () => void; onPress: () => void; onOpenRoom?: () => void }) {
  const time = useSessionTime(live, onZero)
  const ending = time?.kind === 'ending'
  // The last five minutes are news: said once as they start (both platforms; the line's label ticks, so no live region).
  const wasEnding = useRef(ending)
  useEffect(() => {
    if (ending && !wasEnding.current) AccessibilityInfo.announceForAccessibility(ENDING_SAID)
    wasEnding.current = ending
  }, [ending])
  return (
    <DockRow
      testID="venue-live"
      {...liveDockLine(time, name)}
      subIsLink
      onPressState={() => {
        // The Extend cue: the sheet it opens has Extend ready.
        if (ending) H.primary()
        onPress()
      }}
      stateHint="Opens your live time"
      action={onOpenRoom ? { label: 'Open the room', kind: 'lit', size: 'md', icon: 'radio', onPress: onOpenRoom, testID: 'venue-open-room' } : undefined}
    />
  )
}

/**
 * The dock: one slot, by where you are and what the venue answers (Flow 11
 * `venueBoard`, Places.html). Go live; Go live again in one tap with Pick
 * another time under it; live, the checked-in line with Open the room; the
 * hand-off to an event's check-in; or the server's sentence when going live is
 * not possible here. The client never draws a boundary: it asks the server.
 *
 * Go live stays the gradient primary: it is the dock's one CTA (FIX-ROUND-FINAL D1). When it can't be pressed there is
 * no button at all, disabled or otherwise: a disabled slab can't say why (audit C8). The sentence and its reason do.
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
  /** The live line's state: opens the live sheet. */
  onPill: () => void
  onEvent: () => void
  onZero: () => void
  /** The dock's height as laid out: the page scrolls clear of it. */
  onHeight: (height: number) => void
}) {
  const insets = useSafeAreaInsets()
  const contrast = useIncreaseContrast()
  // The Android snackbar stands above the dock.
  const [height, setHeight] = useState(0)
  const line = (mode.kind === 'goLive' && !mode.again) || mode.kind === 'handoff'
  // The toast adds the bottom inset itself, and this dock's height already holds it.
  useToastDock(Math.max(0, height - insets.bottom))
  return (
    <Material
      role="bar"
      onLayout={(e) => {
        onHeight(e.nativeEvent.layout.height)
        setHeight(e.nativeEvent.layout.height)
      }}
      testID="venue-dock"
      style={[
        styles.dock,
        // Flow 4 V-A: the one-line dock (`.dock4`) is a straight bar, 12 over the row, the home indicator's room under it;
        // a closed place is its note (`.dock4.note`, 16 over). Live keeps the standard dock: venue live pill B is drawn in
        // it (16 over, the 24 gutter both sides) with an md action, which leaves "Ending · 4:59" whole at 360.
        line ? [styles.line, { paddingBottom: Math.max(insets.bottom, SPACE.md) }] : mode.kind === 'closed' ? [styles.line, styles.note, { paddingBottom: Math.max(insets.bottom, SPACE.md) }] : { paddingBottom: Math.max(insets.bottom, SPACE.lg) },
        contrast && IC_HAIRLINE,
      ]}
    >
      {/* A mode is one part: going live, the live row, the hand-off and a closed place fade into each other (motion audit M27). */}
      <Swap id={mode.kind === 'goLive' && mode.again ? 'again' : mode.kind} style={styles.modes}>
        {mode.kind === 'goLive' && !mode.again ? (
          <DockRow
            testID="venue-dock-row"
            {...venueDockLine('goLive')}
            action={{ ...venueDockLine('goLive').action, onPress: onGoLive, loading: busy, pressHaptic: () => H.primary(), testID: 'venue-go-live' }}
          />
        ) : null}
        {mode.kind === 'goLive' && mode.again ? (
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
          // The board's row is 56 (`.dr` min-height), the md action centred in it.
          <View style={styles.liveRow}>
            <LiveLine name={name} live={live} onZero={onZero} onPress={onPill} onOpenRoom={live.chatGroupId ? onOpenRoom : undefined} />
          </View>
        ) : null}
        {mode.kind === 'handoff' ? (
          <DockRow
            testID="venue-dock-row"
            {...venueDockLine('handoff')}
            action={{ ...venueDockLine('handoff').action, onPress: onEvent, accessibilityHint: eventTitle ? `Opens ${eventTitle}` : undefined, testID: 'venue-handoff' }}
          />
        ) : null}
        {mode.kind === 'closed' ? <ClosedLine message={mode.message} reason={mode.reason} /> : null}
      </Swap>
    </Material>
  )
}

/** Why going live is not possible here: one read-out, in full at every size (it is not a control, so it is not capped low). */
function ClosedLine({ message, reason }: { message: string; reason: string | null }) {
  const bold = useBoldText()
  return (
    <View testID="venue-closed" accessible accessibilityLabel={[message, reason].filter(Boolean).join(' ')} style={styles.closed}>
      <Icon name="eye-off" size={ICON.control} color={COLOR.textSecondary} />
      <View style={styles.closedWords}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('group', bold), styles.ink]}>
          {message}
        </Text>
        {reason ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('note', bold), styles.secondary]}>
            {reason}
          </Text>
        ) : null}
      </View>
    </View>
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
  modes: { gap: SPACE.xs },
  liveRow: { minHeight: SIZE.primary, justifyContent: 'center' },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  closed: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  closedWords: { flex: 1 },
  line: { paddingTop: SPACE.md, paddingLeft: SPACE.gutter, paddingRight: SPACE.lg, borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  note: { paddingTop: SPACE.lg, paddingRight: SPACE.gutter },
})

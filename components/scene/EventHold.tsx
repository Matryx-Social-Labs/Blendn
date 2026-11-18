import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { passReachLine, type PassReach } from '../../lib/attendanceState'
import { CHECKING_OUT_LABEL, CHECK_OUT_CONSEQUENCE, CHECK_OUT_LABEL, STAY_LABEL, SWITCH_LABEL, checkOutCaption, checkOutQuestion, switchCaption } from '../../lib/switchCopy'
import { COLOR, MAX_FONT_SCALE, SPACE } from '../../lib/design/tokens'
import { Button } from '../ds/Button'
import { HoldToConfirm } from '../ds/HoldToConfirm'
import { Sheet } from '../ds/Sheet'
import { font, useAnnounced, useBoldText, useIncreaseContrast, useLargeText } from '../ds/shared'

export type EventHoldProps = {
  reach: PassReach
  onConfirm: () => void
  /** The request is out: the fill stays full under "Checking you in…". */
  busy: boolean
  /** The server said yes: the fill stays full under "You’re in" while the pour plays. */
  confirmed: boolean
  /** Another room is the one you are in: checking in here takes you out of it (ROUND4 8.3 #06); `leaving` is its title when the poll has it. */
  switching?: boolean
  leaving?: string | null
  /** "With {crew}" under the hold (crews 4-A2), drawn by the caller. */
  chip?: ReactNode
  /** Going or waitlisted, once the doors are open: who is here, and the way off the list (SCRUM-1074, sheet 05). */
  under?: { left: string | null; link: string; onPress: () => void } | null
}

/**
 * The event page's "Blend in" (SCRUM-966): the hold itself, the VenuePass's own, in the dock. Dimmed with one short line when the
 * phone is plainly not at the door (`passReach`, the same rule as the docked pass); the server is the judge otherwise.
 */
export function EventHold({ reach, onConfirm, busy, confirmed, switching = false, leaving = null, chip = null, under = null }: EventHoldProps) {
  const bold = useBoldText()
  const line = passReachLine(reach) ?? (switching ? switchCaption(leaving) : null)
  return (
    <View testID="scene-hold" style={styles.wrap}>
      <HoldToConfirm
        label={switching ? SWITCH_LABEL : 'Hold to Blend’n'}
        srLabel={switching ? 'Switch rooms' : 'Blend’n'}
        consequence={line ?? 'Checks you in. Other people at this event will see you.'}
        onConfirm={onConfirm}
        disabled={reach !== 'open'}
        busy={busy}
        confirmedLabel={confirmed ? 'You’re in' : undefined}
        testID="scene-hold-pill"
      />
      {reach === 'open' || confirmed ? chip : null}
      {line ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} accessibilityElementsHidden importantForAccessibility="no" style={[font('caption', bold), styles.line]}>
          {line}
        </Text>
      ) : null}
      {under && !confirmed ? (
        <View style={styles.under}>
          <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[font('caption', bold), styles.left]}>
            {under.left ?? ''}
          </Text>
          <Button kind="tertiary" size="sm" label={under.link} onPress={under.onPress} testID="scene-hold-leave" />
        </View>
      ) : null}
    </View>
  )
}

const noop = () => {}

const styles = StyleSheet.create({
  wrap: { gap: SPACE.sm },
  line: { color: COLOR.textSecondary, textAlign: 'center' },
  under: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.sm, paddingLeft: SPACE.sm },
  left: { color: COLOR.textSecondary, flex: 1, minWidth: 0 },
  error: { color: COLOR.destructive },
})

export type EventCheckOutSheetProps = {
  visible: boolean
  onClose: () => void
  /** Once it has left the screen: where focus goes back to (the dock's "Check out"). */
  onDismissed?: () => void
  name: string | null
  onConfirm: () => void
  /** Held to the end and the server is answering: the fill stays full, and nothing closes the sheet. */
  busy: boolean
  /** The server said no (or the call failed): said in the line, and the hold drains, ready again. */
  error: string | null
}

/**
 * The way out of the event you are checked into (option A, SCRUM-1035; was the hold under "Open the room", SCRUM-970): the
 * dock's "Check out" opens the app's standard sheet. The event's name is its title; the same deliberate hold
 * checks you out; its line says what it does without naming the event twice (the hint
 * does name it, for a reader). The hold is the neutral one (buttons board C, owner 2026-11-17): leaving is not a yes. A refusal is said in the line, not a toast: a toast is drawn under the sheet's modal.
 * At the accessibility sizes the sentence moves under the hold, so the hold comes straight after the question and is in reach
 * without scrolling (checked-in audit, owner 2026-11-15: at AX XXXL the sentence pushed it below the sheet's cap).
 */
export function EventCheckOutSheet({ visible, onClose, onDismissed, name, onConfirm, busy, error }: EventCheckOutSheetProps) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const below = useLargeText()
  useAnnounced(error)
  return (
    <Sheet
      visible={visible}
      onClose={busy ? noop : onClose}
      onDismissed={onDismissed}
      title={checkOutQuestion(name)}
      body={below ? undefined : CHECK_OUT_CONSEQUENCE}
      actions={[{ label: STAY_LABEL, kind: 'tertiary', onPress: onClose, disabled: busy, testID: 'scene-checkout-cancel' }]}
      testID="scene-checkout"
    >
      <HoldToConfirm
        kind="neutral"
        label={CHECK_OUT_LABEL}
        busyLabel={CHECKING_OUT_LABEL}
        srLabel="Check out"
        consequence={checkOutCaption(name)}
        onConfirm={onConfirm}
        busy={busy}
        refused={!!error}
        testID="scene-checkout-pill"
      />
      {error ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} accessibilityLiveRegion="polite" style={[font('meta', bold), styles.line, styles.error]}>
          {error}
        </Text>
      ) : null}
      {below ? (
        // The Sheet's own body style, drawn where the Sheet would not put it.
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>
          {CHECK_OUT_CONSEQUENCE}
        </Text>
      ) : null}
    </Sheet>
  )
}

import { StyleSheet, Text, View } from 'react-native'

import { passReachLine, type PassReach } from '../../lib/attendanceState'
import { CHECKING_OUT_LABEL, CHECK_OUT_CONSEQUENCE, CHECK_OUT_LABEL, STAY_LABEL, SWITCH_LABEL, checkOutCaption, checkOutQuestion, switchCaption } from '../../lib/switchCopy'
import { COLOR, MAX_FONT_SCALE, SPACE } from '../../lib/design/tokens'
import { HoldToConfirm } from '../ds/HoldToConfirm'
import { Sheet } from '../ds/Sheet'
import { font, useAnnounced, useBoldText } from '../ds/shared'

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
}

/**
 * The event page's "Blend in" (SCRUM-966): the hold itself, the VenuePass's own, in the dock. Dimmed with one short line when the
 * phone is plainly not at the door (`passReach`, the same rule as the docked pass); the server is the judge otherwise.
 */
export function EventHold({ reach, onConfirm, busy, confirmed, switching = false, leaving = null }: EventHoldProps) {
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
      {line ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} accessibilityElementsHidden importantForAccessibility="no" style={[font('caption', bold), styles.line]}>
          {line}
        </Text>
      ) : null}
    </View>
  )
}

const noop = () => {}

const styles = StyleSheet.create({
  wrap: { gap: SPACE.sm },
  line: { color: COLOR.textSecondary, textAlign: 'center' },
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
 * dock's "Check out" opens the app's standard sheet. The event's name is its title; the same deliberate hold, in the DS's
 * quiet kind (`lit`, as GoLiveSheet's), checks you out; its line says what it does without naming the event twice (the hint
 * does name it, for a reader). A refusal is said in the line, not a toast: a toast is drawn under the sheet's modal.
 */
export function EventCheckOutSheet({ visible, onClose, onDismissed, name, onConfirm, busy, error }: EventCheckOutSheetProps) {
  const bold = useBoldText()
  useAnnounced(error)
  return (
    <Sheet
      visible={visible}
      onClose={busy ? noop : onClose}
      onDismissed={onDismissed}
      title={checkOutQuestion(name)}
      body={CHECK_OUT_CONSEQUENCE}
      actions={[{ label: STAY_LABEL, kind: 'tertiary', onPress: onClose, disabled: busy, testID: 'scene-checkout-cancel' }]}
      testID="scene-checkout"
    >
      <HoldToConfirm
        kind="lit"
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
    </Sheet>
  )
}

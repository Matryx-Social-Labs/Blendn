import { StyleSheet, Text, View } from 'react-native'

import { passReachLine, type PassReach } from '../../lib/attendanceState'
import { CHECK_OUT_LABEL, SWITCH_LABEL, checkOutCaption, switchCaption } from '../../lib/switchCopy'
import { COLOR, MAX_FONT_SCALE, SPACE } from '../../lib/design/tokens'
import { HoldToConfirm } from '../ds/HoldToConfirm'
import { font, useBoldText } from '../ds/shared'

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
        label={switching ? SWITCH_LABEL : 'Hold to blend in'}
        srLabel={switching ? 'Switch rooms' : 'Blend in'}
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

const styles = StyleSheet.create({
  wrap: { gap: SPACE.sm },
  line: { color: COLOR.textSecondary, textAlign: 'center' },
})

/**
 * The event you are checked into, from its own page (SCRUM-970): "Open the room" is the dock's primary; this is the quiet way
 * out under it. The same hold as the check-in, saying whose room it takes you out of.
 */
export function EventCheckOut({ name, onConfirm, busy }: { name: string | null; onConfirm: () => void; busy: boolean }) {
  const bold = useBoldText()
  const caption = checkOutCaption(name)
  return (
    <View testID="scene-checkout" style={styles.wrap}>
      <HoldToConfirm label={CHECK_OUT_LABEL} srLabel="Check out" consequence={caption} onConfirm={onConfirm} busy={busy} testID="scene-checkout-pill" />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} accessibilityElementsHidden importantForAccessibility="no" style={[font('caption', bold), styles.line]}>
        {caption}
      </Text>
    </View>
  )
}

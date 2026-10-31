import { StyleSheet, Text, View } from 'react-native'

import { passReachLine, type PassReach } from '../../lib/attendanceState'
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
  /** Another room is the one you are in: checking in here takes you out of it (ROUND4 8.3 #06; the page does not know its name). */
  switching?: boolean
}

/**
 * The event page's "Blend in" (SCRUM-966): the hold itself, the VenuePass's own, in the dock. Dimmed with one short line when the
 * phone is plainly not at the door (`passReach`, the same rule as the docked pass); the server is the judge otherwise.
 */
export function EventHold({ reach, onConfirm, busy, confirmed, switching = false }: EventHoldProps) {
  const bold = useBoldText()
  const line = passReachLine(reach) ?? (switching ? 'You’ll leave your current room' : null)
  return (
    <View testID="scene-hold" style={styles.wrap}>
      <HoldToConfirm
        label={switching ? 'Hold to switch' : 'Hold to blend in'}
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

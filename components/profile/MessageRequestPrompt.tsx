import { StyleSheet, Text, View } from 'react-native'

import { COLOR, SPACE } from '../../lib/design/tokens'
import { Button } from '../ds/Button'
import { font, useBoldText } from '../ds/shared'

/** What the tray says of somebody who has asked to message you (R4.1 6.2 #03): who, in the tray's own words. */
export const requestHeadline = (name: string) => `${name} wants to message you`

/**
 * A message request, opened from their profile (Flow 6 R4.1 6.2 · 03 · 04): who asked, what they wrote verbatim, and the two answers,
 * Decline beside Accept, in the tray where Like and Connect would be. Accept is the page's one primary; its spinner is the "Accepting"
 * frame (04). The outcome's haptic and the move to the chat belong to the screen, on the server's answer.
 */
export function MessageRequestPrompt({
  name,
  note,
  answering,
  onAccept,
  onDecline,
}: {
  name: string
  /** Their note, as they wrote it. Absent when they wrote none. */
  note?: string | null
  answering: 'accept' | 'decline' | null
  onAccept: () => void
  onDecline: () => void
}) {
  const bold = useBoldText()
  const busy = answering !== null
  return (
    <View testID="message-request" style={styles.column}>
      <Text accessibilityRole="header" style={[font('bodyStrong', bold), styles.ink]}>
        {requestHeadline(name)}
      </Text>
      {note ? <Text style={[font('body', bold), styles.note]}>{note}</Text> : null}
      <View style={styles.actions}>
        <Button
          kind="secondary"
          onGlass
          label="Decline"
          accessibilityLabel={`Decline ${name}’s request`}
          onPress={onDecline}
          loading={answering === 'decline'}
          disabled={busy && answering !== 'decline'}
          style={styles.action}
          testID="request-decline"
        />
        <Button
          label="Accept"
          accessibilityLabel={`Accept ${name}’s request`}
          onPress={onAccept}
          loading={answering === 'accept'}
          disabled={busy && answering !== 'accept'}
          style={styles.action}
          testID="request-accept"
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  column: { flex: 1, gap: SPACE.sm },
  ink: { color: COLOR.textPrimary },
  note: { color: COLOR.textSecondary },
  actions: { flexDirection: 'row', gap: SPACE.sm },
  action: { flex: 1 },
})

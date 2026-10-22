import { StyleSheet, Text, View } from 'react-native'

import { COLOR, RADIUS, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { Button } from '../ds/Button'
import { IconButton } from '../ds/IconButton'
import { font, useBoldText } from '../ds/shared'

/**
 * "Bring someone?" (guidelines/flow-16 `bringRow`, Flow 16 · 16.1 entry points): the row the Scene shows once you are
 * going, above the dock's button, because that is the moment somebody most wants to send the night on. WhatsApp first, as
 * a lit pill; the share circle opens the tray.
 *
 * Never after check-in (the Scene does not mount it then). `H.primary` on WhatsApp's press-in, the frame's "on send";
 * `H.select` on the circle, the frame's note for the tray. The row is plain content: the two controls are what a screen
 * reader reaches, each named for the event.
 */
export function BringSomeoneRow({
  eventTitle,
  onWhatsApp,
  onShare,
  testID,
}: {
  eventTitle: string
  onWhatsApp: () => void
  onShare: () => void
  testID?: string
}) {
  const bold = useBoldText()
  return (
    <View testID={testID} style={styles.row}>
      <View style={styles.text}>
        <Text style={[font('bodyStrong', bold), styles.ink]}>Bring someone?</Text>
        <Text style={[font('meta', bold), styles.quiet]}>You’re going. Send the night on.</Text>
      </View>
      <Button
        kind="lit"
        size="sm"
        icon="message-circle"
        label="WhatsApp"
        accessibilityLabel={`WhatsApp, send ${eventTitle}`}
        pressHaptic={H.primary}
        onPress={onWhatsApp}
        style={styles.control}
        testID={testID && `${testID}-whatsapp`}
      />
      <IconButton
        icon="share"
        accessibilityLabel={`Share ${eventTitle}`}
        onPress={() => {
          H.select()
          onShare()
        }}
        testID={testID && `${testID}-share`}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.rowInCard,
    backgroundColor: COLOR.surface,
  },
  text: { flex: 1, flexShrink: 1 },
  // A small button centres on the row with its own alignSelf: its size is its label, never the row's height.
  control: { alignSelf: 'center' },
  ink: { color: COLOR.textPrimary },
  quiet: { color: COLOR.textSecondary },
})

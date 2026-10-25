import { StyleSheet, Text, View } from 'react-native'

import { COLOR, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { Button } from '../ds/Button'
import { IconButton } from '../ds/IconButton'
import { font, useBoldText, useMinMeasure } from '../ds/shared'

/**
 * "Bring someone?" (guidelines/flow-16 `bringRow`, Flow 16 · 16.1 entry points): the row the Scene shows once you are
 * going, above the dock's button, because that is the moment somebody most wants to send the night on. WhatsApp first, as
 * a lit pill; the share circle opens the tray.
 *
 * Never after check-in (the Scene does not mount it then). `H.primary` on WhatsApp's press-in, the frame's "on send";
 * `H.select` on the circle, the frame's note for the tray. The row is plain content: the two controls are what a screen
 * reader reaches, each named for the event.
 *
 * The words and the two controls share a row that wraps: when the words' measure and the controls do not both fit (AX
 * sizes, a 360 dp phone at 1.3), the controls go under the words instead of squeezing them to a letter a line (RC drive 5).
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
  const measure = useMinMeasure('bodyStrong')
  return (
    <View testID={testID} style={styles.row}>
      <View testID={testID && `${testID}-text`} style={[styles.text, measure]}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.ink]}>
          Bring someone?
        </Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.quiet]}>
          You’re going. Send the night on.
        </Text>
      </View>
      <View testID={testID && `${testID}-controls`} style={styles.controls}>
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
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.rowInCard,
    backgroundColor: COLOR.surface,
  },
  text: { flexGrow: 1, flexShrink: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  // A small button centres on the row with its own alignSelf: its size is its label, never the row's height.
  control: { alignSelf: 'center' },
  ink: { color: COLOR.textPrimary },
  quiet: { color: COLOR.textSecondary },
})

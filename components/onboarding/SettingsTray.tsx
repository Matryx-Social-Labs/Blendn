import { Linking } from 'react-native'

import { Sheet } from '../ds/Sheet'
import type { IconName } from '../ui/Icon'

/**
 * "Turn this on in Settings", for a permission the phone will not ask again (Flow 2 notifications 03, location 03), as the
 * design system's Sheet: the glyph, the title, the sentence, Open Settings as its primary and Not now as its text action.
 *
 * The two permission steps raised this as an `Alert` and called `commit()` on the next line, so the next step slid in
 * underneath the alert before anybody had answered it. The step now waits: "Not now" moves on with the refusal recorded,
 * "Open Settings" stays on the step so the button can be tapped again on the way back, and dismissing the sheet is neither:
 * it just closes.
 */
export function SettingsTray({
  visible,
  icon,
  hint,
  onNotNow,
  onClose,
}: {
  visible: boolean
  /** The glyph of what is switched off: a bell, a pin. */
  icon: IconName
  /** Why Blend'n wants it, in a sentence. */
  hint: string
  onNotNow: () => void
  onClose: () => void
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      icon={icon}
      title="Turn this on in Settings"
      body={`${hint} Your phone only asks once, so the switch now lives in Settings.`}
      actions={[
        { label: 'Not now', kind: 'tertiary', onPress: onNotNow },
        {
          label: 'Open Settings',
          kind: 'primary',
          onPress: () => {
            onClose()
            void Linking.openSettings()
          },
        },
      ]}
      testID="settings-tray"
    />
  )
}

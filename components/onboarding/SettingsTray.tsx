import { Linking } from 'react-native'

import ActionTray from '../ActionTray'

/**
 * "Turn this on in Settings", for a permission the phone will not ask again.
 *
 * The two permission steps raised this as an `Alert` and called `commit()` on
 * the next line, so the next step slid in underneath the alert before anybody
 * had answered it. The step now waits: "Not now" moves on with the refusal
 * recorded, "Open Settings" stays on the step so the button can be tapped again
 * on the way back, and dismissing the tray is neither — it just closes.
 */
export function SettingsTray({
  visible,
  hint,
  onNotNow,
  onClose,
}: {
  visible: boolean
  /** Why Blend'n wants it, in a sentence. */
  hint: string
  onNotNow: () => void
  onClose: () => void
}) {
  return (
    <ActionTray
      visible={visible}
      title="Turn this on in Settings"
      message={`${hint}\n\nYour phone only asks once, and it was answered before. You can change it in Settings at any time.`}
      onClose={onClose}
      buttons={[
        { label: 'Not now', variant: 'secondary', onPress: onNotNow },
        {
          label: 'Open Settings',
          variant: 'primary',
          onPress: () => {
            onClose()
            void Linking.openSettings()
          },
        },
      ]}
    />
  )
}

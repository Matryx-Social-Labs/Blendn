import * as Notifications from 'expo-notifications'
import { useState } from 'react'
import { Alert, Linking } from 'react-native'

import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { previousStep } from '../../lib/onboarding'
import { useOnboarding } from '../../lib/useOnboarding'

/**
 * Step two — notifications.
 *
 * A permission screen, which means the button does not grant anything: it opens
 * the OS dialog, and the OS decides. What this screen is actually for is being
 * asked *before* the dialog, so a "no" is a considered answer rather than a
 * reflex against an unexplained prompt — and because iOS only ever shows that
 * dialog once per install. A refusal here is recoverable; a refusal to the
 * system prompt sends the person to Settings.
 *
 * `push_enabled` records the answer either way. Someone who declines has said
 * something, and the profile should say it rather than keep the default.
 */
const SETTINGS_HINT = "Blend'n uses notifications to know when someone nearby wants to connect."

export default function NotificationsScreen() {
  const { saving, commit, skip, goTo } = useOnboarding('notifications')
  const [asking, setAsking] = useState(false)

  const ask = async () => {
    setAsking(true)
    let granted = false
    let canAskAgain = true
    try {
      // Existing permission first: asking again when it is already decided
      // returns the standing answer without a dialog, and calling `request`
      // unconditionally is what produces the "the prompt never appeared" bug
      // reports on a reinstall over an existing grant.
      const existing = await Notifications.getPermissionsAsync()
      canAskAgain = existing.canAskAgain
      granted =
        existing.granted ||
        (existing.canAskAgain && (await Notifications.requestPermissionsAsync()).granted)
    } catch {
      // A permissions call that throws is a broken build, not a refusal. Treat
      // it as "not granted" and carry on rather than stranding the flow. No
      // Settings prompt either — we do not know that Settings is the problem.
      granted = false
      canAskAgain = false
    }
    setAsking(false)

    /*
     * The OS asks once per install, not once per account.
     *
     * Deleting an account and signing up again does not reset it — so someone
     * who declined months ago taps this button and *nothing happens*, which
     * reads as a broken button rather than as a decision they already made.
     * `canAskAgain` is false in exactly that case, and Settings is the only
     * way back.
     */
    if (!granted && !canAskAgain) {
      Alert.alert(
        'Turn this on in Settings',
        `${SETTINGS_HINT}\n\nYour phone only asks once, and it was answered before. You can change it in Settings at any time.`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
        ]
      )
    }

    await commit({ push_enabled: granted })
  }

  return (
    <OnboardingScreen
      step="notifications"
      title="Never miss "
      titleAccent="a spark."
      subtitle="Know when someone nearby wants to connect, or when matches are active at your location."
      ctaLabel="Enable Notifications"
      ctaBusy={saving || asking}
      onContinue={() => void ask()}
      secondaryLabel="Maybe later"
      onSecondary={() => void skip()}
      onBack={() => goTo(previousStep('notifications')!)}
    />
  )
}

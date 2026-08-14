import * as Notifications from 'expo-notifications'
import { useState } from 'react'

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
export default function NotificationsScreen() {
  const { saving, commit, skip, goTo } = useOnboarding('notifications')
  const [asking, setAsking] = useState(false)

  const ask = async () => {
    setAsking(true)
    let granted = false
    try {
      // Existing permission first: asking again when it is already decided
      // returns the standing answer without a dialog, and calling `request`
      // unconditionally is what produces the "the prompt never appeared" bug
      // reports on a reinstall over an existing grant.
      const existing = await Notifications.getPermissionsAsync()
      granted =
        existing.granted ||
        (existing.canAskAgain && (await Notifications.requestPermissionsAsync()).granted)
    } catch {
      // A permissions call that throws is a broken build, not a refusal. Treat
      // it as "not granted" and carry on rather than stranding the flow.
      granted = false
    }
    setAsking(false)
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

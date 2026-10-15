import * as Notifications from 'expo-notifications'
import { useState } from 'react'

import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { SettingsTray } from '../../components/onboarding/SettingsTray'
import { NotificationIllustration } from '../../components/onboarding/PermissionIllustration'
import { askOsPermission } from '../../lib/onboarding'
import { clearPushDeclined, markPushDeclined } from '../../lib/pushDecline'
import { useAuth } from '../../lib/useAuth'
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
  const { saving, commit, goBack } = useOnboarding('notifications')
  const { user } = useAuth()

  /*
   * The answer is also kept on the phone, so the push start-up on reaching
   * the tabs does not ask the OS straight after "Maybe later" (see
   * lib/pushDecline.ts). A yes clears it, for somebody who came back here.
   */
  const answer = async (enabled: boolean) => {
    if (user?.id) await (enabled ? clearPushDeclined(user.id) : markPushDeclined(user.id))
    await commit({ push_enabled: enabled })
  }
  const [asking, setAsking] = useState(false)
  const [settingsPrompt, setSettingsPrompt] = useState(false)

  const ask = async () => {
    setAsking(true)
    const { granted, blocked } = await askOsPermission(
      () => Notifications.getPermissionsAsync(),
      async () => (await Notifications.requestPermissionsAsync()).granted
    )
    setAsking(false)

    if (blocked) {
      // The answer comes from the tray; the step waits for it.
      setSettingsPrompt(true)
      return
    }

    await answer(granted)
  }

  return (
    <OnboardingScreen
      step="notifications"
      title="Never miss "
      titleAccent="a spark."
      subtitle="Know when someone at your event wants to connect, or when a match sends you a message."
      ctaLabel="Turn on notifications"
      ctaBusy={saving || asking}
      onContinue={() => void ask()}
      secondaryLabel="Maybe later"
      /*
       * Records the refusal, rather than skipping.
       *
       * `skip()` writes progress and nothing else, so declining left
       * `push_enabled` at its schema `@default(true)` — the profile said this
       * person wants notifications when they had just said they did not. This
       * screen's own docstring has always claimed otherwise: "push_enabled
       * records the answer either way. Someone who declines has said something,
       * and the profile should say it rather than keep the default."
       *
       * iOS will not deliver without OS permission, so the blast radius today
       * is small. The STORED preference is what a settings screen, a digest or
       * any re-prompt reads, and it currently says yes.
       */
      onSecondary={() => void answer(false)}
      onBack={goBack}
    >
      <NotificationIllustration />
      <SettingsTray
        visible={settingsPrompt}
        hint={SETTINGS_HINT}
        onClose={() => setSettingsPrompt(false)}
        onNotNow={() => {
          setSettingsPrompt(false)
          void answer(false)
        }}
      />
    </OnboardingScreen>
  )
}

import * as Location from 'expo-location'
import { useState } from 'react'

import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { SettingsTray } from '../../components/onboarding/SettingsTray'
import { LocationIllustration } from '../../components/onboarding/PermissionIllustration'
import { useOnboarding } from '../../lib/useOnboarding'

/**
 * Step three — location.
 *
 * Same shape as notifications, and the same reason for existing: the OS dialog
 * fires once, so the explanation has to come first.
 *
 * Location matters more here than it does in most apps — **check-in is
 * GPS-validated and there is no way around that**, so an account that refuses
 * location can browse and never attend. The copy says what it is for rather
 * than warning about that, because the warning belongs at the check-in button
 * where it is actionable, not on a screen someone is trying to get through.
 *
 * `share_location` is the profile preference — whether other people see roughly
 * where you are. Distinct from the OS permission, which is whether the app can
 * ask the device at all. Granting the permission is what this screen records;
 * the sharing preference follows it because the design has one control, and
 * both are editable in Settings afterwards.
 */
const SETTINGS_HINT = "Blend'n uses location to see who is around you, and check in to events."

export default function LocationScreen() {
  const { saving, commit, goBack } = useOnboarding('location')
  const [asking, setAsking] = useState(false)
  const [settingsPrompt, setSettingsPrompt] = useState(false)

  const ask = async () => {
    setAsking(true)
    let granted = false
    let canAskAgain = true
    // A permissions call that throws is a broken build, not a refusal: no
    // Settings prompt, since Settings is not known to be the problem.
    let broken = false
    try {
      const existing = await Location.getForegroundPermissionsAsync()
      canAskAgain = existing.canAskAgain
      granted =
        existing.granted ||
        (existing.canAskAgain &&
          (await Location.requestForegroundPermissionsAsync()).status === 'granted')
    } catch {
      granted = false
      canAskAgain = false
      broken = true
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
    if (!granted && !canAskAgain && !broken) {
      // The answer comes from the tray; the step waits for it.
      setSettingsPrompt(true)
      return
    }

    await commit({ share_location: granted })
  }

  return (
    <OnboardingScreen
      step="location"
      title="See who's around"
      subtitle="Blend'n uses your location to show you real people in your immediate vicinity, like at a cafe or airport lounge."
      ctaLabel="Allow Location"
      ctaBusy={saving || asking}
      onContinue={() => void ask()}
      secondaryLabel="Maybe later"
      // The same bug in the second of two places — see the note in
      // `notifications.tsx`. Declining left `share_location` at `@default(true)`.
      onSecondary={() => void commit({ share_location: false })}
      footerNote="Your precise location is never shared with strangers."
      onBack={goBack}
    >
      <LocationIllustration />
      <SettingsTray
        visible={settingsPrompt}
        hint={SETTINGS_HINT}
        onClose={() => setSettingsPrompt(false)}
        onNotNow={() => {
          setSettingsPrompt(false)
          void commit({ share_location: false })
        }}
      />
    </OnboardingScreen>
  )
}

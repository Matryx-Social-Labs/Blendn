import * as Location from 'expo-location'
import { useState } from 'react'

import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { SettingsTray } from '../../components/onboarding/SettingsTray'
import { LocationIllustration } from '../../components/onboarding/PermissionIllustration'
import { askOsPermission } from '../../lib/onboarding'
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
    const { granted, blocked } = await askOsPermission(
      () => Location.getForegroundPermissionsAsync(),
      async () => (await Location.requestForegroundPermissionsAsync()).status === 'granted'
    )
    setAsking(false)

    if (blocked) {
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
      subtitle="Blend'n uses your location to show events near you, and to check you in when you arrive at one."
      ctaLabel="Allow location"
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

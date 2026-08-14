import * as Location from 'expo-location'
import { useState } from 'react'

import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { previousStep } from '../../lib/onboarding'
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
export default function LocationScreen() {
  const { saving, commit, skip, goTo } = useOnboarding('location')
  const [asking, setAsking] = useState(false)

  const ask = async () => {
    setAsking(true)
    let granted = false
    try {
      const existing = await Location.getForegroundPermissionsAsync()
      granted =
        existing.granted ||
        (existing.canAskAgain &&
          (await Location.requestForegroundPermissionsAsync()).status === 'granted')
    } catch {
      granted = false
    }
    setAsking(false)
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
      onSecondary={() => void skip()}
      onBack={() => goTo(previousStep('location')!)}
    />
  )
}

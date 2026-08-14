import { Stack } from 'expo-router'

import { EMBER } from '../../lib/theme'

/**
 * The onboarding stack.
 *
 * No header — every screen draws its own, with the progress bar in it. Gestures
 * off, because a swipe-back past the first screen exits onto whatever was
 * underneath, which for a brand-new account is the sign-in screen they have
 * just come from.
 */
export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: EMBER.bg },
      }}
    />
  )
}

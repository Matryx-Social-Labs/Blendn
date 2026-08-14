import { Stack } from 'expo-router'

import { EMBER } from '../../lib/theme'

/**
 * The onboarding stack.
 *
 * No header — every screen draws its own, with the progress bar in it.
 *
 * **Gestures on.** They were off, together with `router.replace` for every
 * move, and the pair produced two reported bugs: going back animated like
 * going forward, and the edge-swipe every iPhone user reaches for did nothing.
 * `replace` keeps no history, so there was nothing for a gesture to pop even
 * had one been allowed.
 *
 * Steps now `push` forward and `back()` backward, which is what makes both the
 * animation and the gesture correct at once.
 *
 * Swiping out of onboarding entirely is still prevented — but a level up, on
 * the `onboarding` screen in the root layout, where it belongs. Blocking it
 * here blocked movement *between* steps too, which was never the intent.
 */
export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: EMBER.bg },
      }}
    />
  )
}

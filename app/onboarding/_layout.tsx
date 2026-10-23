import { Stack } from 'expo-router'
import { Platform } from 'react-native'

import { HueProvider } from '../../components/ds/shared'
import { textSizeLayout } from '../../components/TextSizeBoundary'
import { COLOR } from '../../lib/design/tokens'

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
  // Onboarding is you: the violet world, for every step (the progress, the chips, the cards and the photo ring).
  return (
    <HueProvider value="violet">
      <Stack
        // Laid out afresh when the text size changes (RC drive D2).
        screenLayout={textSizeLayout}
        screenOptions={{
          headerShown: false,
          gestureEnabled: true,
          // The root stack's transition, so a step pushes like every other
          // screen: iOS's own parallax push, not the Android-style slide.
          animation: Platform.OS === 'ios' ? 'ios_from_right' : 'slide_from_right',
          contentStyle: { backgroundColor: COLOR.ink },
        }}
      >
        {/*
          After the last step, with the finished steps still underneath: a swipe
          here would reopen one. See app/onboarding/friends.tsx.
        */}
        <Stack.Screen name="friends" options={{ gestureEnabled: false }} />
      </Stack>
    </HueProvider>
  )
}

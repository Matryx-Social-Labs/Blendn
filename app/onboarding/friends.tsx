import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { BackHandler } from 'react-native'

import { InviteLinkCard } from '../../components/friends/InviteLinkCard'
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { useFriendInvite } from '../../lib/useFriendInvite'

/**
 * Bring your friends — shown once, after the last onboarding step and before
 * the app.
 *
 * Not a step: `ONBOARDING_STEPS` ends at `ready`, which writes `onboarded`, and
 * this screen is what `ready` replaces itself with. Once `onboarded` is true
 * the root guard never routes back here, so "once" is free. It lives under
 * `/onboarding` so a link or notification that arrived mid-flow waits until
 * this is left, rather than landing on top of it.
 *
 * The one thing it says that matters: nobody can find you by searching, so the
 * link is how your friends get in. Sharing is optional — "Maybe later" goes
 * straight to the app, and the link is always on the Me tab.
 */
export default function FriendsIntroScreen() {
  const { invite, failed, share } = useFriendInvite()
  const [shared, setShared] = useState(false)

  const enterApp = () => router.replace('/(tabs)/events')

  /*
   * Onboarding is finished by the time this shows, but its steps are still on
   * the stack underneath (they push forward). Back must not reopen one: on
   * Android the hardware back goes into the app instead, and on iOS the
   * swipe is off for this screen (app/onboarding/_layout.tsx).
   */
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        router.replace('/(tabs)/events')
        return true
      })
      return () => sub.remove()
    }, [])
  )

  const shareLink = async () => {
    if (await share()) setShared(true)
  }

  return (
    <OnboardingScreen
      title="Bring your "
      titleAccent="friends."
      subtitle="Nobody can find you on Blend'n by searching. Share your link, and anyone you send it to can ask to be your friend."
      ctaLabel={shared ? "Start Blend'n" : 'Share my link'}
      ctaBusy={!invite && !failed}
      ctaDisabled={!shared && failed}
      onContinue={() => void (shared ? enterApp() : shareLink())}
      secondaryLabel={shared ? 'Share again' : 'Maybe later'}
      onSecondary={() => void (shared ? shareLink() : enterApp())}
      footerNote="In a room, friends see your pseudonym like everyone else. You can change that in Settings."
    >
      <InviteLinkCard url={invite?.url} failed={failed} />
    </OnboardingScreen>
  )
}

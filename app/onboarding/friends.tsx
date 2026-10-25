import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { BackHandler, StyleSheet, Text, View } from 'react-native'

import { font, useBoldText, useSelection } from '../../components/ds/shared'
import { InviteLinkCard } from '../../components/friends/InviteLinkCard'
import { Icon, type IconName } from '../../components/ui/Icon'
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { COLOR, ICON, MAX_FONT_SCALE, SPACE } from '../../lib/design/tokens'
import { useFriendInvite } from '../../lib/useFriendInvite'

/** The primary by state (Flow 2 friends 02 · 03 · 04): a link that did not load is retried from the same button, never a dead one (U-M14). */
export const friendsPrimary = (shared: boolean, failed: boolean) => (shared ? 'Start Blend’n' : failed ? 'Try again' : 'Share my link')

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
  const { invite, failed, share, reload } = useFriendInvite()
  const [shared, setShared] = useState(false)
  const [retrying, setRetrying] = useState(false)

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

  const retry = async () => {
    setRetrying(true)
    await reload()
    setRetrying(false)
  }

  return (
    <OnboardingScreen
      title="Bring your "
      titleAccent="friends."
      subtitle="Nobody can find you on Blend’n by searching. Share your link, and anyone you send it to can ask to be your friend."
      ctaLabel={friendsPrimary(shared, failed)}
      ctaBusy={(!invite && !failed) || retrying}
      onContinue={() => void (shared ? enterApp() : failed ? retry() : shareLink())}
      secondaryLabel={shared ? 'Share again' : 'Maybe later'}
      onSecondary={() => void (shared ? shareLink() : enterApp())}
      footerNote="In a room, friends see your pseudonym like everyone else. You can change that in Settings."
    >
      <InviteLinkCard url={invite?.url} failed={failed && !retrying} shared={shared} />
      <HowLinksWork />
    </OnboardingScreen>
  )
}

/** How a friend link works, in three lines: the only way friends are added (the owner's rule), and what filled a dead gap (A9). */
const HOW: readonly { icon: IconName; text: string }[] = [
  { icon: 'link', text: 'Send your link to someone you know.' },
  { icon: 'user-plus', text: 'They tap it and ask to be your friend.' },
  { icon: 'check', text: 'You say yes. Nobody else can find you.' },
]

function HowLinksWork() {
  const bold = useBoldText()
  const sel = useSelection()
  return (
    <View testID="friends-how" style={styles.how}>
      {HOW.map(({ icon, text }) => (
        <View key={icon} style={styles.howRow}>
          <Icon name={icon} size={ICON.control} color={sel.glyph} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.howText]}>
            {text}
          </Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  how: { gap: SPACE.lg, paddingHorizontal: SPACE.xs },
  howRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  howText: { flex: 1, color: COLOR.textSecondary },
})

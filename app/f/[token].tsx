import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Avatar } from '../../components/ds/Avatar'
import { Button } from '../../components/ds/Button'
import { Grain } from '../../components/ds/Grain'
import { IconButton } from '../../components/ds/IconButton'
import { Orbs } from '../../components/ds/Orbs'
import { CONTROL_FONT_CAP, font, HueProvider, useBoldText } from '../../components/ds/shared'
import { StateScreen } from '../../components/ds/StateScreen'
import FadeInUp from '../../components/motion/FadeInUp'
import { SkeletonBlock, SkeletonCircle } from '../../components/Skeleton'
import { useToast } from '../../components/Toast'
import { apiClient } from '../../lib/apiClient'
import { COLOR, FONT_FAMILY, SPACE } from '../../lib/design/tokens'
import { inviteCta, inviteLine, type FriendPerson, type FriendState } from '../../lib/friends'
import { askFriendsSeeMe, useStillHere } from '../../lib/friendsSeeMeAsk'
import { isGone } from '../../lib/loadFailure'

/** Flow 6 `invite`: the face is 160. */
const FACE = 160
/** The loading shapes: a title block and a line, under the face. */
const SKELETON = { title: 40, line: 20 } as const

/**
 * Where an invite link lands: `https://www.blendn.app/f/<token>`, or
 * `blendn://f/<token>` from the web page's "Open in Blend'n".
 *
 * Signed out, the root guard holds this route and opens it after sign-in (or
 * after onboarding, for a new account) — see `app/_layout.tsx`. Meanwhile the
 * welcome and sign-in screens say whose invite is waiting, from the public
 * preview (`components/friends/PendingInvite.tsx`).
 *
 * Shows the person who sent the link, because sending it was their choice. A
 * link that does not work says only that: never whether it was reset, whether
 * they blocked you, or whether the account still exists.
 *
 * "Doesn't work" is the server's 404 and nothing else. A link opened on a bad
 * connection is a link that didn't load, and gets Try again — telling
 * somebody their friend's link is dead because the train went into a tunnel
 * sends them off to ask for a new one they don't need.
 */
export default function InviteScreen() {
  const bold = useBoldText()
  const { token } = useLocalSearchParams<{ token: string }>()
  const { showToast } = useToast()
  const stillHere = useStillHere()
  const [person, setPerson] = useState<FriendPerson | null>(null)
  const [state, setState] = useState<FriendState | null>(null)
  const [dead, setDead] = useState(false)
  const [failed, setFailed] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [asking, setAsking] = useState(false)

  const settle = useCallback((result: Awaited<ReturnType<typeof apiClient.openFriendInvite>>) => {
    if (result.success && result.data) {
      setPerson(result.data.person)
      setState(result.data.state)
      setFailed(false)
    } else if (isGone(result)) {
      setDead(true)
    } else {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    let live = true
    apiClient.openFriendInvite(String(token)).then((result) => {
      if (live) settle(result)
    })
    return () => {
      live = false
    }
  }, [token, settle])

  const retry = async () => {
    setRetrying(true)
    settle(await apiClient.openFriendInvite(String(token)))
    setRetrying(false)
  }

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/events'))

  const act = async () => {
    if (!person || !state) return
    const { action } = inviteCta(state)
    if (action === 'open') {
      router.replace({ pathname: '/friends/[userId]', params: { userId: person.userId } })
      return
    }
    if (action === 'share') {
      router.replace('/friends/add')
      return
    }
    if (action !== 'ask') return
    setAsking(true)
    const result = await apiClient.sendFriendRequest({ token: String(token) })
    setAsking(false)
    if (result.success && result.data) {
      setState(result.data.state)
      if (result.data.state === 'friends') {
        showToast(`You and ${person.name} are friends`, 'success', { haptic: 'success' })
        // A request that is only sent is no friendship yet: nothing to ask about.
        void askFriendsSeeMe({ stillHere })
      }
    } else {
      showToast("That didn't go through. Try again.", 'error', { haptic: 'error' })
    }
  }

  const cta = state ? inviteCta(state) : null

  return (
    <HueProvider value="rose">
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <Orbs set="moment" />
        <Grain />
        {/* First in the tree for the focus order. */}
        <View style={styles.bar}>
          <IconButton icon="x" accessibilityLabel="Close" onPress={close} />
        </View>

        <View style={styles.body}>
          {dead ? (
            <StateScreen icon="link-2-off" title="This link doesn’t work" body="Ask the person who sent it for a new one." testID="invite-dead" />
          ) : failed && !person ? (
            <StateScreen
              icon="cloud-off"
              title="This link didn’t open"
              body="Check your connection and try again."
              actions={[{ label: 'Try again', onPress: () => void retry(), loading: retrying }]}
              testID="invite-failed"
            />
          ) : !person || !cta ? (
            // The page's own shape while it loads (Flow 6 invite 09), so it does not jump when it lands.
            <View testID="invite-loading" accessibilityLabel="Loading" accessibilityState={{ busy: true }} style={styles.stage}>
              <SkeletonCircle width={FACE} />
              <SkeletonBlock width="70%" height={SKELETON.title} />
              <SkeletonBlock width="80%" height={SKELETON.line} />
            </View>
          ) : (
            <FadeInUp style={styles.stage}>
              {/* Decorative: the name under it says who this is. */}
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {person.photo ? <Avatar kind="photo" uri={person.photo} size={FACE} /> : <Avatar kind="creature" pseudonym={person.name} size={FACE} />}
              </View>
              <View style={styles.words}>
                <Text accessibilityRole="header" maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('display', bold, FONT_FAMILY.brand[900]), styles.title]}>
                  {headline(person.name, state)}
                </Text>
                <Text style={[font('body', bold), styles.line]}>{state ? inviteLine(state) : null}</Text>
              </View>
            </FadeInUp>
          )}
        </View>

        {cta && !dead ? (
          <View style={styles.footer}>
            <Button
              kind={cta.action === null ? 'secondary' : 'primary'}
              label={cta.label}
              onPress={() => void act()}
              loading={asking}
              disabled={cta.action === null}
              testID="invite-cta"
            />
            <Button kind="tertiary" label="Not now" onPress={close} />
          </View>
        ) : null}
      </SafeAreaView>
    </HueProvider>
  )
}

/** Flow 6 `invite`: who it is, in one line; your own link has no name in it, and a friend's says so. */
function headline(name: string, state: FriendState | null) {
  if (state === 'self') return 'Your invite link'
  if (state === 'friends') return `You and ${name} are friends`
  if (state === 'requested') return name
  return `${name} wants to blend with you`
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.ink },
  bar: { paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm, flexDirection: 'row' },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: SPACE.gutter },
  stage: { alignItems: 'center', gap: SPACE.lg },
  words: { alignItems: 'center', gap: SPACE.sm },
  title: { color: COLOR.textPrimary, textAlign: 'center' },
  line: { color: COLOR.textSecondary, textAlign: 'center' },
  footer: { paddingHorizontal: SPACE.gutter, paddingBottom: SPACE.lg, gap: SPACE.sm },
})

import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Avatar } from '../../components/ds/Avatar'
import { FriendRefusalScreen } from '../../components/friends/FriendRefusalScreen'
import { Button } from '../../components/ds/Button'
import { Grain } from '../../components/ds/Grain'
import { IconButton } from '../../components/ds/IconButton'
import { Orbs } from '../../components/ds/Orbs'
import { font, HueProvider, useBoldText } from '../../components/ds/shared'
import { Title } from '../../components/ds/Title'
import type { IconName } from '../../components/ui/Icon'
import { StateScreen } from '../../components/ds/StateScreen'
import FadeInUp from '../../components/motion/FadeInUp'
import { SkeletonBlock, SkeletonCircle } from '../../components/Skeleton'
import { useToast } from '../../components/Toast'
import { apiClient } from '../../lib/apiClient'
import { COLOR, FONT_FAMILY, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { friendRefusal, type FriendRefusal } from '../../lib/friendRefusal'
import { inviteCta, inviteLine, type FriendPerson, type FriendState } from '../../lib/friends'
import { askFriendsSeeMe, useStillHere } from '../../lib/friendsSeeMeAsk'
import { isGone } from '../../lib/loadFailure'
import { RouteModal } from '../../components/system/RouteModal'

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
function InviteScreen() {
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
  /** Why the server refused, when the reason has a screen of its own (Flow 15 15.19). */
  const [refusal, setRefusal] = useState<{ why: FriendRefusal; n: number } | null>(null)
  /** Each refusal is a new one: a second 60 s wait restarts the count, it does not carry on from the first. */
  const refusals = useRef(0)
  const refuse = useCallback((why: FriendRefusal) => setRefusal({ why, n: ++refusals.current }), [])
  /** Edit profile was opened from the refusal: coming back re-reads the link, which is how "we'll bring you back to it" is kept. */
  const leftForProfile = useRef(false)

  const settle = useCallback((result: Awaited<ReturnType<typeof apiClient.openFriendInvite>>) => {
    const refused = friendRefusal(result)
    if (result.success && result.data) {
      setPerson(result.data.person)
      setState(result.data.state)
      setFailed(false)
      setRefusal(null)
    } else if (refused) {
      refuse(refused)
    } else if (isGone(result)) {
      setDead(true)
    } else {
      setFailed(true)
    }
  }, [refuse])

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

  const finishProfile = () => {
    leftForProfile.current = true
    router.push('/edit-profile' as never)
  }

  // Back from Edit profile: the link is read again, so the person who sent it is there to be answered.
  useFocusEffect(
    useCallback(() => {
      if (!leftForProfile.current) return
      leftForProfile.current = false
      setRetrying(true)
      void apiClient.openFriendInvite(String(token)).then((result) => {
        settle(result)
        setRetrying(false)
      })
    }, [token, settle])
  )

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
      const refused = friendRefusal(result)
      if (refused) refuse(refused)
      else showToast("That didn’t go through. Try again.", 'error', { haptic: 'error' })
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
            // D-LM9: not a dead end. Your own link is one tap away, as well as the ×.
            <StateScreen
              icon="link-2-off"
              title="This link doesn’t work"
              body="Ask the person who sent it for a new one."
              actions={[{ label: 'Add friends', kind: 'lit', onPress: () => router.replace('/friends/add') }]}
              testID="invite-dead"
            />
          ) : refusal ? (
            <FriendRefusalScreen key={refusal.n} refusal={refusal.why} onFinishProfile={finishProfile} onRetry={() => void retry()} onClose={close} retrying={retrying} />
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
            <View accessible testID="invite-loading" accessibilityLabel="Loading" accessibilityState={{ busy: true }} style={styles.stage}>
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
                {/*
                  Flow 7 3-A: the name alone is the headline (Satoshi Black, 34; 30 for a long name), the shared Title, so a word too
                  wide for its line at the large sizes shrinks rather than splits. Under it, one line says what happened.
                */}
                <Title
                  variant="display"
                  family={FONT_FAMILY.brand[900]}
                  accessibilityRole="header"
                  numberOfLines={HEADLINE_LINES}
                  style={[styles.title, headline(person.name, state).length > LONG_NAME ? styles.titleLong : styles.titleShort]}
                >
                  {headline(person.name, state)}
                </Title>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.line]}>{state ? inviteLine(state) : null}</Text>
              </View>
            </FadeInUp>
          )}
        </View>

        {/* The buttons arrive with the stage they belong to, not at rest under it (motion audit M16). */}
        {cta && !dead && !refusal ? (
          <FadeInUp style={styles.footer}>
            <Button
              kind={cta.action === null ? 'secondary' : 'primary'}
              icon={CTA_ICON[state ?? 'none']}
              label={cta.label}
              accessibilityLabel={cta.action === null ? 'Friend request sent' : undefined}
              onPress={() => void act()}
              loading={asking}
              disabled={cta.action === null}
              testID="invite-cta"
            />
            <Button kind="tertiary" label="Not now" onPress={close} />
          </FadeInUp>
        ) : null}
      </SafeAreaView>
    </HueProvider>
  )
}

/** Flow 6 `invite`: who it is, in one line; your own link has no name in it, and a friend's says so. */
function headline(name: string, state: FriendState | null) {
  if (state === 'self') return 'Your invite link'
  if (state === 'friends') return `You and ${name} are friends`
  return name
}

/** The glyph before the invite's one button: Add friend's user-plus, Requested's clock (Flow 7 3-A). */
const CTA_ICON: Record<FriendState, IconName | undefined> = { none: 'user-plus', incoming: 'user-check', requested: 'clock', friends: undefined, self: 'share' }

/** Past this many characters a name heads the page at 30, not 34 (the board's 45-character and Québec names). */
const LONG_NAME = 24
/** Three lines hold the 45-character name at 30; a longer one ends in an ellipsis rather than pushing the button off. */
const HEADLINE_LINES = 3

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.ink },
  bar: { paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm, flexDirection: 'row' },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: SPACE.gutter },
  // design-exception: the board's face sits 22 above the name and the line 10 under it (fr.js `landing`).
  stage: { alignItems: 'center', gap: 22 },
  // design-exception: the line is 10 under the name (fr.js `landing`).
  words: { alignItems: 'center', gap: 10 },
  // design-exception: the board's headline (fr.js `T1`): 900 at 34/38 (30/34 for a long name), tracking -0.4, 345 wide.
  title: { color: COLOR.textPrimary, textAlign: 'center', letterSpacing: -0.4, maxWidth: 345 },
  // design-exception: the board's headline at 34/38 (fr.js `T1`)
  titleShort: { fontSize: 34, lineHeight: 38 },
  // design-exception: the board's long-name headline at 30/34 (fr.js `lA`)
  titleLong: { fontSize: 30, lineHeight: 34 },
  line: { color: COLOR.textSecondary, textAlign: 'center' },
  footer: { paddingHorizontal: SPACE.gutter, paddingBottom: SPACE.lg, gap: SPACE.sm },
})

/** A router modal: it holds the screen while it is up, and its sheets present from it (lib/modalTurn). */
export default function InviteRoute() {
  return (
    <RouteModal>
      <InviteScreen />
    </RouteModal>
  )
}

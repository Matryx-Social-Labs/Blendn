import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { CrewRefusalSheet, type CrewRefusal } from '../../components/crews/CrewRefusalSheet'
import { InviteCard } from '../../components/crews/InviteCard'
import { Grain } from '../../components/ds/Grain'
import { IconButton } from '../../components/ds/IconButton'
import { Orbs } from '../../components/ds/Orbs'
import { HueProvider, useSelection } from '../../components/ds/shared'
import { StateScreen } from '../../components/ds/StateScreen'
import FadeInUp from '../../components/motion/FadeInUp'
import { SkeletonBlock } from '../../components/Skeleton'
import { RouteModal } from '../../components/system/RouteModal'
import { useToast } from '../../components/Toast'
import { crewInviteAnswered } from '../../lib/crewInvites'
import { askCrewPush } from '../../lib/crewPushAsk'
import { crewMessage, type CrewLink } from '../../lib/crews'
import { crewsApi } from '../../lib/crewsApi'
import { friendsToo, openForLine } from '../../lib/crewsScreens'
import { COLOR, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { isGone } from '../../lib/loadFailure'
import { isLinkId } from '../../lib/shareLinks'
import { useAuth } from '../../lib/useAuth'

type Load = { kind: 'loading' } | { kind: 'ready'; link: CrewLink } | { kind: 'dead' } | { kind: 'failed' }

/** The loading shapes: the emblem, the name and a line. */
const SKELETON = { emblem: 120, title: 40, line: 20 } as const
/** How long "Joined" shows before the chat opens, as on a friend's invite. */
const JOINED_MS = 700

/**
 * Where a crew link lands (S7, board crews/03 A + waves-b2 Z-B): `https://www.blendn.app/c/<token>` or `blendn://c/<token>`. Signed
 * out, the root guard holds it until sign-in (`app/_layout.tsx`). The invite card, with what joining by a link adds (you become
 * friends with whoever shared it) in the consent panel. Not now only closes: nothing is sent, and the link stays open. Already in:
 * the crew's page. Every dead link is the server's one 404 and says only that; a failed load is not a dead link.
 */
function CrewLinkScreen() {
  const { token: param } = useLocalSearchParams<{ token: string }>()
  // From a link: checked before it builds an API path.
  const token = isLinkId(param) ? param : null
  const sel = useSelection()
  const { showToast } = useToast()
  const { user } = useAuth()
  const [load, setLoad] = useState<Load>(token ? { kind: 'loading' } : { kind: 'dead' })
  const [retrying, setRetrying] = useState(false)
  const [keepAnonymous, setKeepAnonymous] = useState(false)
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState<{ chatGroupId: string; crewId: string; name: string } | null>(null)
  const [refusal, setRefusal] = useState<CrewRefusal | null>(null)
  /** One join at a time: state lags a fast second tap by a render. */
  const inFlight = useRef(false)

  const settle = useCallback((result: Awaited<ReturnType<typeof crewsApi.link>>) => {
    if (result.success && result.data) {
      if (result.data.member) router.replace({ pathname: '/crews/[crewId]', params: { crewId: result.data.crewId } })
      else setLoad({ kind: 'ready', link: result.data })
    } else setLoad({ kind: isGone(result) ? 'dead' : 'failed' })
  }, [])

  useEffect(() => {
    if (!token) return
    let live = true
    void crewsApi.link(token).then((result) => {
      if (live) settle(result)
    })
    return () => {
      live = false
    }
  }, [token, settle])

  // Timer-driven, so Reduce Motion and a dropped frame both still arrive at the chat.
  useEffect(() => {
    if (!joined) return
    const timer = setTimeout(() => {
      router.replace({ pathname: '/chat/[id]', params: { id: joined.chatGroupId, roomName: joined.name, kind: 'crew', crewId: joined.crewId } } as never)
      showToast(`You’re in ${joined.name}`, 'success')
      if (user?.id) void askCrewPush(user.id)
    }, JOINED_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined])

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/events'))

  const retry = async () => {
    if (!token) return
    setRetrying(true)
    settle(await crewsApi.link(token))
    setRetrying(false)
  }

  const join = async () => {
    if (inFlight.current || !token || load.kind !== 'ready') return
    inFlight.current = true
    setJoining(true)
    // Tapping Join is the agreement to the sentences above it; the server refuses a join without it.
    const result = await crewsApi.joinByLink(token, { revealConsent: true, keepMeAnonymous: keepAnonymous })
    inFlight.current = false
    setJoining(false)
    if (!result.success || !result.data) {
      if (isGone(result)) return setLoad({ kind: 'dead' })
      setRefusal({ text: crewMessage(result, 'join', 'Couldn’t join the crew. Try again.'), errorCode: result.errorCode })
      return
    }
    H.success()
    // A friend's invite to the same crew, if there was one, is answered too.
    crewInviteAnswered(result.data.crewId, 'joined', load.link.name)
    setJoined({ ...result.data, name: load.link.name })
  }

  return (
    <HueProvider value="rose">
      <SafeAreaView style={styles.container} edges={['top']}>
        <Orbs set="feed" tint={sel.edge} />
        <Grain />
        <View style={styles.bar}>
          <IconButton icon="x" accessibilityLabel="Close" onPress={close} />
        </View>
        {load.kind === 'ready' ? (
          <FadeInUp style={styles.fill}>
            <InviteCard
              invite={load.link}
              invitedBy={load.link.invitedBy.name}
              invitedByPhoto={load.link.invitedBy.photoUrl}
              consentMore={friendsToo(load.link.invitedBy.name)}
              note={openForLine(load.link.expiresAt)}
              keepAnonymous={keepAnonymous}
              onKeepAnonymous={setKeepAnonymous}
              joining={joining}
              joined={!!joined}
              refused={!!refusal}
              onJoin={() => void join()}
              onNotNow={close}
            />
          </FadeInUp>
        ) : load.kind === 'loading' ? (
          <View accessible testID="crew-link-loading" accessibilityLabel="Loading" accessibilityState={{ busy: true }} style={[styles.state, styles.stage]}>
            <SkeletonBlock width={SKELETON.emblem} height={SKELETON.emblem} />
            <SkeletonBlock width="70%" height={SKELETON.title} />
            <SkeletonBlock width="80%" height={SKELETON.line} />
          </View>
        ) : (
          <View style={styles.state}>
            {load.kind === 'dead' ? (
              <StateScreen
                icon="link-2-off"
                title="This invite link doesn’t work"
                body="Ask the person who sent it for a new one."
                actions={[{ label: 'Close', kind: 'secondary', onPress: close }]}
                testID="crew-link-dead"
              />
            ) : (
              <StateScreen
                icon="cloud-off"
                title="This link didn’t open"
                body="Check your connection and try again."
                actions={[{ label: 'Try again', onPress: () => void retry(), loading: retrying }]}
                testID="crew-link-failed"
              />
            )}
          </View>
        )}
        <CrewRefusalSheet refusal={refusal} onClose={() => setRefusal(null)} />
      </SafeAreaView>
    </HueProvider>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.ink },
  bar: { paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm, flexDirection: 'row' },
  fill: { flex: 1 },
  state: { flex: 1, justifyContent: 'center', paddingHorizontal: SPACE.gutter },
  stage: { alignItems: 'center', gap: SPACE.lg },
})

/** A router modal: it holds the screen while it is up, and its sheets present from it (lib/modalTurn). */
export default function CrewLinkRoute() {
  return (
    <RouteModal>
      <CrewLinkScreen />
    </RouteModal>
  )
}

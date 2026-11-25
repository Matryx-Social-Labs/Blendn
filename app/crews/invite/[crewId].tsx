import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'

import { InviteCard } from '../../../components/crews/InviteCard'
import { CrewRefusalSheet, type CrewRefusal } from '../../../components/crews/CrewRefusalSheet'
import { Grain } from '../../../components/ds/Grain'
import { Orbs } from '../../../components/ds/Orbs'
import { font, HueProvider, useBoldText, useSelection } from '../../../components/ds/shared'
import { StateScreen } from '../../../components/ds/StateScreen'
import { TopBar } from '../../../components/ds/TopBar'
import { useSkeletonCrossfade } from '../../../components/motion/useSkeletonCrossfade'
import { useToast } from '../../../components/Toast'
import { askCrewPush } from '../../../lib/crewPushAsk'
import { crewInviteAnswered } from '../../../lib/crewInvites'
import { crewMessage, findInvite, type CrewInvite } from '../../../lib/crews'
import { crewsApi } from '../../../lib/crewsApi'
import { inviteNote } from '../../../lib/crewsScreens'
import { COLOR, SPACE, MAX_FONT_SCALE } from '../../../lib/design/tokens'
import { H } from '../../../lib/haptics'
import { showSheet } from '../../../lib/sheet'
import { useAuth } from '../../../lib/useAuth'

type Load = { kind: 'loading' } | { kind: 'ready'; invite: CrewInvite } | { kind: 'notOpen' } | { kind: 'failed' }

/** How long "Joined" shows before the chat opens. */
const JOINED_MS = 700
const NOT_OPEN = 'This invite isn’t open any more'

/**
 * An invite received, as an invite card (board 03 A): the friend who asked leads by face ("Priya asked you in"), then the
 * crew, big, lit from behind in the screen's hue, its size and tags in one line and its line in quotes. What an invitee is
 * given, and no more: never a member's name or photo (the crew's page is members-only). The consent sentence and "keep me
 * anonymous" sit above "Join Nebula", always on screen, and tapping it is the agreement: nothing is sent before it. Not now
 * asks first, because declining is final for 30 days, and under it the days left are said (`expiresAt`) and that the friend
 * isn't told. Leaving by Back keeps the invite open. One 404 covers lapsed, withdrawn, left and blocked.
 */
function CrewInviteScreenContent() {
  const { crewId: param } = useLocalSearchParams<{ crewId: string }>()
  const crewId = String(param)
  const bold = useBoldText()
  const sel = useSelection()
  const { showToast } = useToast()
  const { user } = useAuth()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [keepAnonymous, setKeepAnonymous] = useState(false)
  const [joining, setJoining] = useState(false)
  /** The server said yes: Join reads "Joined" for a beat, quiet, before the chat opens (R3-D10 #45). */
  const [joined, setJoined] = useState<{ chatGroupId: string; name: string } | null>(null)
  const [refusal, setRefusal] = useState<CrewRefusal | null>(null)
  /** One join or decline at a time: state lags a fast second tap by a render. */
  const inFlight = useRef(false)
  const arrive = useSkeletonCrossfade(load.kind === 'loading')

  const read = useCallback(async () => {
    // Past the first 50 invites too (YOU-11): the push for invite #51 must still open it.
    const found = await findInvite((cursor) => crewsApi.myCrews(cursor), crewId)
    setLoad(found.kind === 'found' ? { kind: 'ready', invite: found.invite } : { kind: found.kind })
  }, [crewId])

  useFocusEffect(
    useCallback(() => {
      void read()
    }, [read])
  )

  // Timer-driven, so Reduce Motion and a dropped frame both still arrive at the chat.
  useEffect(() => {
    if (!joined) return
    const timer = setTimeout(() => {
      // The chat opens next; Back from it lands on Crews, which re-reads on focus.
      router.replace({ pathname: '/chat/[id]', params: { id: joined.chatGroupId, roomName: joined.name, kind: 'crew', crewId } } as never)
      showToast(`You’re in ${joined.name}`, 'success')
      if (user?.id) void askCrewPush(user.id)
    }, JOINED_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined])

  if (load.kind !== 'ready') {
    return (
      <View style={styles.container}>
        <Grain />
        <TopBar title="Crew invite" onBack={() => router.back()} testID="invite-top" />
        <View style={styles.state}>
          {load.kind === 'loading' ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} accessibilityLabel="Loading the invite" style={[font('meta', bold), styles.secondary]}>
              Loading…
            </Text>
          ) : load.kind === 'failed' ? (
            <StateScreen
              icon="cloud-off"
              title="This invite didn’t load"
              body="Check your connection and try again."
              actions={[{ label: 'Try again', onPress: () => void read() }]}
              testID="invite-failed"
            />
          ) : (
            <StateScreen
              icon="mail-x"
              title={NOT_OPEN}
              body="Invites last 14 days. Ask your friend to invite you again."
              actions={[{ label: 'Back to Crews', kind: 'secondary', onPress: () => router.back() }]}
              testID="invite-not-open"
            />
          )}
        </View>
      </View>
    )
  }

  const { invite } = load

  const join = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setJoining(true)
    // Tapping Join is the agreement to the sentence above it; the server refuses a join without it.
    const result = await crewsApi.join(crewId, { revealConsent: true, keepMeAnonymous: keepAnonymous })
    inFlight.current = false
    setJoining(false)
    if (!result.success || !result.data) {
      if (result.errorCode === 'NOT_FOUND') {
        // Gone: the list stops offering it once it is re-read.
        setLoad({ kind: 'notOpen' })
        return
      }
      setRefusal({ text: crewMessage(result, 'join', 'Couldn’t join the crew. Try again.'), errorCode: result.errorCode })
      return
    }
    H.success()
    // Every surface holding the invite lets it go now (Notifications says "You’re in", then lets it go too).
    crewInviteAnswered(crewId, 'joined', invite.name)
    setJoined({ chatGroupId: result.data.chatGroupId, name: invite.name })
  }


  const decline = async () => {
    if (inFlight.current) return
    inFlight.current = true
    const result = await crewsApi.decline(crewId)
    inFlight.current = false
    if (!result.success && result.errorCode !== 'NOT_FOUND') {
      showToast(crewMessage(result, 'join', 'Couldn’t decline. Try again.'), 'error', { haptic: 'error' })
      return
    }
    // Told to nobody, and a gone invite is as good as declined.
    crewInviteAnswered(crewId, 'declined', invite.name)
    router.back()
  }

  const confirmDecline = () =>
    showSheet({
      kind: 'actions',
      hue: 'rose',
      title: `Decline ${invite.name}?`,
      message: `${invite.invitedBy} isn’t told. They can’t ask you into this crew again for 30 days.`,
      actions: [
        { label: 'Decline', variant: 'destructive', then: () => void decline() },
        { label: 'Cancel', cancel: true },
      ],
    })

  return (
    <View style={styles.container}>
      {/* Lit from behind in the screen's own hue (TG-14), as the board's glow behind the emblem. */}
      <Orbs set="feed" tint={sel.edge} />
      <Grain />
      <TopBar onBack={() => router.back()} testID="invite-top" />
      <Animated.View entering={arrive} style={styles.fill}>
        <InviteCard
          invite={invite}
          invitedBy={invite.invitedBy}
          invitedByPhoto={invite.invitedByPhoto}
          note={inviteNote(invite)}
          keepAnonymous={keepAnonymous}
          onKeepAnonymous={setKeepAnonymous}
          joining={joining}
          joined={!!joined}
          refused={!!refusal}
          onJoin={() => void join()}
          onNotNow={confirmDecline}
        />
      </Animated.View>
      <CrewRefusalSheet refusal={refusal} onClose={() => setRefusal(null)} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.ink },
  state: { flex: 1, justifyContent: 'center', paddingHorizontal: SPACE.gutter },
  fill: { flex: 1 },
  secondary: { color: COLOR.textSecondary, textAlign: 'center' },
})

/** Rose world: one hue on this screen (`HueProvider`). */
export default function CrewInviteScreen() {
  return (
    <HueProvider value="rose">
      <CrewInviteScreenContent />
    </HueProvider>
  )
}

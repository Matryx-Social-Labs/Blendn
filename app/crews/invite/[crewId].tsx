import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { CrewRefusalSheet, type CrewRefusal } from '../../../components/crews/CrewRefusalSheet'
import { Avatar } from '../../../components/ds/Avatar'
import { Button } from '../../../components/ds/Button'
import { Chip } from '../../../components/ds/Chip'
import { CrewEmblem } from '../../../components/ds/CrewEmblem'
import { Grain } from '../../../components/ds/Grain'
import { Orbs } from '../../../components/ds/Orbs'
import { font, HueProvider, IC_HAIRLINE, useBoldText, useIncreaseContrast } from '../../../components/ds/shared'
import { StateScreen } from '../../../components/ds/StateScreen'
import { Toggle } from '../../../components/ds/Toggle'
import { TopBar } from '../../../components/ds/TopBar'
import { Icon } from '../../../components/ui/Icon'
import { useToast } from '../../../components/Toast'
import { useToastDock } from '../../../components/toastDock'
import { askCrewPush } from '../../../lib/crewPushAsk'
import { CONSENT_LINE, KEEP_ANONYMOUS_LABEL, crewMessage, type CrewInvite } from '../../../lib/crews'
import { crewsApi } from '../../../lib/crewsApi'
import { inviteWho } from '../../../lib/crewsScreens'
import { COLOR, ICON, RADIUS, SPACE } from '../../../lib/design/tokens'
import { H } from '../../../lib/haptics'
import { showSheet } from '../../../lib/sheet'
import { useAuth } from '../../../lib/useAuth'

type Load = { kind: 'loading' } | { kind: 'ready'; invite: CrewInvite } | { kind: 'notOpen' } | { kind: 'failed' }

const EMBLEM = 160
/** How long "Joined" shows before the chat opens. */
const JOINED_MS = 700
/** flow10.js `invite`: the anonymity line is the strong label at 15/20, a size the type roles do not have. */
// design-exception: flow10.js invite draws the keep-anonymous label at 15/20, between meta and body
const ANON_LABEL = { fontSize: 15, lineHeight: 20 } as const
const NOT_OPEN = 'This invite isn’t open any more'

/**
 * An invite received (Flow 10 · 10.3): what an invitee is given, and no more
 * (the emblem, name, bio, tags and who asked — never a member's name or photo;
 * the crew's page is members-only). The consent sentence and "keep me
 * anonymous" sit above Join, always on screen, and tapping Join is the
 * agreement: nothing is sent before it. Not now asks first, because declining
 * is final for 30 days; leaving by Back keeps the invite open. One 404 covers
 * lapsed, withdrawn, left and blocked.
 */
function CrewInviteScreenContent() {
  const { crewId: param } = useLocalSearchParams<{ crewId: string }>()
  const crewId = String(param)
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const { user } = useAuth()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [keepAnonymous, setKeepAnonymous] = useState(false)
  const [joining, setJoining] = useState(false)
  // The Android snackbar stands above the consent dock (the toast adds the bottom inset itself).
  const [dockHeight, setDockHeight] = useState(0)
  useToastDock(Math.max(0, dockHeight - insets.bottom))
  /** The server said yes: Join reads "Joined" for a beat, quiet, before the chat opens (R3-D10 #45). */
  const [joined, setJoined] = useState<{ chatGroupId: string; name: string } | null>(null)
  const [refusal, setRefusal] = useState<CrewRefusal | null>(null)
  /** One join or decline at a time: state lags a fast second tap by a render. */
  const inFlight = useRef(false)

  const read = useCallback(async () => {
    const result = await crewsApi.myCrews()
    if (!result.success || !result.data) return setLoad({ kind: 'failed' })
    const invite = result.data.invites.find((i) => i.crewId === crewId)
    setLoad(invite ? { kind: 'ready', invite } : { kind: 'notOpen' })
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
        <Orbs set="brand" />
        <Grain />
        <TopBar title="Crew invite" onBack={() => router.back()} testID="invite-top" />
        <View style={styles.state}>
          {load.kind === 'loading' ? (
            <Text accessibilityLabel="Loading the invite" style={[font('meta', bold), styles.secondary]}>
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
              actions={[{ label: 'Back to Crews', onPress: () => router.back() }]}
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
    router.back()
  }

  const confirmDecline = () =>
    showSheet({
      kind: 'actions',
      title: `Decline ${invite.name}?`,
      message: `${invite.invitedBy} isn’t told. They can’t ask you into this crew again for 30 days.`,
      actions: [
        { label: 'Decline', variant: 'destructive', then: () => void decline() },
        { label: 'Cancel', cancel: true },
      ],
    })

  const secondary = contrast ? COLOR.textPrimary : COLOR.textSecondary
  return (
    <View style={styles.container}>
      <Orbs set="brand" />
      <Grain />
      <TopBar title="Crew invite" onBack={() => router.back()} testID="invite-top" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <CrewEmblem seed={invite.emblemSeed} size={EMBLEM} />
          <Text accessibilityRole="header" style={[font('title', bold), styles.centre, styles.ink, styles.name]}>
            {invite.name}
          </Text>
          {invite.bio ? <Text style={[font('body', bold), styles.centre, { color: secondary }]}>{invite.bio}</Text> : null}
          {invite.tags.length ? (
            <View style={styles.tags}>
              {invite.tags.map((t) => (
                <Chip key={t.slug} label={t.label} variant="outline" />
              ))}
            </View>
          ) : null}
          <View accessible accessibilityLabel={inviteWho(invite)} style={styles.who}>
            {invite.invitedByPhoto ? <Avatar kind="photo" uri={invite.invitedByPhoto} size={24} ring={COLOR.ink} /> : null}
            <Text style={[font('meta', bold), styles.ink]}>{inviteWho(invite)}</Text>
          </View>
          <Text style={[font('meta', bold), styles.centre, styles.tertiary]}>You’ll see who’s in it once you join.</Text>
        </View>
      </ScrollView>
      <View
        testID="invite-dock"
        onLayout={(e) => setDockHeight(e.nativeEvent.layout.height)}
        style={[styles.dock, { paddingBottom: insets.bottom + SPACE.xl }]}
      >
        <View style={[styles.consent, contrast && IC_HAIRLINE]}>
          <View style={styles.consentLine}>
            <Icon name="eye" size={ICON.control} />
            <Text style={[font('meta', bold), styles.ink, styles.fill]}>{CONSENT_LINE}</Text>
          </View>
          <View style={styles.anon}>
            <Text style={[font('bodyStrong', bold), ANON_LABEL, styles.ink, styles.fill]}>{KEEP_ANONYMOUS_LABEL}</Text>
            <Toggle value={keepAnonymous} onValueChange={setKeepAnonymous} accessibilityLabel={KEEP_ANONYMOUS_LABEL} disabled={joining} />
          </View>
        </View>
        <Button
          label={joined ? 'Joined' : 'Join'}
          kind={joined ? 'secondary' : 'primary'}
          onPress={() => void join()}
          loading={joining}
          disabled={!!joined}
          refused={!!refusal}
          pressHaptic={false}
          testID="invite-join"
        />
        <Button label="Not now" kind="tertiary" onPress={confirmDecline} disabled={joining || !!joined} testID="invite-not-now" />
      </View>
      <CrewRefusalSheet refusal={refusal} onClose={() => setRefusal(null)} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.ink },
  state: { flex: 1, justifyContent: 'center', paddingHorizontal: SPACE.gutter },
  content: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.sm, paddingBottom: SPACE.lg, gap: SPACE.xl },
  hero: { alignItems: 'center', gap: SPACE.md },
  name: { marginTop: SPACE.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: SPACE.sm },
  who: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  consent: { borderRadius: RADIUS.sheet, backgroundColor: COLOR.surface, padding: SPACE.lg, gap: SPACE.md },
  consentLine: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md },
  anon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingTop: SPACE.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLOR.hairline,
  },
  dock: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.md, gap: SPACE.sm },
  fill: { flex: 1 },
  centre: { textAlign: 'center' },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary, textAlign: 'center' },
  tertiary: { color: COLOR.textTertiary },
})

/** Rose world: one hue on this screen (`HueProvider`). */
export default function CrewInviteScreen() {
  return (
    <HueProvider value="rose">
      <CrewInviteScreenContent />
    </HueProvider>
  )
}

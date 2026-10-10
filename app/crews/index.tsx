import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppHeader } from '../../components/AppHeader'
import { ConsentFields, CrewEmblem } from '../../components/crews/CrewParts'
import { LoadError } from '../../components/LoadError'
import ScalePress from '../../components/motion/ScalePress'
import { EmberButton } from '../../components/onboarding/EmberControls'
import { useToast } from '../../components/Toast'
import { PlaceholderBanner } from '../../components/ui/PlaceholderBanner'
import { Text } from '../../components/ui/Text'
import {
  consentBody,
  crewMessage,
  NO_CONSENT,
  sizeLine,
  visibleInvites,
  type ConsentState,
  type Crew,
  type CrewInvite,
} from '../../lib/crews'
import { crewsApi } from '../../lib/crewsApi'
import { showSheet } from '../../lib/sheet'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE } from '../../lib/theme'

type Row = { type: 'invite'; invite: CrewInvite } | { type: 'crew'; crew: Crew }

/**
 * Invites an accept answered 404 to, for this session: gone (lapsed, withdrawn,
 * the crew dissolved) and not offered again even if a read still lists one.
 */
const goneInvites = new Set<string>()

/**
 * Your crews, and the crew invites waiting for you (placeholder design —
 * docs/PLACEHOLDER_SCREENS.md §13).
 *
 * An invite is answered here. Accepting shows the consent first — joining a
 * crew is agreeing that anyone in it can reveal the crew — with the
 * "keep me anonymous" switch beside it, and nothing is sent until the person
 * ticks it. Declining tells nobody.
 */
export default function CrewsScreen() {
  const { showToast } = useToast()
  const [data, setData] = useState<{ crews: Crew[]; invites: CrewInvite[] } | null>(null)
  const [failed, setFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  /** The invite being accepted, and its consent so far. One at a time. */
  const [joining, setJoining] = useState<{ crewId: string; consent: ConsentState } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<{ crewId: string; text: string } | null>(null)
  /** One join or decline at a time: state lags a fast second tap by a render. */
  const inFlight = useRef(false)

  const load = useCallback(async () => {
    const result = await crewsApi.myCrews()
    if (result.success && result.data) {
      setData(result.data)
      setFailed(false)
    } else {
      setFailed(true)
    }
  }, [])

  // On focus: a crew you just left or made has to show as it is now.
  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const join = async (invite: CrewInvite) => {
    const agreed = joining && consentBody(joining.consent)
    if (!agreed || inFlight.current) return
    inFlight.current = true
    setBusy(invite.crewId)
    setRefusal(null)
    const result = await crewsApi.join(invite.crewId, agreed)
    inFlight.current = false
    setBusy(null)
    if (!result.success) {
      if (result.errorCode === 'NOT_FOUND') {
        // Gone: off the screen for the session, and the list re-read.
        goneInvites.add(invite.crewId)
        setJoining(null)
        showToast(crewMessage(result, 'join', 'That invite isn’t open any more.'), 'info')
        void load()
        return
      }
      setRefusal({ crewId: invite.crewId, text: crewMessage(result, 'join', 'Couldn’t join the crew. Try again.') })
      return
    }
    setJoining(null)
    showToast(`You're in ${invite.name}`, 'success')
    router.push({ pathname: '/crews/[crewId]', params: { crewId: invite.crewId } })
  }

  /*
   * Declining asks first: it is told to nobody, and for 30 days the same
   * invite is neither re-sent nor re-notified — a stray tap would cost a month.
   */
  const confirmDecline = (invite: CrewInvite) =>
    showSheet({
      kind: 'actions',
      title: `Decline ${invite.name}?`,
      message: `${invite.invitedBy} isn’t told. They can’t ask you into this crew again for 30 days.`,
      actions: [
        { label: 'Decline', variant: 'destructive', then: () => void decline(invite) },
        { label: 'Cancel', cancel: true },
      ],
    })

  const decline = async (invite: CrewInvite) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(invite.crewId)
    const result = await crewsApi.decline(invite.crewId)
    inFlight.current = false
    setBusy(null)
    if (!result.success && result.errorCode !== 'NOT_FOUND') {
      showToast(crewMessage(result, 'join', 'Couldn’t decline. Try again.'), 'error')
      return
    }
    // Nobody is told, and a gone invite is as good as declined.
    setData((d) => (d ? { ...d, invites: d.invites.filter((i) => i.crewId !== invite.crewId) } : d))
  }

  const rows: Row[] = [
    ...visibleInvites(data?.invites ?? [], goneInvites).map((invite) => ({ type: 'invite' as const, invite })),
    ...(data?.crews ?? []).map((crew) => ({ type: 'crew' as const, crew })),
  ]

  const openNew = () => router.push('/crews/new')

  const empty = failed ? (
    <LoadError title="Your crews didn't load" onRetry={() => void onRefresh()} retrying={refreshing} />
  ) : data ? (
    <View style={styles.empty}>
      <Ionicons name="people-circle-outline" size={ICON.lg} color={EMBER.textTertiary} />
      <Text variant="title" style={styles.center}>
        No crews yet
      </Text>
      <Text variant="body" color={EMBER.textSecondary} style={styles.center}>
        A crew is the friends you go out with. Make one from your friends, and match with other crews on the night.
      </Text>
      <EmberButton label="Make a crew" onPress={openNew} />
    </View>
  ) : null

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <AppHeader
        title="Crews"
        onBack={() => router.back()}
        rightIconButton={{ name: 'add', onPress: openNew, accessibilityLabel: 'Make a crew' }}
      />
      <FlatList
        data={rows}
        keyExtractor={(r) => `${r.type}:${r.type === 'invite' ? r.invite.crewId : r.crew.crewId}`}
        ListHeaderComponent={<PlaceholderBanner />}
        renderItem={({ item }) =>
          item.type === 'invite' ? (
            <InviteRow
              invite={item.invite}
              consent={joining?.crewId === item.invite.crewId ? joining.consent : null}
              busy={busy === item.invite.crewId}
              refusal={refusal?.crewId === item.invite.crewId ? refusal.text : null}
              onAccept={() => setJoining({ crewId: item.invite.crewId, consent: NO_CONSENT })}
              onConsent={(consent) => setJoining({ crewId: item.invite.crewId, consent })}
              onJoin={() => void join(item.invite)}
              onDecline={() => confirmDecline(item.invite)}
            />
          ) : (
            <CrewRow crew={item.crew} />
          )
        }
        contentContainerStyle={rows.length ? styles.list : styles.emptyList}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        ListEmptyComponent={empty}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={EMBER.textSecondary} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
    </SafeAreaView>
  )
}

function CrewRow({ crew }: { crew: Crew }) {
  return (
    <ScalePress
      onPress={() => router.push({ pathname: '/crews/[crewId]', params: { crewId: crew.crewId } })}
      haptic={false}
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${crew.name}, ${sizeLine(crew.size)}`}
      style={styles.row}
    >
      <CrewEmblem seed={crew.emblemSeed} size={CONTROL.md} />
      <View style={styles.rowText}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {crew.name}
        </Text>
        <Text variant="meta">{sizeLine(crew.size)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={ICON.sm} color={EMBER.textSecondary} />
    </ScalePress>
  )
}

function InviteRow({
  invite,
  consent,
  busy,
  refusal,
  onAccept,
  onConsent,
  onJoin,
  onDecline,
}: {
  invite: CrewInvite
  /** Non-null once Accept was tapped: the consent is on screen. */
  consent: ConsentState | null
  busy: boolean
  refusal: string | null
  onAccept: () => void
  onConsent: (next: ConsentState) => void
  onJoin: () => void
  onDecline: () => void
}) {
  return (
    <View style={styles.invite}>
      <View style={styles.row}>
        <CrewEmblem seed={invite.emblemSeed} size={CONTROL.md} />
        <View style={styles.rowText}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {invite.name}
          </Text>
          <Text variant="meta">
            {invite.invitedBy} asked you · {sizeLine(invite.size)}
          </Text>
        </View>
      </View>
      {invite.bio ? <Text variant="body">{invite.bio}</Text> : null}
      {consent ? (
        <>
          <ConsentFields value={consent} onChange={onConsent} />
          <EmberButton label={`Join ${invite.name}`} onPress={onJoin} disabled={!consent.consented} busy={busy} />
        </>
      ) : (
        <View style={styles.inviteActions}>
          <EmberButton label="Accept" onPress={onAccept} style={styles.flex} />
          <EmberButton label="Decline" variant="secondary" onPress={onDecline} disabled={busy} style={styles.flex} />
        </View>
      )}
      {refusal ? (
        <Text variant="meta" color={EMBER.textPrimary} accessibilityLiveRegion="polite">
          {refusal}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  flex: { flex: 1 },
  list: { paddingHorizontal: GUTTER, paddingBottom: SPACE.xxl, gap: SPACE.lg },
  emptyList: { flexGrow: 1, paddingHorizontal: GUTTER },
  gap: { height: SPACE.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.sm },
  rowText: { flex: 1, gap: SPACE.xxs },
  invite: { gap: SPACE.md, padding: SPACE.lg, borderRadius: EMBER_RADIUS.md, backgroundColor: EMBER.surface },
  inviteActions: { flexDirection: 'row', gap: SPACE.md },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.lg, paddingVertical: SPACE.xxxl },
  center: { textAlign: 'center' },
})

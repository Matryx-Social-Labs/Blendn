import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppHeader } from '../../components/AppHeader'
import { Face } from '../../components/blendn/Face'
import { CrewEmblem, FriendPickRow } from '../../components/crews/CrewParts'
import { LoadError } from '../../components/LoadError'
import { EmberButton, EmberFieldGroup, EmberToggle } from '../../components/onboarding/EmberControls'
import { useToast } from '../../components/Toast'
import { PlaceholderBanner } from '../../components/ui/PlaceholderBanner'
import { Text } from '../../components/ui/Text'
import { apiClient } from '../../lib/apiClient'
import {
  CONSENT_LINE,
  CREW_GONE_LINE,
  CREW_MAX_MEMBERS,
  KEEP_ANONYMOUS_HELPER,
  KEEP_ANONYMOUS_LABEL,
  crewMessage,
  hereLine,
  invitedLine,
  sizeLine,
  type Crew,
} from '../../lib/crews'
import { crewsApi } from '../../lib/crewsApi'
import type { Friend } from '../../lib/friends'
import { showSheet } from '../../lib/sheet'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, SPACE } from '../../lib/theme'
import { useAuth } from '../../lib/useAuth'

type Load = { kind: 'loading' } | { kind: 'ready'; crew: Crew } | { kind: 'gone' } | { kind: 'error' }

/**
 * One of your crews (placeholder design — docs/PLACEHOLDER_SCREENS.md §13).
 *
 * Inside a crew people are named — first name and one photo — because they
 * are friends and each joined by consent. From here: the crew chat, inviting
 * more friends, "We're here", your own "keep me anonymous", and leaving.
 */
export default function CrewScreen() {
  const params = useLocalSearchParams<{ crewId: string; asked?: string }>()
  const crewId = String(params.crewId)
  const { user } = useAuth()
  const myId = user?.id ?? ''
  const { showToast } = useToast()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [refreshing, setRefreshing] = useState(false)
  /** "Asked 3 friends" — the count you asked for, from the screen that made the crew or the last invite. */
  const [asked, setAsked] = useState<string | null>(() => invitedLine(Number(params.asked)))
  const [line, setLine] = useState<string | null>(null)
  const [busy, setBusy] = useState<'here' | 'anon' | 'invite' | 'solo' | null>(null)
  const [inviting, setInviting] = useState<{ friends: Friend[]; picked: string[] } | null>(null)

  const fetchCrew = useCallback(async () => {
    const result = await crewsApi.crew(crewId)
    if (result.success && result.data) setLoad({ kind: 'ready', crew: result.data })
    // One 404 for gone, left, dissolved or never yours.
    else setLoad(result.errorCode === 'NOT_FOUND' ? { kind: 'gone' } : { kind: 'error' })
  }, [crewId])

  useFocusEffect(
    useCallback(() => {
      void fetchCrew()
    }, [fetchCrew])
  )

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchCrew()
    setRefreshing(false)
  }

  if (load.kind !== 'ready') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <AppHeader title="Crew" onBack={() => router.back()} />
        <View style={styles.centred}>
          {load.kind === 'gone' ? (
            <Text variant="bodyStrong">{CREW_GONE_LINE}</Text>
          ) : load.kind === 'error' ? (
            <LoadError title="This crew didn't load" onRetry={() => void onRefresh()} retrying={refreshing} />
          ) : (
            <Text variant="meta">Loading…</Text>
          )}
        </View>
      </SafeAreaView>
    )
  }

  const crew = load.crew
  const memberIds = new Set(crew.members.map((m) => m.userId))

  const openChat = () => {
    if (!crew.chatGroupId) return
    router.push({
      pathname: '/chat/[id]',
      params: { id: crew.chatGroupId, roomName: crew.name, kind: 'crew', crewId: crew.crewId } as never,
    })
  }

  /*
   * "We're here" names the event you are checked in at now. It checks nobody
   * else in: each member checks in by their own GPS.
   */
  const here = async () => {
    if (busy) return
    setBusy('here')
    setLine(null)
    const active = await apiClient.getActiveCheckins({ force: true })
    const eventId = active.success ? active.data?.checkIns?.[0]?.eventId : undefined
    if (!eventId) {
      setBusy(null)
      setLine('Check in at the event first — each of you checks in with your own location.')
      return
    }
    const result = await crewsApi.here(crew.crewId, eventId)
    setBusy(null)
    setLine(result.success && result.data ? hereLine(result.data) : crewMessage(result, 'crew', 'Couldn’t tell your crew. Try again.'))
  }

  const setAnonymous = async (next: boolean) => {
    if (busy) return
    setBusy('anon')
    const result = await crewsApi.setKeepMeAnonymous(crew.crewId, myId, next)
    setBusy(null)
    if (!result.success || !result.data) {
      showToast(crewMessage(result, 'crew', 'Couldn’t save that. Try again.'), 'error')
      return
    }
    const keep = result.data.keepMeAnonymous
    setLoad({ kind: 'ready', crew: { ...crew, you: crew.you ? { ...crew.you, keepMeAnonymous: keep } : crew.you } })
  }

  /** The owner's "Room for one more": what lets the crew like one person who is open to crews. */
  const setOpenToSolo = async (next: boolean) => {
    if (busy) return
    setBusy('solo')
    const result = await crewsApi.update(crew.crewId, { openToSolo: next })
    setBusy(null)
    if (!result.success || !result.data) {
      showToast(crewMessage(result, 'crew', 'Couldn’t save that. Try again.'), 'error')
      return
    }
    setLoad({ kind: 'ready', crew: result.data })
  }

  const startInvite = async () => {
    const result = await apiClient.getFriends()
    const friends = result.success && result.data ? result.data.friends.filter((f) => !memberIds.has(f.userId)) : []
    setInviting({ friends, picked: [] })
  }

  const sendInvites = async () => {
    if (!inviting || inviting.picked.length === 0 || busy) return
    setBusy('invite')
    const result = await crewsApi.invite(crew.crewId, inviting.picked)
    setBusy(null)
    if (!result.success || !result.data) {
      showToast(crewMessage(result, 'crew', 'Couldn’t send the invites. Try again.'), 'error')
      return
    }
    setInviting(null)
    setAsked(invitedLine(result.data.invited))
  }

  const confirmLeave = () =>
    showSheet({
      kind: 'actions',
      title: `Leave ${crew.name}?`,
      message: 'You’ll leave its chat and its Blends. Coming back needs an invite from someone in it.',
      actions: [
        {
          label: 'Leave crew',
          variant: 'destructive',
          run: async () => {
            const result = await crewsApi.leave(crew.crewId, myId)
            if (!result.success) return { ok: false, error: crewMessage(result, 'crew', 'Couldn’t leave. Try again.') }
            router.back()
            return { ok: true, toast: result.data?.dissolved ? `${crew.name} has ended` : `You left ${crew.name}` }
          },
        },
        { label: 'Cancel', cancel: true },
      ],
    })

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <AppHeader title={crew.name} onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={EMBER.textSecondary} />}
      >
        <PlaceholderBanner />
        <View style={styles.head}>
          <CrewEmblem seed={crew.emblemSeed} size={CONTROL.lg} />
          <View style={styles.flex}>
            <Text variant="title" numberOfLines={2}>
              {crew.name}
            </Text>
            <Text variant="meta">{sizeLine(crew.size)}</Text>
          </View>
        </View>
        {crew.bio ? <Text variant="body">{crew.bio}</Text> : null}
        {asked ? <Text variant="meta">{asked}</Text> : null}

        <EmberButton label="Open crew chat" onPress={openChat} disabled={!crew.chatGroupId} />
        <EmberButton label="We’re here" variant="secondary" onPress={() => void here()} busy={busy === 'here'} />
        {line ? (
          <Text variant="body" accessibilityLiveRegion="polite">
            {line}
          </Text>
        ) : null}

        <EmberFieldGroup label="In the crew">
          <View style={styles.members}>
            {crew.members.map((m) => (
              <View key={m.userId} style={styles.member}>
                <Face name={m.name} photo={m.photo} size={CONTROL.md} />
                <Text variant="bodyStrong" style={styles.flex} numberOfLines={1}>
                  {m.userId === myId ? 'You' : m.name}
                </Text>
                {m.role === 'owner' ? <Text variant="meta">Started it</Text> : null}
              </View>
            ))}
          </View>
        </EmberFieldGroup>

        {crew.size < CREW_MAX_MEMBERS ? (
          inviting ? (
            <EmberFieldGroup label="Invite friends" helper="Nobody is told who else was asked.">
              {inviting.friends.length === 0 ? (
                <Text variant="meta">Every friend of yours is in this crew, or you have none to ask yet.</Text>
              ) : (
                inviting.friends.map((f) => (
                  <FriendPickRow
                    key={f.userId}
                    person={f}
                    picked={inviting.picked.includes(f.userId)}
                    onToggle={() =>
                      setInviting((s) =>
                        s && {
                          ...s,
                          picked: s.picked.includes(f.userId) ? s.picked.filter((id) => id !== f.userId) : [...s.picked, f.userId],
                        }
                      )
                    }
                  />
                ))
              )}
              <EmberButton
                label={inviting.picked.length ? `Ask ${inviting.picked.length}` : 'Pick friends to ask'}
                onPress={() => void sendInvites()}
                disabled={inviting.picked.length === 0}
                busy={busy === 'invite'}
                style={styles.inviteButton}
              />
            </EmberFieldGroup>
          ) : (
            <EmberButton label="Invite friends" variant="secondary" onPress={() => void startInvite()} />
          )
        ) : null}

        {crew.you?.role === 'owner' ? (
          <EmberToggle
            label="Room for one more"
            helper="Somebody on their own who’s open to a crew can match with you — only while you’re 6 or fewer."
            value={crew.openToSolo}
            onValueChange={(next) => void setOpenToSolo(next)}
          />
        ) : null}

        <View style={styles.privacy}>
          <Text variant="meta">{CONSENT_LINE}</Text>
          <EmberToggle
            label={KEEP_ANONYMOUS_LABEL}
            helper={KEEP_ANONYMOUS_HELPER}
            value={crew.you?.keepMeAnonymous ?? false}
            onValueChange={(next) => void setAnonymous(next)}
          />
        </View>

        <EmberButton label="Leave crew" variant="secondary" onPress={confirmLeave} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  flex: { flex: 1 },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: GUTTER },
  content: { paddingHorizontal: GUTTER, paddingBottom: SPACE.xxxl, gap: SPACE.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg },
  members: { gap: SPACE.md },
  member: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  inviteButton: { marginTop: SPACE.md },
  privacy: { gap: SPACE.md, padding: SPACE.lg, borderRadius: EMBER_RADIUS.md, backgroundColor: EMBER.surfaceSunken },
})

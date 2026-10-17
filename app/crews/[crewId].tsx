import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useState, type ReactNode } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'

import { CrewHead } from '../../components/crews/CrewHead'
import { CrewMembers } from '../../components/crews/CrewMembers'
import { EditCrewSheet } from '../../components/crews/EditCrewSheet'
import { InviteFriendsSheet } from '../../components/crews/InviteFriendsSheet'
import { OverflowMenu } from '../../components/crews/OverflowMenu'
import { RowsCard } from '../../components/crews/RowsCard'
import { Banner } from '../../components/ds/Banner'
import { Button } from '../../components/ds/Button'
import { SectionHeader } from '../../components/ds/SectionHeader'
import { SettingsRow } from '../../components/ds/SettingsRow'
import { font, useBoldText } from '../../components/ds/shared'
import { StateScreen } from '../../components/ds/StateScreen'
import { TopBar } from '../../components/ds/TopBar'
import { SkeletonBlock } from '../../components/Skeleton'
import { useToast } from '../../components/Toast'
import { apiClient } from '../../lib/apiClient'
import {
  CREW_GONE_LINE,
  CREW_MAX_MEMBERS,
  CREW_REPORT_REASONS,
  KEEP_ANONYMOUS_LABEL,
  crewMessage,
  friendsToInvite,
  type Crew,
  type CrewMember,
  type CrewReportReason,
} from '../../lib/crews'
import { crewsApi, type CrewPatch } from '../../lib/crewsApi'
import { leaveSheet, removeSheet, textFieldOf } from '../../lib/crewsScreens'
import { COLOR, RADIUS, SPACE } from '../../lib/design/tokens'
import type { Friend } from '../../lib/friends'
import { isMuted, rememberRoomMute, useRoomMute } from '../../lib/roomMembership'
import { useRoomRow } from '../../lib/roomRow'
import { showSheet } from '../../lib/sheet'
import { useAuth } from '../../lib/useAuth'
import { userMessage } from '../../lib/userMessage'

type Load = { kind: 'loading' } | { kind: 'ready'; crew: Crew } | { kind: 'gone' } | { kind: 'error' }

/** flow10.js `detail`: the sections sit 20 apart. */
// design-exception: the frame's column gap is 20, between the 16 and 24 steps
const SECTION_GAP = 20
const HEAD_SKELETON = 160
const LEAVE_HEIGHT = 56
const HIDDEN_LINE = 'This crew is hidden while we look at a report. Only its members can see it.'
const REPORT_SENT = 'Reported. Thanks — nobody is told it was you.'

/**
 * One of your crews (Flow 10 · 10.4): the emblem, name, line and tags; the
 * members by first name and photo; Invite friends; your settings (keep me
 * anonymous, mute the chat); and Leave. The owner also gets Edit crew and a ⋯
 * on each member to remove them. People are named here because they are
 * friends who joined by consent; the crew chat is the existing room screen.
 */
export default function CrewScreen() {
  const params = useLocalSearchParams<{ crewId: string; fromChat?: string }>()
  const crewId = String(params.crewId)
  const { user } = useAuth()
  const myId = user?.id ?? ''
  const bold = useBoldText()
  const { showToast } = useToast()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState<'anon' | 'mute' | 'invite' | 'edit' | null>(null)
  const [menu, setMenu] = useState(false)
  const [inviting, setInviting] = useState<{ friends: Friend[] | null | 'failed' } | null>(null)
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState<{ field: 'name' | 'bio'; text: string } | null>(null)

  const crew = load.kind === 'ready' ? load.crew : null
  const owner = crew?.you?.role === 'owner'
  // The room's own row fills the mute store; every screen reads the one answer.
  useRoomRow(crew?.chatGroupId ?? null)
  const muted = isMuted(useRoomMute(crew?.chatGroupId ?? null))

  const fetchCrew = useCallback(async () => {
    const result = await crewsApi.crew(crewId)
    if (result.success && result.data) setLoad({ kind: 'ready', crew: result.data })
    // One 404 for gone, left, dissolved or never yours.
    else if (result.errorCode === 'NOT_FOUND') setLoad({ kind: 'gone' })
    // A failed refresh keeps the crew it had.
    else setLoad((prev) => (prev.kind === 'ready' ? prev : { kind: 'error' }))
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

  /** A change to this crew, applied to the crew as it is now — never to the one this render saw. */
  const patchCrew = (change: (c: Crew) => Crew) =>
    setLoad((prev) => (prev.kind === 'ready' ? { kind: 'ready', crew: change(prev.crew) } : prev))

  const setAnonymous = async (next: boolean) => {
    if (busy || !myId) return
    setBusy('anon')
    const result = await crewsApi.setKeepMeAnonymous(crewId, myId, next)
    setBusy(null)
    if (!result.success || !result.data) return showToast(crewMessage(result, 'crew', 'Couldn’t save that. Try again.'), 'error')
    const keep = result.data.keepMeAnonymous
    patchCrew((c) => ({ ...c, you: c.you ? { ...c.you, keepMeAnonymous: keep } : c.you }))
  }

  const setMuted = async (next: boolean) => {
    const roomId = crew?.chatGroupId
    if (busy || !roomId) return
    setBusy('mute')
    const result = next ? await apiClient.muteChatGroup(roomId, null) : await apiClient.unmuteChatGroup(roomId)
    setBusy(null)
    if (!result.success || !result.data) return showToast(userMessage(result, 'Couldn’t save that. Try again.'), 'error')
    rememberRoomMute(roomId, result.data.mute)
  }

  /*
   * Friends not already in the crew. The crew names members by their room
   * handles, never their ids, so a crewmate is found by the server's
   * `isFriend` and their name and photo (`friendsToInvite`). A failed read is
   * not "none to ask": it says so and offers the retry.
   */
  const startInvite = async () => {
    if (!crew) return
    setInviting({ friends: null })
    const result = await apiClient.getFriends()
    const friends = result.success && result.data ? friendsToInvite(result.data.friends, crew.members) : ('failed' as const)
    setInviting({ friends })
  }

  const sendInvites = async (userIds: string[]) => {
    if (busy) return
    setBusy('invite')
    const result = await crewsApi.invite(crewId, userIds)
    setBusy(null)
    if (!result.success || !result.data) return showToast(crewMessage(result, 'crew', 'Couldn’t send the invites. Try again.'), 'error')
    setInviting(null)
    // `invited` is how many you asked for, never who got one.
    showToast(result.data.invited === 1 ? 'Asked 1 friend' : `Asked ${result.data.invited} friends`, 'success')
  }

  const saveEdit = async (patch: CrewPatch) => {
    if (busy) return
    setBusy('edit')
    setEditError(null)
    const result = await crewsApi.update(crewId, patch)
    setBusy(null)
    if (!result.success || !result.data) {
      const text = crewMessage(result, 'crew', 'Couldn’t save that. Try again.')
      const field = textFieldOf(text)
      if (field) setEditError({ field, text })
      else showToast(text, 'error')
      return
    }
    const fresh = result.data
    patchCrew(() => fresh)
    setEditing(false)
  }

  const confirmLeave = () => {
    if (!crew) return
    const sheet = leaveSheet(crew)
    showSheet({
      kind: 'actions',
      icon: 'log-out',
      title: sheet.title,
      message: sheet.message,
      actions: [
        {
          label: sheet.action,
          variant: 'destructive',
          run: async () => {
            if (!myId) return { ok: false, error: 'Couldn’t leave. Try again.' }
            const result = await crewsApi.leave(crewId, myId)
            if (!result.success) return { ok: false, error: crewMessage(result, 'crew', 'Couldn’t leave. Try again.') }
            // From the chat, two screens go: the chat of a crew you left has nothing to show.
            if (params.fromChat) router.dismissTo('/crews')
            else router.back()
            return { ok: true, toast: result.data?.dissolved ? `${crew.name} has closed` : `You left ${crew.name}` }
          },
        },
        { label: 'Cancel', cancel: true },
      ],
    })
  }

  const confirmRemove = (member: CrewMember) => {
    if (!crew) return
    const sheet = removeSheet(crew, member.name)
    showSheet({
      kind: 'actions',
      icon: 'user-minus',
      title: sheet.title,
      message: sheet.message,
      actions: [
        {
          label: 'Remove',
          variant: 'destructive',
          run: async () => {
            // A member is named by their handle in the crew's room, as the crew sent it.
            const result = await crewsApi.leave(crewId, member.userId)
            if (!result.success) return { ok: false, error: crewMessage(result, 'crew', 'Couldn’t remove them. Try again.') }
            void fetchCrew()
            return { ok: true, toast: `${member.name} was removed` }
          },
        },
        { label: 'Cancel', cancel: true },
      ],
    })
  }

  const report = () => {
    if (!crew) return
    showSheet({
      kind: 'reasons',
      title: `Report ${crew.name}`,
      message: 'Only the crew’s name and bio are reported. Our team is not told who sent it, and the crew isn’t either.',
      reasons: CREW_REPORT_REASONS.map((r) => ({ value: r.value, label: r.label })),
      submitLabel: 'Send report',
      run: async (reason, note) => {
        const result = await crewsApi.report(crewId, { reason: reason as CrewReportReason, ...(note ? { description: note } : {}) })
        if (!result.success) return { ok: false, error: crewMessage(result, 'crew', 'Couldn’t send the report. Try again.') }
        return { ok: true, toast: REPORT_SENT }
      },
    })
  }

  const openChat = () => {
    if (!crew?.chatGroupId) return
    router.push({
      pathname: '/chat/[id]',
      params: { id: crew.chatGroupId, roomName: crew.name, kind: 'crew', crewId },
    } as never)
  }

  let body: ReactNode
  if (!crew) {
    body =
      load.kind === 'gone' ? (
        <StateScreen
          icon="users"
          title={CREW_GONE_LINE}
          actions={[{ label: 'Back', kind: 'secondary', onPress: () => router.back() }]}
          testID="crew-gone"
        />
      ) : load.kind === 'error' ? (
        <StateScreen
          icon="cloud-off"
          title="This crew didn’t load"
          body="Check your connection and try again."
          actions={[{ label: 'Try again', onPress: () => void onRefresh(), loading: refreshing }]}
          testID="crew-failed"
        />
      ) : (
        <View style={styles.skeleton} accessibilityLabel="Loading the crew">
          <SkeletonBlock width={HEAD_SKELETON} height={HEAD_SKELETON} borderRadius={RADIUS.card} />
        </View>
      )
  } else {
    body = (
      <>
        {crew.hidden ? <Banner kind="info" text={HIDDEN_LINE} testID="crew-hidden" /> : null}
        <CrewHead crew={crew} />
        {!params.fromChat && crew.chatGroupId ? <Button kind="secondary" label="Open crew chat" onPress={openChat} testID="crew-open-chat" /> : null}
        <View style={styles.section}>
          <SectionHeader title="Members" count={crew.members.length} />
          <CrewMembers
            members={crew.members}
            myId={myId}
            isOwner={owner}
            canInvite={crew.size < CREW_MAX_MEMBERS}
            apart={crew.apart === true}
            onInvite={() => void startInvite()}
            onMore={confirmRemove}
          />
        </View>
        <View style={styles.section}>
          <SectionHeader title="Your settings" />
          <RowsCard testID="crew-settings">
            <SettingsRow
              icon="eye-off"
              title={KEEP_ANONYMOUS_LABEL}
              trail="switch"
              value={crew.you?.keepMeAnonymous ?? false}
              onValueChange={(next) => void setAnonymous(next)}
              busy={busy === 'anon'}
              disabled={busy === 'anon'}
            />
            <SettingsRow
              icon="bell-off"
              title="Mute the crew chat"
              trail="switch"
              value={muted}
              onValueChange={(next) => void setMuted(next)}
              busy={busy === 'mute'}
              disabled={busy === 'mute' || !crew.chatGroupId}
            />
            {owner ? (
              <SettingsRow
                icon="pencil"
                title="Edit crew"
                hint="Name, bio, vibe, Room for one more"
                trail="chevron"
                onPress={() => {
                  setEditError(null)
                  setEditing(true)
                }}
              />
            ) : null}
          </RowsCard>
        </View>
        <Pressable onPress={confirmLeave} accessibilityRole="button" accessibilityLabel="Leave crew" style={styles.leave}>
          <Text style={[font('button', bold), styles.destructive]}>Leave crew</Text>
        </Pressable>
      </>
    )
  }

  return (
    <View style={styles.container}>
      <TopBar
        title=""
        onBack={() => router.back()}
        actions={crew ? [{ icon: 'ellipsis', label: 'More', onPress: () => setMenu(true) }] : []}
        testID="crew-top"
      />
      <ScrollView
        testID="crew-scroll"
        contentContainerStyle={[styles.content, crew ? null : styles.centred]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOR.textSecondary} />}
        showsVerticalScrollIndicator={false}
      >
        {body}
      </ScrollView>
      {crew ? (
        <>
          <OverflowMenu
            testID="crew-menu"
            visible={menu}
            onClose={() => setMenu(false)}
            items={[
              { icon: 'flag', label: 'Report this crew’s name or bio', onPress: report },
              { icon: 'log-out', label: 'Leave crew', onPress: confirmLeave, destructive: true },
            ]}
          />
          <InviteFriendsSheet
            visible={!!inviting}
            friends={inviting?.friends ?? null}
            room={CREW_MAX_MEMBERS - crew.size}
            asking={busy === 'invite'}
            onRetry={() => void startInvite()}
            onAsk={(ids) => void sendInvites(ids)}
            onClose={() => setInviting(null)}
          />
          {owner ? (
            <EditCrewSheet
              visible={editing}
              crew={crew}
              saving={busy === 'edit'}
              serverError={editError}
              onSave={(patch) => void saveEdit(patch)}
              onClose={() => setEditing(false)}
            />
          ) : null}
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.ink },
  content: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.sm, paddingBottom: SPACE.xxl, gap: SECTION_GAP },
  centred: { flexGrow: 1, justifyContent: 'center' },
  skeleton: { alignItems: 'center' },
  section: { gap: SPACE.md },
  leave: { minHeight: LEAVE_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  destructive: { color: COLOR.destructive },
})

import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import Animated from 'react-native-reanimated'

import { CrewHead } from '../../components/crews/CrewHead'
import { CrewMembers } from '../../components/crews/CrewMembers'
import { EditCrewSheet } from '../../components/crews/EditCrewSheet'
import { InviteFriendsSheet } from '../../components/crews/InviteFriendsSheet'
import { OverflowMenu } from '../../components/crews/OverflowMenu'
import { RowsCard } from '../../components/crews/RowsCard'
import { Banner } from '../../components/ds/Banner'
import { SectionHeader } from '../../components/ds/SectionHeader'
import { SettingsRow } from '../../components/ds/SettingsRow'
import { font, HueProvider, useBoldText } from '../../components/ds/shared'
import { StateScreen } from '../../components/ds/StateScreen'
import { GoneCard } from '../../components/system/GoneCard'
import { TopBar, type TopBarState } from '../../components/ds/TopBar'
import { useSkeletonCrossfade } from '../../components/motion/useSkeletonCrossfade'
import { SkeletonBlock } from '../../components/Skeleton'
import { useToast } from '../../components/Toast'
import { apiClient } from '../../lib/apiClient'
import {
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
import { crewBarState, leaveSheet, removeSheet, textFieldOf } from '../../lib/crewsScreens'
import { COLOR, RADIUS, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { FRIEND_SEARCH_OFFER } from '../../lib/friendsPaging'
import { pickerView, useFriendsList } from '../../lib/useFriendsList'
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
/** The head's name and line, and the two rows under them. */
const SKELETON_NAME = 200
const SKELETON_NAME_H = 24
const SKELETON_LINE = 260
const SKELETON_LINE_H = 17
const SKELETON_ROW = 56
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
function CrewScreenContent() {
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
  // The bar's glass and the crew's name in it follow the scroll: a render per threshold crossing, never per frame.
  const [barState, setBarState] = useState<TopBarState>('rest')
  const barRef = useRef<TopBarState>('rest')
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = crewBarState(e.nativeEvent.contentOffset.y)
    if (next !== barRef.current) {
      barRef.current = next
      setBarState(next)
    }
  }
  // Your friends for the invite sheet, a page at a time; `inviting` is only whether the sheet is open.
  const friendList = useFriendsList()
  const [inviting, setInviting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState<{ field: 'name' | 'bio'; text: string } | null>(null)

  const crew = load.kind === 'ready' ? load.crew : null
  // The page fades in over the skeleton only if a skeleton was drawn (a load under 300 ms just shows the page).
  const arrive = useSkeletonCrossfade(load.kind === 'loading')
  const owner = crew?.you?.role === 'owner'
  // The friends not already in the crew, of the pages read so far.
  const members = crew?.members
  const invitable = useMemo(
    () => pickerView(friendList.status, members ? friendsToInvite(friendList.friends, members) : friendList.friends),
    [friendList.status, friendList.friends, members]
  )
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
    if (!result.success || !result.data) return showToast(crewMessage(result, 'crew', 'Couldn’t save that. Try again.'), 'error', { haptic: 'error' })
    const keep = result.data.keepMeAnonymous
    patchCrew((c) => ({ ...c, you: c.you ? { ...c.you, keepMeAnonymous: keep } : c.you }))
  }

  const setMuted = async (next: boolean) => {
    const roomId = crew?.chatGroupId
    if (busy || !roomId) return
    setBusy('mute')
    const result = next ? await apiClient.muteChatGroup(roomId, null) : await apiClient.unmuteChatGroup(roomId)
    setBusy(null)
    if (!result.success || !result.data) return showToast(userMessage(result, 'Couldn’t save that. Try again.'), 'error', { haptic: 'error' })
    rememberRoomMute(roomId, result.data.mute)
  }

  /*
   * Friends not already in the crew. The crew names members by their room
   * handles, never their ids, so a crewmate is found by the server's
   * `isFriend` and their name and photo (`friendsToInvite`). A failed read is
   * not "none to ask": it says so and offers the retry.
   */
  const startInvite = () => {
    if (!crew) return
    setInviting(true)
    void friendList.refresh('reset')
  }

  const sendInvites = async (userIds: string[]) => {
    if (busy) return
    setBusy('invite')
    const result = await crewsApi.invite(crewId, userIds)
    setBusy(null)
    if (!result.success || !result.data) return showToast(crewMessage(result, 'crew', 'Couldn’t send the invites. Try again.'), 'error', { haptic: 'error' })
    setInviting(false)
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
      const field = textFieldOf(text, result.field)
      if (field) setEditError({ field, text })
      else showToast(text, 'error', { haptic: 'error' })
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
      hue: 'rose',
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
      hue: 'rose',
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
      hue: 'rose',
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

  let body: ReactNode
  if (!crew) {
    body =
      load.kind === 'gone' ? (
        <GoneCard kind="crew" onBack={() => router.back()} testID="crew-gone" />
      ) : load.kind === 'error' ? (
        <StateScreen
          icon="cloud-off"
          title="This crew didn’t load"
          body="Check your connection and try again."
          actions={[{ label: 'Try again', onPress: () => void onRefresh(), loading: refreshing }]}
          testID="crew-failed"
        />
      ) : (
        <View style={styles.skeletonPage} accessibilityLabel="Loading the crew">
          {/* The page's own shape (DS #17): the emblem, the name, a line, then two rows. */}
          <View style={styles.skeleton}>
            <SkeletonBlock width={HEAD_SKELETON} height={HEAD_SKELETON} borderRadius={RADIUS.card} />
          </View>
          <View style={styles.skeleton}>
            <SkeletonBlock width={SKELETON_NAME} height={SKELETON_NAME_H} borderRadius={RADIUS.thumb} />
          </View>
          <View style={styles.skeleton}>
            <SkeletonBlock width={SKELETON_LINE} height={SKELETON_LINE_H} borderRadius={RADIUS.thumb} />
          </View>
          <SkeletonBlock height={SKELETON_ROW} borderRadius={RADIUS.sheet} />
          <SkeletonBlock height={SKELETON_ROW} borderRadius={RADIUS.sheet} />
        </View>
      )
  } else {
    body = (
      <Animated.View entering={arrive} style={styles.page}>
        {crew.hidden ? <Banner kind="info" text={HIDDEN_LINE} testID="crew-hidden" /> : null}
        <CrewHead crew={crew} />
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
                // The fields it edits (D-L14); "Room for one more" is a setting, not a field.
                hint="Name, bio, vibe"
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
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.button} style={[font('button', bold), styles.destructive]}>Leave crew</Text>
        </Pressable>
      </Animated.View>
    )
  }

  return (
    <View style={styles.container}>
      <TopBar
        title={crew && barState === 'condensed' ? crew.name : ''}
        state={barState}
        onBack={() => router.back()}
        actions={crew ? [{ icon: 'ellipsis', label: 'More', onPress: () => setMenu(true) }] : []}
        testID="crew-top"
      />
      <ScrollView
        testID="crew-scroll"
        onScroll={onScroll}
        scrollEventThrottle={16}
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
            visible={inviting}
            friends={invitable}
            search={{ query: friendList.query, onChange: friendList.search, searching: friendList.searching, active: friendList.searched !== null, offered: friendList.allTotal > FRIEND_SEARCH_OFFER }}
            paging={{ hasMore: friendList.hasMore, loadingMore: friendList.loadingMore, moreFailed: friendList.moreFailed, onMore: () => void friendList.loadMore() }}
            room={CREW_MAX_MEMBERS - crew.size}
            asking={busy === 'invite'}
            onRetry={startInvite}
            onAsk={(ids) => void sendInvites(ids)}
            onClose={() => setInviting(false)}
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
  skeletonPage: { gap: SPACE.lg },
  page: { gap: SECTION_GAP },
  section: { gap: SPACE.md },
  leave: { minHeight: LEAVE_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  destructive: { color: COLOR.destructive },
})

/** Rose world: one hue on this screen (`HueProvider`). */
export default function CrewScreen() {
  return (
    <HueProvider value="rose">
      <CrewScreenContent />
    </HueProvider>
  )
}

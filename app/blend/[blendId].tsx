import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'

import { OverflowMenu } from '../../components/crews/OverflowMenu'
import { Button } from '../../components/ds/Button'
import { RevealSheet, RevealSide } from '../../components/ds/RevealSheet'
import { font, useBoldText } from '../../components/ds/shared'
import { StateScreen } from '../../components/ds/StateScreen'
import { TopBar } from '../../components/ds/TopBar'
import { Icon } from '../../components/ui/Icon'
import { SkeletonBlock } from '../../components/Skeleton'
import { useToast } from '../../components/Toast'
import { apiClient } from '../../lib/apiClient'
import { markCoachUsed, useCoachMark } from '../../lib/coachMarks'
import { BLEND_CLOSED_LINE, blendSides, blendTitle, crewMessage, type BlendPerson } from '../../lib/crews'
import { crewsApi } from '../../lib/crewsApi'
import { blendPeople, blendSub, blendWelcome, closesAtLine, closingSoon, revealedFor, sideShape } from '../../lib/crewsScreens'
import { COLOR, ICON, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { markRoomLeft } from '../../lib/roomMembership'
import { showSheet, type Sheet, type SheetOutcome } from '../../lib/sheet'
import { useAuth } from '../../lib/useAuth'
import { useBlends } from '../../lib/useBlends'

/** A minute: the header's "Closes in 9h" and the T-60 line follow the clock without a read. */
const CLOCK_MS = 60_000
/** Each side's row, so the page does not jump when it lands (flow10b.js: 76 tall). */
const SIDE_SKELETON = 76

/**
 * The Blend (Flow 10 · 10.9): both sides, yours first, each as the emblem (or
 * creature), the name and a tile per person. Before a reveal everyone is on
 * tonight's name; a reveal is the only confirmed action in crews, names only
 * those who have not kept themselves anonymous, and only to this Blend. The
 * chat itself is the room screen: this page is its Room info.
 *
 * Closed, a left Blend, a pair that blocked each other and a Blend that never
 * was all read as the one plain line, "This Blend has closed", never a reason.
 * T-60 it says when it closes. The first time anyone opens one, a card says
 * what it is (a coach mark: once, ever).
 */
export default function BlendScreen() {
  const { blendId, fromChat } = useLocalSearchParams<{ blendId: string; fromChat?: string }>()
  const { user } = useAuth()
  const myId = user?.id
  const bold = useBoldText()
  const { showToast } = useToast()
  const { blends, loaded, failed, reload } = useBlends()
  const [refreshing, setRefreshing] = useState(false)
  const [menu, setMenu] = useState(false)
  const [revealing, setRevealing] = useState(false)
  const [asking, setAsking] = useState(false)
  /** Your crew's reveal made on this screen, until the server says so itself. */
  const [revealedHere, setRevealedHere] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  /** One write at a time: a second tap while the first is in flight sends nothing. */
  const inFlight = useRef(false)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_MS)
    return () => clearInterval(timer)
  }, [])

  const blend = blends.find((b) => b.blendId === String(blendId)) ?? null
  const open = blend && Date.parse(blend.closesAt) > now ? blend : null
  const coach = useCoachMark('blend_first_open', { ready: !!open })

  const onRefresh = async () => {
    setRefreshing(true)
    await reload()
    setRefreshing(false)
  }

  if (!open) {
    const waiting = !loaded
    return (
      <View style={styles.container}>
        <TopBar title="Blend" onBack={() => router.back()} testID="blend-top" />
        <View style={styles.state}>
          {waiting ? (
            <View style={styles.skeleton} accessibilityLabel="Loading the Blend">
              <SkeletonBlock width="100%" height={SIDE_SKELETON} borderRadius={RADIUS.sheet} />
              <SkeletonBlock width="100%" height={SIDE_SKELETON} borderRadius={RADIUS.sheet} />
            </View>
          ) : failed && !blend ? (
            // A failed read is not a closed Blend: say so, and offer the retry.
            <StateScreen
              icon="cloud-off"
              title="This Blend didn’t load"
              body="Check your connection and try again."
              actions={[{ label: 'Try again', onPress: () => void onRefresh(), loading: refreshing }]}
              testID="blend-failed"
            />
          ) : (
            // Not in my open Blends: closed, left, or a block across the sides. One line for all.
            <StateScreen
              icon="door-closed"
              title={BLEND_CLOSED_LINE}
              actions={[{ label: 'Back to Banter', kind: 'strong', onPress: () => router.dismissTo('/(tabs)/chat') }]}
              testID="blend-closed"
            />
          )}
        </View>
      </View>
    )
  }

  const { mine, theirs } = blendSides(open, myId)
  const crewSide = mine?.kind === 'crew'
  const title = blendTitle(open, myId)
  const mineShape = mine ? sideShape(mine, myId, revealedHere) : null
  const theirShape = theirs ? sideShape(theirs, myId) : null
  const crewName = mineShape?.side.kind === 'crew' ? mineShape.side.name : null
  const closing = closingSoon(open.closesAt, now) ? closesAtLine(open.closesAt) : null

  const reveal = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setRevealing(true)
    const result = await crewsApi.reveal(open.blendId)
    inFlight.current = false
    setRevealing(false)
    if (!result.success) {
      setAsking(false)
      showToast(crewMessage(result, 'blend', 'Couldn’t reveal. Try again.'), 'error')
      return
    }
    H.success()
    setAsking(false)
    setRevealedHere(true)
    // No count comes back, by design: never who on your crew kept private.
    showToast(crewSide ? 'Your crew is revealed' : 'You’re revealed', 'success')
    void reload()
  }

  const leave = () =>
    showSheet({
      kind: 'actions',
      icon: 'log-out',
      title: 'Leave this Blend?',
      message: 'Only you leave — it goes on for everyone else, and it leaves your Banter.',
      actions: [
        {
          label: 'Leave',
          variant: 'destructive',
          run: async (): Promise<SheetOutcome> => {
            if (inFlight.current) return { ok: true }
            inFlight.current = true
            const result = await apiClient.leaveChatGroup(open.chatGroupId)
            inFlight.current = false
            if (!result.success) return { ok: false, error: crewMessage(result, 'blend', 'Couldn’t leave. Try again.') }
            // The chat underneath must offer Rejoin, not "closed": a Blend's door
            // answers a leaver's read with the same 403 as somebody it took out.
            markRoomLeft(open.chatGroupId)
            markCoachUsed('blend_first_open')
            router.dismissTo('/(tabs)/chat')
            return { ok: true, toast: 'You left the Blend' }
          },
        },
        { label: 'Cancel', cancel: true },
      ],
    })

  /*
   * Block by the handle this Blend gave them — the block route opens it for this
   * Blend's people only. The room's long-press offers no Block in a Blend yet
   * (the reduced person sheet is waiting on the server), so this is the way.
   */
  const confirmBlock = (person: BlendPerson): Sheet => {
    const who = person.name ?? person.pseudonym
    return {
      kind: 'actions',
      icon: 'ban',
      title: `Block ${who}?`,
      message:
        'You won’t see each other here or anywhere else on Blend’n, and the Blend goes on for everyone else. They aren’t told. To report something said, long-press the message in the chat.',
      actions: [
        {
          label: 'Block',
          variant: 'destructive',
          run: async (): Promise<SheetOutcome> => {
            if (inFlight.current) return { ok: true }
            inFlight.current = true
            const result = await apiClient.blockUser(person.userId)
            inFlight.current = false
            if (!result.success) return { ok: false, error: crewMessage(result, 'blend', 'Couldn’t block them. Try again.') }
            void reload()
            return { ok: true, toast: `${who} is blocked` }
          },
        },
        { label: 'Cancel', cancel: true },
      ],
    }
  }

  const pickToBlock = () =>
    showSheet({
      kind: 'actions',
      title: 'Block someone',
      message: 'Pick who. You won’t see each other here or anywhere else on Blend’n, and they aren’t told.',
      layout: 'rows',
      actions: [
        ...(theirs?.people ?? []).filter((p) => p.userId !== myId).map((p) => ({ label: p.name ?? p.pseudonym, icon: 'ban' as const, next: () => confirmBlock(p) })),
        { label: 'Cancel', cancel: true as const },
      ],
    })

  const openChat = () =>
    router.push({
      pathname: '/chat/[id]',
      params: { id: open.chatGroupId, roomName: title, kind: 'blend', blendId: open.blendId },
    } as never)

  return (
    <View style={styles.container}>
      <TopBar
        title={title}
        sub={blendSub(open, now)}
        onBack={() => router.back()}
        actions={[{ icon: 'ellipsis', label: 'More', onPress: () => setMenu(true) }]}
        testID="blend-top"
      />
      <ScrollView
        testID="blend-scroll"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOR.textSecondary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sides}>
          {mineShape ? (
            <RevealSide
              testID="blend-mine"
              mine
              side={mineShape.side}
              people={mineShape.people}
              status={mineShape.status}
              onReveal={revealedFor(mine, revealedHere) ? undefined : () => setAsking(true)}
            />
          ) : null}
          {theirShape ? <RevealSide testID="blend-theirs" side={theirShape.side} people={theirShape.people} /> : null}
        </View>
        {closing ? (
          <Text accessibilityLiveRegion="polite" style={[font('meta', bold), styles.quiet]}>
            {closing}
          </Text>
        ) : null}
        {coach.visible ? (
          <View style={styles.card} testID="blend-first-open">
            <View style={styles.well}>
              <Icon name="users" size={ICON.nav} />
            </View>
            <Text accessibilityRole="header" style={[font('heading', bold), styles.ink]}>
              {`${title} · ${blendPeople(open)} people`}
            </Text>
            <Text style={[font('body', bold), styles.secondary]}>{blendWelcome(open.closesAt)}</Text>
            <View style={styles.cardActions}>
              <Button kind="strong" label="Got it" pressHaptic={false} onPress={() => markCoachUsed('blend_first_open')} style={styles.flex} />
              <Button kind="secondary" label="Leave" onPress={leave} style={styles.flex} />
            </View>
          </View>
        ) : null}
        {fromChat ? null : <Button kind="secondary" label="Open the chat" onPress={openChat} testID="blend-open-chat" />}
      </ScrollView>
      <OverflowMenu
        testID="blend-menu"
        visible={menu}
        onClose={() => setMenu(false)}
        items={[
          ...(theirs?.people.length ? [{ icon: 'ban' as const, label: 'Block someone', onPress: pickToBlock }] : []),
          { icon: 'log-out', label: 'Leave this Blend', onPress: leave, destructive: true },
        ]}
      />
      <RevealSheet
        visible={asking}
        onClose={() => setAsking(false)}
        crew={crewName}
        audience={blendPeople(open)}
        onReveal={() => void reveal()}
        revealing={revealing}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.ink },
  state: { flex: 1, justifyContent: 'center', paddingHorizontal: SPACE.gutter },
  skeleton: { gap: SPACE.md },
  content: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.sm, paddingBottom: SPACE.xxl, gap: SPACE.lg },
  sides: { gap: SPACE.md },
  quiet: { color: COLOR.textTertiary, textAlign: 'center' },
  card: { borderRadius: RADIUS.sheet, backgroundColor: COLOR.surface, padding: SPACE.xl, gap: SPACE.md },
  well: {
    width: SIZE.circleButton,
    height: SIZE.circleButton,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardActions: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.xs },
  flex: { flex: 1 },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
})

import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, View } from 'react-native'
import { GestureDetector } from 'react-native-gesture-handler'
import Animated, { FadeIn, FadeInUp, FadeOut, useReducedMotion } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { apiClient } from '../../lib/apiClient'
import { markRoomLeft } from '../../lib/roomMembership'
import { blendnClosed } from '../../lib/blendnOverlay'
import { Logger } from '../../lib/logger'
import { meetNext, reasonLine } from '../../lib/roomMoments'
import { roomRecap, type RoomRecap as Recap } from '../../lib/roomRecap'
import { showUserSafetyActions } from '../../lib/safetyUtils'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE } from '../../lib/theme'
import { useAuth } from '../../lib/useAuth'
import { useCheckInFlow } from '../../lib/useCheckInFlow'
import { useRoom, type RoomPerson } from '../../lib/useRoom'
import { useRoomControls } from '../../lib/useRoomControls'
import { useTonight } from '../../lib/useTonight'
import ActionTray, { type ActionTrayButton } from '../ActionTray'
import { ConnectSheet } from '../grid/ConnectSheet'
import { ConfettiBurst } from '../motion/ConfettiBurst'
import RealtimeStatusBanner from '../RealtimeStatusBanner'
import { RoomVisibilityBanner } from '../RoomVisibilityBanner'
import { useToast } from '../Toast'
import { Text } from '../ui/Text'
import { ChatDock, type DockLine } from './ChatDock'
import { MatchMoment } from './MatchMoment'
import { PersonCard } from './PersonCard'
import { RoomRecap } from './RoomRecap'
import {
  FaceGridHead,
  FaceGridMore,
  GRID_GAP,
  GRID_ROW_GAP,
  GridFace,
  MeetNext,
  RoomHero,
  useGridCell,
  useNow,
} from './RoomSections'
import { RoomStage, useStageScroll } from './RoomStage'
import { TonightView } from './TonightView'

const TOP_BAR = CONTROL.md

/** A first line built from what you share — something to say that isn't "hey". */
export function openerFor(p: RoomPerson): string {
  const interest = p.interests[0]
  if (interest) return `You're into ${interest.toLowerCase()} too — how did you get into it?`
  if (p.sharedPlans > 0) return 'Looks like we’re going to the same things — which one are you most excited about?'
  if (p.sharedWorkField && p.workField) return `Another ${p.workField} person — what are you working on?`
  return 'What brought you here tonight?'
}

type Tray = { visible: boolean; title: string; message: string; buttons: ActionTrayButton[] }
const NO_TRAY: Tray = { visible: false, title: '', message: '', buttons: [] }

/**
 * The Blend'n screen — what the button in the middle of the bar opens, always.
 *
 * It used to open one of three places depending on your state: the event page
 * if you had one today, the nearby list if not, and the Room only once you
 * were checked in. So the most prominent control in the app had no home of
 * its own. Now it opens here, and *here* changes with you:
 *
 *     Tonight   what's on, nearest first; at a venue, a pass you hold to go in
 *     Room      who's here, who to meet next, and the room's chat
 *
 * Holding the pass checks you in, and the Tonight view gives way to the Room
 * without leaving the screen. See `docs/NAVIGATION.md`.
 */
export function BlendnScreen() {
  const stage = useRef<{ close(): void }>(null)
  const close = useCallback(() => stage.current?.close(), [])

  // Android back closes the overlay rather than leaving the tabs underneath.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close()
      return true
    })
    return () => sub.remove()
  }, [close])

  return (
    <RoomStage ref={stage} onClosed={blendnClosed}>
      <BlendnContent onClose={close} />
    </RoomStage>
  )
}

function BlendnContent({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  const room = useRoom()
  const tonight = useTonight()
  const { user } = useAuth()
  const { showToast } = useToast()

  const me = useMemo(
    () => ({ name: user?.name?.trim() || 'You', photo: user?.image ?? user?.profile?.photos?.[0] ?? null }),
    [user?.name, user?.image, user?.profile?.photos]
  )

  /*
   * The end of the night. The room carries `endsAt`, and until it was read the
   * room went on saying LIVE after everybody had gone home — until the
   * server's sweeper checked you out, when it vanished into Tonight with no
   * word about the night at all.
   *
   * Kept as a snapshot rather than derived: the sweeper can clear the check-in
   * while the recap is on screen, and the recap must not vanish with it.
   * "Back to tonight" dismisses it for this room; it never checks you out,
   * because a manual check-out also closes the room's chat, and after the
   * event the feedback window decides that.
   */
  const now = useNow(15_000)
  const [recap, setRecap] = useState<Recap | null>(null)
  const [dismissedRecap, setDismissedRecap] = useState<string | null>(null)
  const endedRecap =
    room.status === 'ready' && room.event
      ? roomRecap({ event: room.event, checkedInAt: room.checkedInAt, people: room.people }, now)
      : null
  if (endedRecap && endedRecap.eventId !== dismissedRecap && recap?.eventId !== endedRecap.eventId) {
    setRecap(endedRecap)
  }
  const roomOver = endedRecap !== null && endedRecap.eventId === dismissedRecap

  const mode = recap
    ? 'ended'
    : room.status === 'ready' && !roomOver
      ? 'room'
      : room.status === 'none' || roomOver
        ? 'tonight'
        : room.status

  // --- trays (check-in flow) -------------------------------------------------
  const [tray, setTray] = useState<Tray>(NO_TRAY)
  const closeTray = useCallback(() => setTray(NO_TRAY), [])
  const showTray = useCallback(
    (title: string, message: string, buttons?: ActionTrayButton[]) =>
      setTray({
        visible: true,
        title,
        message,
        buttons: buttons?.length ? buttons : [{ label: 'Done', variant: 'primary', onPress: closeTray }],
      }),
    [closeTray]
  )

  const insideEvent = tonight.events.find((e) => e.id === tonight.insideEventId) ?? null
  const checkIn = useCheckInFlow({
    eventId: insideEvent?.id ?? '',
    eventTitle: insideEvent?.title,
    showTray,
    closeTray,
    // The room *is* the success state: no "Checked in / Go to chat" tray.
    afterSuccess: 'none',
    onOpenMaps: () => insideEvent && router.push({ pathname: '/event/[id]', params: { id: insideEvent.id } as never }),
  })

  // --- your controls in the room --------------------------------------------
  const controls = useRoomControls(room.event?.id ?? null, room.revealed)
  const leave = useCallback(async () => {
    if (await controls.checkOut()) onClose()
  }, [controls, onClose])
  /*
   * Check out asks first. It was one tap in the top bar, beside the settings
   * button, and it closes the room: one stray thumb and you are out, and the
   * way back in is another location fix at the door. A tray rather than the
   * pass's hold, because this is a button in a bar, not a card you commit on.
   */
  const confirmLeave = useCallback(() => {
    showTray(
      'Check out of this event?',
      'You’ll leave the room and its people. To come back in you’ll need to check in again, with your location.',
      [
        { label: 'Stay', onPress: closeTray },
        {
          label: 'Check out',
          variant: 'primary',
          onPress: () => {
            closeTray()
            void leave()
          },
        },
      ]
    )
  }, [showTray, closeTray, leave])

  const eventId = room.event?.id ?? null
  const eventTitle = room.event?.title ?? ''
  const chatGroupId = room.chatGroupId

  // --- people ---------------------------------------------------------------
  const [open, setOpen] = useState<RoomPerson | null>(null)
  const [connectTo, setConnectTo] = useState<RoomPerson | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [waves, setWaves] = useState<Record<string, 'sent' | 'too-soon'>>({})
  // The card follows the live person, so a like updates it in place.
  const openLive = open ? room.people.find((p) => p.id === open.id) ?? open : null

  const { like: likeId, sendWave, remove, clearWave } = room
  const like = useCallback((p: RoomPerson) => void likeId(p.id), [likeId])
  const wave = useCallback(
    async (p: RoomPerson) => {
      const r = await sendWave(p.id)
      if (r === 'sent') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
      if (r !== 'refused') setWaves((w) => ({ ...w, [p.id]: r }))
    },
    [sendWave]
  )
  const openProfile = useCallback(
    (p: RoomPerson) => {
      setOpen(null)
      // The event travels with the id: the profile's Like needs to know the room.
      router.push({
        pathname: '/user/[id]',
        params: { id: p.id, ...(eventId ? { eventId } : {}) } as never,
      })
    },
    [eventId]
  )
  const sayHi = useCallback((conversationId: string, p: { id: string; name: string }) => {
    setOpen(null)
    router.push({
      pathname: '/private-chat/[conversationId]',
      params: { conversationId, otherUserName: p.name, otherUserId: p.id } as never,
    })
  }, [])
  const safety = useCallback(
    (p: RoomPerson) => {
      setOpen(null)
      showUserSafetyActions(p.name, p.id, () => remove(p.id), () => remove(p.id))
    },
    [remove]
  )

  // --- the room chat ----------------------------------------------------------
  const openChat = useCallback(async () => {
    let id = chatGroupId
    if (!id && eventId) {
      try {
        const r = await apiClient.getEventChat(eventId)
        id = (r.success && (r.data?.chatGroupId ?? r.data?.id)) || null
        // Left it: the chat opens on "You left this room" and its Rejoin.
        if (!id && r.errorCode === 'LEFT_ROOM' && r.chatGroupId) {
          markRoomLeft(r.chatGroupId)
          id = r.chatGroupId
        }
      } catch (e) {
        Logger.warn('chat', 'room chat lookup failed', { error: e })
      }
    }
    if (!id) {
      showToast('The chat for this event is not open yet.', 'info')
      return
    }
    // A push, not a replace: the room is an overlay under the stack now, so the
    // chat lands on top of it and Back returns here.
    router.push({
      pathname: '/chat/[id]',
      params: { id: String(id), roomName: eventTitle || 'Event chat', eventTitle } as never,
    })
  }, [chatGroupId, eventId, eventTitle, showToast])

  /*
   * What the room did, as lines in the dock: arrivals, waves, matches.
   *
   * Accumulated while rendering (React's "adjust state when a prop changes"),
   * not in effects — each source is state in `useRoom`, and a line must outlive
   * the thing that caused it (a match is cleared when its moment closes).
   */
  const [system, setSystem] = useState<DockLine[]>([])
  const [seen, setSeen] = useState({ arrival: room.arrivals[0], wave: room.wave, match: room.match })
  if (seen.arrival !== room.arrivals[0] || seen.wave !== room.wave || seen.match !== room.match) {
    const lines: DockLine[] = []
    const a = room.arrivals[0]
    if (a && a !== seen.arrival)
      lines.push({ id: `arrive-${a.id}-${a.arrivedAt}`, kind: 'system', text: `${a.name} walked in`, at: Date.parse(a.arrivedAt ?? '') || 0 })
    const w = room.wave
    if (w && w !== seen.wave)
      lines.push({ id: `wave-${w.fromUserId}-${w.at}`, kind: 'system', text: `${w.fromName} waved at you 👋`, at: w.at })
    const m = room.match
    if (m && m !== seen.match) lines.push({ id: `match-${m.conversationId}`, kind: 'system', text: `You matched with ${m.name}`, at: m.at })
    setSeen({ arrival: room.arrivals[0], wave: room.wave, match: room.match })
    if (lines.length) {
      setSystem((s) => [...s, ...lines.filter((l) => !s.some((x) => x.id === l.id))].slice(-6))
    }
  }

  // Somebody waved: a nudge and a toast, once; the line is added above.
  const incoming = room.wave
  useEffect(() => {
    if (!incoming) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    showToast(`${incoming.fromName} waved at you 👋`, 'info')
    clearWave()
  }, [incoming, showToast, clearWave])

  // --- meet next --------------------------------------------------------------
  const shuffle = useMemo(
    () => meetNext(room.people, { now, eventId: room.event?.id ?? '' }),
    // Recomputed on the clock tick; the picks only change when the window does.
    [room.people, now, room.event?.id]
  )
  const pickIds = new Set(shuffle.picks.map((p) => p.id))
  const everyone = room.people

  const cell = useGridCell()
  const { onScroll, native, scrollEventThrottle } = useStageScroll()

  const topInset = insets.top + TOP_BAR + SPACE.md
  const matchPerson = room.match?.person ?? null

  return (
    <View style={styles.fill}>
      {mode === 'room' && room.event ? (
        <Animated.View key="room" style={styles.fill} entering={reduceMotion ? FadeIn : FadeInUp.duration(320)} exiting={FadeOut.duration(160)}>
          <GestureDetector gesture={native}>
            <Animated.FlatList
              data={everyone}
              keyExtractor={(p) => p.id}
              numColumns={3}
              onScroll={onScroll}
              scrollEventThrottle={scrollEventThrottle}
              bounces={false}
              showsVerticalScrollIndicator={false}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={{ paddingTop: topInset, paddingBottom: insets.bottom + SPACE.xxxl * 3 }}
              ListHeaderComponent={
                <View style={styles.header}>
                  {/*
                    Arrivals, waves, matches and the dock are all socket-driven,
                    so a dead socket is worth saying here: without it the room
                    sits still and looks quiet rather than broken.
                  */}
                  <RealtimeStatusBanner status={room.connection} style={styles.statusBanner} />
                  <RoomHero
                    title={room.event.title}
                    hereCount={room.hereCount}
                    checkedInAt={room.checkedInAt}
                    me={me}
                    arrivals={room.arrivals}
                    people={room.people}
                  />
                  <View style={styles.banner}>
                    <RoomVisibilityBanner
                      revealed={controls.revealed}
                      onToggle={() => void controls.toggleReveal()}
                      busy={controls.revealBusy}
                      canReveal={controls.readiness.ok}
                      missing={controls.readiness.missing}
                      listed={controls.listed}
                      onUnhide={() => router.push('/settings')}
                    />
                  </View>
                  <MeetNext picks={shuffle.picks} nextShuffleAt={shuffle.nextShuffleAt} onOpen={setOpen} />
                  {/*
                    Everyone but you. The loaded page is 20 of a bigger room, so
                    while there is more the number is the room's, not the page's.
                  */}
                  <FaceGridHead
                    count={room.hasMore ? Math.max(room.hereCount - 1, everyone.length) : everyone.length}
                    empty={everyone.length === 0}
                  />
                </View>
              }
              renderItem={({ item, index }) => (
                <GridFace
                  person={item}
                  size={cell}
                  index={index}
                  animateIn={index < 12 && !pickIds.has(item.id)}
                  onOpen={setOpen}
                  onLike={like}
                />
              )}
              ListFooterComponent={
                room.hasMore && everyone.length > 0 ? (
                  <FaceGridMore loading={room.loadingMore} onMore={() => void room.loadMore()} />
                ) : null
              }
            />
          </GestureDetector>
          <View style={styles.dock}>
            <ChatDock
              chatGroupId={room.chatGroupId}
              myId={user?.id}
              system={system}
              onOpen={() => void openChat()}
              bottomInset={insets.bottom}
            />
          </View>
        </Animated.View>
      ) : mode === 'ended' && recap ? (
        <Animated.View key="ended" style={styles.fill} entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)}>
          <RoomRecap
            recap={recap}
            me={me}
            topInset={topInset}
            bottomInset={insets.bottom}
            onRate={() => router.push({ pathname: '/rate/[eventId]', params: { eventId: recap.eventId } as never })}
            onBack={() => {
              setDismissedRecap(recap.eventId)
              setRecap(null)
            }}
          />
        </Animated.View>
      ) : mode === 'tonight' ? (
        <Animated.View key="tonight" style={styles.fill} entering={FadeIn.duration(220)} exiting={FadeOut.duration(200)}>
          <TonightView
            events={tonight.events}
            loading={tonight.status === 'loading'}
            error={tonight.status === 'error'}
            onRetry={() => void tonight.refresh()}
            insideEvent={insideEvent}
            tasteMatchCount={insideEvent?.tasteMatchCount ?? null}
            checkingIn={checkIn.checkingIn}
            onOpenEvent={(id) => router.push({ pathname: '/event/[id]', params: { id } as never })}
            onSeeAll={() => router.push('/nearby-events')}
            onBrowse={() => {
              onClose()
              router.navigate('/(tabs)/events')
            }}
            onCheckIn={() => void checkIn.start()}
            topInset={topInset}
            bottomInset={insets.bottom}
          />
        </Animated.View>
      ) : mode === 'error' ? (
        <View style={[styles.centred, { paddingTop: topInset }]}>
          <Text variant="bodyStrong">Could not load the room</Text>
          <Text variant="meta">{room.error ?? 'Check your connection and try again.'}</Text>
          <Pressable onPress={room.retry} style={styles.retry} accessibilityRole="button">
            <Text variant="button">Try again</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.centred, { paddingTop: topInset }]}>
          <ActivityIndicator color={EMBER.textSecondary} />
        </View>
      )}

      {/* The bar floats over both modes, so closing is always in the same place. */}
      <View style={[styles.topBar, { paddingTop: insets.top }]} pointerEvents="box-none">
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close Blend'n"
          hitSlop={12}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-down" size={ICON.lg} color={EMBER.textPrimary} />
        </Pressable>
        {mode === 'room' && room.event ? (
          <Animated.View entering={FadeIn.duration(160)} style={styles.topActions}>
            <Pressable
              onPress={confirmLeave}
              disabled={controls.checkOutBusy}
              accessibilityRole="button"
              accessibilityLabel="Check out of this event"
              accessibilityHint="Asks first. Removes you from the room; checking back in needs your location again."
              style={({ pressed }) => [styles.checkOut, pressed && styles.pressed]}
            >
              {controls.checkOutBusy ? (
                <ActivityIndicator size="small" color={EMBER.textSecondary} />
              ) : (
                <Text variant="button" maxFontSizeMultiplier={1.2}>
                  Check out
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() =>
                router.push({ pathname: '/event-preferences/[eventId]', params: { eventId: room.event!.id } as never })
              }
              accessibilityRole="button"
              accessibilityLabel="Settings for this room"
              accessibilityHint="Set why you are here tonight, and whether people can see your name"
              hitSlop={12}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Ionicons name="options-outline" size={ICON.lg} color={EMBER.textPrimary} />
            </Pressable>
          </Animated.View>
        ) : null}
      </View>

      <PersonCard
        person={openLive}
        onClose={() => setOpen(null)}
        onLike={like}
        onWave={(p) => void wave(p)}
        onMessage={(p) => {
          setOpen(null)
          setConnectTo(p)
        }}
        onSayHi={(p) => p.conversationId && sayHi(p.conversationId, p)}
        onSafety={safety}
        onOpenProfile={openProfile}
        waveState={openLive ? waves[openLive.id] ?? null : null}
      />

      <ConnectSheet
        visible={connectTo !== null}
        displayName={connectTo?.name ?? ''}
        theyAreRevealed={Boolean(connectTo?.photo)}
        sending={connecting}
        onDismiss={() => setConnectTo(null)}
        onSend={async (message) => {
          if (!connectTo) return
          setConnecting(true)
          await room.connect(connectTo.id, message)
          setConnecting(false)
          setConnectTo(null)
        }}
      />

      {/*
        Faces only where they have been earned. Theirs is a photo only if they
        revealed — the roster never carries one otherwise (server-enforced), so
        an unrevealed match is their creature. Yours follows the same rule from
        your side: the mark they know you by unless you are named in this room,
        so the moment never shows you something about yourself they can't see.
      */}
      <MatchMoment
        visible={room.match !== null}
        me={controls.revealed ? me : { name: room.match?.you ?? 'You', photo: null }}
        them={{ name: room.match?.name ?? '', photo: matchPerson?.photo ?? null }}
        reason={matchPerson ? reasonLine(matchPerson) : null}
        opener={matchPerson ? openerFor(matchPerson) : null}
        onClose={room.clearMatch}
        onSayHi={() => {
          const m = room.match
          room.clearMatch()
          if (m) sayHi(m.conversationId, { id: matchPerson?.id ?? '', name: m.name })
        }}
      />

      {/* Out of the pass's hold button: the dock's padding, the pass's, half the button. */}
      <ConfettiBurst
        trigger={checkIn.celebrations}
        originBottom={insets.bottom + SPACE.md + SPACE.lg + CONTROL.md / 2}
      />

      <ActionTray
        visible={tray.visible}
        title={tray.title}
        message={tray.message}
        buttons={tray.buttons}
        onClose={closeTray}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { gap: SPACE.xl, marginBottom: SPACE.xs },
  banner: { paddingHorizontal: GUTTER },
  statusBanner: { marginHorizontal: GUTTER },
  gridRow: { paddingHorizontal: GUTTER, columnGap: GRID_GAP, marginBottom: GRID_ROW_GAP },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GUTTER - SPACE.sm,
    backgroundColor: EMBER.bg,
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  iconButton: {
    width: TOP_BAR,
    height: TOP_BAR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOut: {
    height: CONTROL.sm,
    paddingHorizontal: SPACE.lg,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  centred: { flex: 1, alignItems: 'center', gap: SPACE.sm, paddingHorizontal: GUTTER },
  retry: {
    marginTop: SPACE.md,
    height: CONTROL.md,
    paddingHorizontal: SPACE.xl,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    justifyContent: 'center',
  },
})

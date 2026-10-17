import { router, useScrollToTop } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import Reanimated, { Easing, FadeInUp, FadeOut, LinearTransition, useReducedMotion } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  BanterHeader,
  BanterRow,
  BanterSkeleton,
  BlendLiveCard,
  LiveHero,
  NewAbovePill,
  RequestCard,
  RequestFace,
  rowLabel,
  banterHeaderHeight,
  type RowFace,
  type RowLine,
} from '../../components/banter/BanterParts'
import { useLatest } from '../../lib/useLatest'
import { heldList, inboxTimeLabel, previewWithSender } from '../../components/banter/inbox'
import { holdStep, IDLE, type Hold, type HoldEvent } from '../../components/banter/hold'
import { BoardRequestsSection } from '../../components/board/BoardRequestsSection'
import { LeaveRoomSheet, MuteSheet } from '../../components/chat/RoomSheets'
import { SearchField } from '../../components/ds/SearchField'
import { SectionHeader } from '../../components/ds/SectionHeader'
import { font, useBoldText } from '../../components/ds/shared'
import { StateScreen } from '../../components/ds/StateScreen'
import { SwipeRow, type SwipeAction } from '../../components/ds/SwipeRow'
import { NotificationBell } from '../../components/pulse/NotificationBell'
import RealtimeStatusBanner from '../../components/RealtimeStatusBanner'
import { useToast } from '../../components/Toast'
import { apiClient } from '../../lib/apiClient'
import { BOARD_ENABLED } from '../../lib/board'
import { dmThread, outboxLine, roomThread, useOutbox, type Thread } from '../../lib/chatOutbox'
import { crewRoomTitle, type CrewRoomRow } from '../../lib/crews'
import { COLOR, DURATION, EASING, SPACE, SPRING, STAGGER } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { matchRowPreview } from '../../lib/matchOpener'
import { ScreenProfiler } from '../../lib/perf'
import { isMuted, useRoomMembership } from '../../lib/roomMembership'
import { roomStateLine } from '../../lib/roomState'
import { SPONSORED, useBanterInbox, type GroupChat, type MessageRequest, type PersonalChat } from '../../lib/useBanterInbox'
import { useCrewInbox } from '../../lib/useCrewInbox'
import { TAB_BAR_CLEARANCE } from './_layout'

/** A conversation as the Banter draws it, and what it takes to open, find and swipe it. */
type Row = {
  key: string
  title: string
  face: RowFace
  line: RowLine
  time: string
  unread: boolean
  muted: boolean
  sortTime: number
  searchText: string
  open: () => void
  swipe: SwipeAction[]
}

type Item = { type: 'heading'; key: string; title: string; markAll?: boolean } | { type: 'row'; key: string; row: Row; index: number }

/** #27: a moved row travels to its new place on M.settle, 300 ms after its preview changed. */
const REORDER = LinearTransition.delay(300).springify().stiffness(SPRING.settle.stiffness).damping(SPRING.settle.damping).mass(SPRING.settle.mass)
const SEARCH_GAP = SPACE.sm
/** C12: the held order lets go this long after a lift (a fling's momentum, starting just after, cancels it). */
const HOLD_RELEASE_MS = 250
/** A press held this long is a hold, not a tap (Pressable's own long-press delay). */
const HELD_PRESS_MS = 500

/**
 * The Banter (Flow 5 Banter frames, R2-D2, R3-0, R3-D5) — every conversation
 * you have, on one screen.
 *
 * A glass header (the bell, search, Mark all read); then, top to bottom:
 * **Live now** (the room you're standing in, as the hero; an open Blend),
 * **Requests** (message requests with their notes, crew invites, the Board's
 * asks), **Crews**, **People** (DMs) and **Past rooms**. People are circles,
 * rooms and crews rounded squares. Unread is three changes and a dot, never
 * a height change. A room row swipes to Mute or Leave, a DM to Mark read.
 * Rooms you're checked into are lifted out, never repeated; never-used
 * conversations sort last. No compose button: a DM starts from a person.
 *
 * Anonymity holds here: the server sends the pseudonym and no photo until a
 * person reveals, so an unrevealed match is their creature, seeded on the
 * pseudonym (docs/BANTER.md).
 */
function ChatInner() {
  const insets = useSafeAreaInsets()
  const bold = useBoldText()
  const reduceMotion = useReducedMotion()
  const { showToast } = useToast()
  const inbox = useBanterInbox()
  const { groupChats, setGroupChats, crewRooms, setCrewRooms, personalChats, setPersonalChats, incomingRequests, user } = inbox
  const crews = useCrewInbox(useCallback((text: string) => showToast(text, 'error'), [showToast]))
  const outbox = useOutbox()
  const membership = useRoomMembership()
  const [boardCount, setBoardCount] = useState(0)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [muteFor, setMuteFor] = useState<string | null>(null)
  const [leaveFor, setLeaveFor] = useState<string | null>(null)
  const [openSwipe, setOpenSwipe] = useState<string | null>(null)
  // Tapping Banter while already on it goes back to the top (the bar emits `tabPress`).
  const listRef = useRef<FlatList<Item>>(null)
  useScrollToTop(listRef)

  /* Threads whose "Asked to reveal names" you have opened this session (the server keeps the flag until you answer). */
  const [revealSeen, setRevealSeen] = useState<ReadonlySet<string>>(() => new Set())
  const roomMuted = useCallback((id: string) => isMuted(membership.mutes.get(id)), [membership.mutes])

  const openRoom = useCallback(
    (chat: GroupChat) => {
      inbox.noteOpenRoom(chat.chat_room_id)
      setGroupChats((prev) => prev.map((c) => (c.chat_room_id === chat.chat_room_id ? { ...c, unread_count: 0 } : c)))
      router.push({
        pathname: '/chat/[id]',
        params: { id: chat.chat_room_id, roomName: chat.event_title, eventTitle: chat.event_title } as never,
      })
    },
    [inbox, setGroupChats]
  )
  const openDm = useCallback(
    (chat: PersonalChat) => {
      if (chat.reveal_requested) setRevealSeen((prev) => new Set(prev).add(chat.conversation_id))
      router.push({
        pathname: '/private-chat/[conversationId]',
        params: {
          conversationId: chat.conversation_id,
          otherUserName: chat.other_user_name,
          otherUserId: chat.other_user_id,
        } as never,
      })
    },
    []
  )
  const openCrewRoom = useCallback(
    (r: CrewRoomRow) => {
      setCrewRooms((prev) => prev.map((x) => (x.id === r.id ? { ...x, unreadCount: 0 } : x)))
      router.push({
        pathname: '/chat/[id]',
        params: { id: r.id, roomName: crewRoomTitle(r), kind: r.kind, ...(r.crewId ? { crewId: r.crewId } : {}), ...(r.blendId ? { blendId: r.blendId } : {}) } as never,
      })
    },
    [setCrewRooms]
  )

  /* "Mark read" on one DM: the thread's first page is what opens it on the server (no per-thread route exists). */
  const markRead = useCallback(
    async (chat: PersonalChat) => {
      setPersonalChats((prev) => prev.map((c) => (c.conversation_id === chat.conversation_id ? { ...c, unread_count: 0 } : c)))
      const result = await apiClient.getConversationMessages(chat.conversation_id, { limit: 1 })
      if (!result.success) {
        setPersonalChats((prev) => prev.map((c) => (c.conversation_id === chat.conversation_id ? { ...c, unread_count: chat.unread_count } : c)))
        showToast("Couldn't mark it read. Try again.", 'error')
      }
    },
    [setPersonalChats, showToast]
  )

  const rooms = useMemo(() => groupChats.filter((c) => !membership.left.has(c.chat_room_id)), [groupChats, membership.left])
  const liveRooms = useMemo(() => rooms.filter((c) => c.is_checked_in), [rooms])
  const blendRooms = useMemo(() => crewRooms.filter((r) => r.kind === 'blend' && !membership.left.has(r.id)), [crewRooms, membership.left])

  /** Line 2, by 5.8's precedence: not sent, then a draft, then the last message. */
  const lineFor = useCallback(
    (thread: Thread, fallback: RowLine): RowLine => {
      const held = outboxLine(outbox, thread)
      return held ? (held.kind === 'failed' ? { kind: 'failed' } : { kind: 'draft', text: held.text }) : fallback
    },
    [outbox]
  )

  const { crewRows, peopleRows, pastRows } = useMemo(() => {
    const now = new Date()
    const byRecent = (a: Row, b: Row) => b.sortTime - a.sortTime
    const crewRows: Row[] = crewRooms
      .filter((r) => r.kind === 'crew' && !membership.left.has(r.id))
      .map((r): Row => {
        const last = r.lastMessage
        const text = last?.content.trim() ? previewWithSender(last.content, { fromMe: last.user.id === user?.id, name: last.user.name ?? undefined }) : 'No messages yet'
        return {
          key: `c:${r.id}`,
          title: r.name,
          face: { kind: 'crew', seed: crews.seedFor(r.id) },
          line: lineFor(roomThread(r.id, user?.id), { kind: 'text', text }),
          time: inboxTimeLabel(r.lastMessageAt ?? undefined, now),
          unread: r.unreadCount > 0,
          muted: roomMuted(r.id),
          sortTime: r.lastMessageAt ? Date.parse(r.lastMessageAt) : 0,
          searchText: `${r.name} ${text}`.toLowerCase(),
          open: () => openCrewRoom(r),
          swipe: [{ icon: 'bell-off', label: 'Mute', onPress: () => setMuteFor(r.id) }],
        }
      })
      .sort(byRecent)
    const peopleRows: Row[] = personalChats
      .map((c): Row => {
        const asked = c.reveal_requested && !revealSeen.has(c.conversation_id)
        const text = c.last_message?.trim()
          ? previewWithSender(c.last_message, { fromMe: c.last_message_from_me })
          : (matchRowPreview({ fromMatch: c.from_match }) ?? 'Start chatting')
        const line: RowLine = asked ? { kind: 'chip', icon: 'eye', text: 'Asked to reveal names' } : { kind: 'text', text }
        return {
          key: `p:${c.conversation_id}`,
          title: c.other_user_name,
          face: { kind: 'person', photo: c.they_revealed ? c.other_user_avatar : null, pseudonym: c.other_user_name },
          line: asked ? line : lineFor(dmThread(c.conversation_id, user?.id), line),
          time: inboxTimeLabel(c.last_message_time, now),
          unread: c.unread_count > 0,
          // DMs can't be muted (ROUND3 C5).
          muted: false,
          sortTime: c.last_message_time ? Date.parse(c.last_message_time) : 0,
          searchText: `${c.other_user_name} ${text}`.toLowerCase(),
          open: () => openDm(c),
          swipe: c.unread_count > 0 ? [{ icon: 'check-check', label: 'Mark read', onPress: () => void markRead(c) }] : [],
        }
      })
      .sort(byRecent)
    const pastRows: Row[] = rooms
      .filter((c) => !c.is_checked_in)
      .map((c): Row => {
        const sponsored = c.last_message === SPONSORED
        const text = sponsored ? '' : c.last_message?.trim() ? previewWithSender(c.last_message, { fromMe: c.last_sender_is_me, name: c.last_sender_name }) : 'No messages yet'
        // The room's state is a status, never drawn like speech (Flow 5 #08).
        const stateLine = roomStateLine(c.room_state)
        const state: RowLine | null = stateLine
          ? { kind: 'chip', icon: c.room_state === 'locked' ? 'lock' : 'mic-off', text: stateLine, warn: c.room_state === 'locked' }
          : null
        return {
          key: `g:${c.chat_room_id}`,
          title: c.event_title,
          face: { kind: 'room', cover: c.event_image },
          line: state ?? lineFor(roomThread(c.chat_room_id, user?.id), { kind: 'text', text }),
          time: inboxTimeLabel(c.last_message_time, now),
          unread: c.unread_count > 0,
          muted: roomMuted(c.chat_room_id),
          sortTime: c.last_message_time ? Date.parse(c.last_message_time) : 0,
          searchText: `${c.event_title} ${text} ${c.last_sender_name ?? ''}`.toLowerCase(),
          open: () => openRoom(c),
          swipe: [
            { icon: 'bell-off', label: 'Mute', onPress: () => setMuteFor(c.chat_room_id) },
            { icon: 'log-out', label: 'Leave', destructive: true, onPress: () => setLeaveFor(c.chat_room_id) },
          ],
        }
      })
      .sort(byRecent)
    return { crewRows, peopleRows, pastRows }
  }, [crewRooms, personalChats, rooms, membership.left, user?.id, crews, lineFor, roomMuted, revealSeen, openCrewRoom, openDm, openRoom, markRead])

  const trimmed = query.trim().toLowerCase()
  const match = useCallback((rows: Row[]) => (trimmed ? rows.filter((r) => r.searchText.includes(trimmed)) : rows), [trimmed])
  /* Mark all read covers DMs only: no endpoint marks a room read (docs/BANTER.md). */
  const hasUnread = personalChats.some((c) => c.unread_count > 0)

  /*
   * #27: a landing message moves its row on M.settle — unless a finger is on
   * the list. Then the order holds still and a "↑ New" pill offers the way up;
   * on lift the rows settle and the pill goes (C12, `heldList`).
   */
  const [heldOrder, setHeldOrder] = useState<string[] | null>(null)
  // The touch's state (`holdStep`) and the lift's timer: read only in the list's event handlers.
  const hold = useRef<Hold>(IDLE)
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const step = (e: HoldEvent) => {
    const prev = hold.current
    const next = holdStep(prev, e)
    hold.current = next
    if (prev.armed && !next.armed && releaseTimer.current) {
      clearTimeout(releaseTimer.current)
      releaseTimer.current = null
    }
    if (next.armed && !prev.armed) releaseTimer.current = setTimeout(() => step('timer'), HOLD_RELEASE_MS)
    if (next.held && !prev.held) setHeldOrder(liveOrder.current())
    if (prev.held && !next.held) setHeldOrder(null)
  }
  useEffect(
    () => () => {
      if (releaseTimer.current) clearTimeout(releaseTimer.current)
    },
    []
  )
  const items = useMemo<Item[]>(() => {
    const sections: [string, Row[], boolean][] = [
      ['Crews', match(crewRows), false],
      ['People', match(peopleRows), true],
      ['Past rooms', match(pastRows), false],
    ]
    const out: Item[] = []
    let index = 0
    for (const [title, rows, markAll] of sections) {
      if (!rows.length) continue
      out.push({ type: 'heading', key: `h:${title}`, title, markAll })
      for (const row of rows) out.push({ type: 'row', key: row.key, row, index: index++ })
    }
    return out
  }, [crewRows, peopleRows, pastRows, match])
  const liveOrder = useLatest(() => items.map((i) => i.key))
  /*
   * A lift after a hold is not a tap: Android opened the row under the finger
   * when a rested finger came up (drive 2). A press that lasted a hold, or
   * under which the list reordered, opens nothing. A screen reader's
   * activation has no touch on the list, so it always opens.
   */
  const touchStartAt = useRef(0)
  const openUnlessHeld = (open: () => void) => () => {
    const held = hold.current.held && (Date.now() - touchStartAt.current >= HELD_PRESS_MS || heldList(items, heldOrder).moved)
    if (!held) open()
  }
  const { shown, moved: newAbove } = heldList(items, heldOrder)

  /* Rows enter once, 18 ms apart, as the list first lands (Flow 5 Banter annotation). */
  const entered = useRef(false)
  useEffect(() => {
    if (!inbox.loading) entered.current = true
  })
  const entering = (index: number) =>
    entered.current || reduceMotion
      ? undefined
      : FadeInUp.duration(DURATION.base)
          .delay(Math.min(index * STAGGER.tight, STAGGER.windowMax))
          .easing(Easing.bezier(...EASING.entrance))

  const renderItem = ({ item }: { item: Item }) => {
    if (item.type === 'heading') {
      return (
        <View style={styles.heading}>
          <SectionHeader
            title={item.title}
            action={item.markAll && hasUnread ? { label: 'Mark all read', onPress: () => void inbox.handleMarkAllRead() } : undefined}
            testID={`banter-${item.title.toLowerCase().replace(' ', '-')}`}
          />
        </View>
      )
    }
    const { row } = item
    const label = rowLabel(row.title, row.line, row.time, row.unread, row.muted)
    // In a SwipeRow the row is drawn and the SwipeRow is the element (its actions in the rotor).
    const body = (
      <BanterRow
        face={row.face}
        title={row.title}
        line={row.line}
        time={row.time}
        unread={row.unread}
        muted={row.muted}
        onPress={row.swipe.length ? undefined : openUnlessHeld(row.open)}
        accessibilityLabel={row.swipe.length ? undefined : label}
        testID={`banter-row-${row.key}`}
      />
    )
    return (
      <Reanimated.View entering={entering(item.index)} layout={reduceMotion ? undefined : REORDER}>
        {row.swipe.length ? (
          <SwipeRow
            actions={row.swipe}
            onPress={openUnlessHeld(row.open)}
            open={openSwipe === row.key}
            onOpenChange={(open) => setOpenSwipe(open ? row.key : null)}
            accessibilityLabel={label}
            testID={`banter-swipe-${row.key}`}
          >
            {body}
          </SwipeRow>
        ) : (
          body
        )}
      </Reanimated.View>
    )
  }

  const headerHeight = banterHeaderHeight(insets.top)
  const listTop = headerHeight + (searching ? SPACE.sm + SEARCH_FIELD + SEARCH_GAP : 0) + SPACE.lg
  const invites = crews.invites
  const hasHeaderContent = liveRooms.length + blendRooms.length + incomingRequests.length + invites.length + boardCount > 0

  const header = (
    <View style={styles.sections}>
      {inbox.listFailed && items.length ? <Text style={[font('meta', bold), styles.secondary]}>Some chats couldn’t load. Pull down to try again.</Text> : null}

      {!trimmed && (liveRooms.length || blendRooms.length) ? (
        <View style={styles.section}>
          <SectionHeader title="Live now" live testID="banter-live" />
          {liveRooms.map((c) => (
            <LiveHero
              key={c.chat_room_id}
              testID={`banter-live-${c.chat_room_id}`}
              title={c.event_title}
              coverUrl={c.event_image}
              count={c.participant_count}
              here={c.is_place}
              unread={c.unread_count}
              muted={roomMuted(c.chat_room_id)}
              line={
                c.room_state === 'locked'
                  ? 'Locked by the organiser · read only'
                  : c.last_message && c.last_message !== SPONSORED
                    ? previewWithSender(c.last_message, { fromMe: c.last_sender_is_me, name: c.last_sender_name })
                    : null
              }
              onPress={() => openRoom(c)}
            />
          ))}
          {blendRooms.map((r) => {
            const sides = crews.blendFor(r.id)
            return (
              <BlendLiveCard
                key={r.id}
                title={sides?.theirName ? `Blend with ${sides.theirName}` : crewRoomTitle(r)}
                seeds={[sides?.mineSeed ?? null, sides?.theirSeed ?? null]}
                closesAt={sides?.closesAt ?? r.closesAt}
                unread={r.unreadCount}
                onPress={() => openCrewRoom(r)}
              />
            )
          })}
        </View>
      ) : null}

      {!trimmed && (incomingRequests.length || invites.length) ? (
        <View style={styles.section}>
          <SectionHeader title="Requests" count={incomingRequests.length + invites.length} testID="banter-requests" />
          {invites.map((invite) => (
            <Reanimated.View key={`i:${invite.crewId}`} exiting={reduceMotion ? undefined : FadeOut.duration(DURATION.quick)} layout={reduceMotion ? undefined : REQUEST_REFLOW}>
              <RequestCard
                testID={`banter-invite-${invite.crewId}`}
                face={<RequestFace emblemSeed={invite.emblemSeed} />}
                name={invite.name}
                note={`${invite.invitedBy} invited you to the crew`}
                time={inboxTimeLabel(invite.invitedAt)}
                accept="Join"
                // Join is the consent screen (Flow 10 · 10.3): it reveals you to the crew, so it asks there.
                onAccept={() => {
                  H.primary()
                  router.push('/crews')
                }}
                onDecline={() => crews.decline(invite)}
              />
            </Reanimated.View>
          ))}
          {incomingRequests.map((r: MessageRequest) => (
            <Reanimated.View key={r.request_id} exiting={reduceMotion ? undefined : FadeOut.duration(DURATION.quick)} layout={reduceMotion ? undefined : REQUEST_REFLOW}>
              <RequestCard
                testID={`banter-request-${r.request_id}`}
                face={<RequestFace photo={r.sender_avatar} pseudonym={r.sender_name ?? undefined} />}
                name={r.sender_name || 'Someone'}
                // The request's note, verbatim (ROUND3 C11).
                note={r.initial_message?.trim() || 'Wants to message you'}
                time={inboxTimeLabel(r.created_at)}
                pending={inbox.requestPending[r.request_id]}
                onAccept={() => void inbox.respondToRequest(r, 'accept')}
                onDecline={() => void inbox.respondToRequest(r, 'decline')}
                onMore={() => inbox.openRequestMore(r)}
                onOpen={r.sender_id ? () => router.push({ pathname: '/user/[id]', params: { id: String(r.sender_id) } } as never) : undefined}
              />
            </Reanimated.View>
          ))}
        </View>
      ) : null}

      {/* Beside message requests: somebody asking to start talking. Behind BOARD_ENABLED until the board's safety half ships. */}
      {BOARD_ENABLED && !trimmed ? <BoardRequestsSection refreshKey={inbox.boardRefreshKey} onCount={setBoardCount} /> : null}
    </View>
  )

  return (
    <View style={styles.screen}>
      <FlatList
        ref={listRef}
        testID="banter-list"
        data={inbox.loading && !items.length ? [] : shown}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // #27 / C12, in a real touch's order (components/banter/hold.ts).
        onTouchStart={() => {
          touchStartAt.current = Date.now()
          step('touchStart')
        }}
        onScrollBeginDrag={() => step('dragBegin')}
        onScrollEndDrag={() => step('dragEnd')}
        onTouchEnd={() => step('touchEnd')}
        onTouchCancel={() => step('touchEnd')}
        onMomentumScrollBegin={() => step('momentumBegin')}
        onMomentumScrollEnd={() => step('momentumEnd')}
        ListEmptyComponent={
          inbox.loading ? (
            <BanterSkeleton />
          ) : trimmed ? (
            <StateScreen
              icon="search"
              title={`No chats match “${query.trim()}”`}
              actions={[{ label: 'Clear search', kind: 'secondary', onPress: () => setQuery('') }]}
              testID="banter-no-match"
            />
          ) : inbox.listFailed ? (
            <StateScreen
              icon="cloud-off"
              title="Couldn’t load your chats"
              body="Check your connection and try again."
              actions={[{ label: 'Try again', onPress: () => void inbox.loadChats(true, true) }]}
              testID="banter-failed"
            />
          ) : hasHeaderContent ? null : (
            // Live rooms or requests with nothing else is not an empty inbox.
            <StateScreen
              icon="message-circle"
              title="No conversations yet"
              body="Blend in to an event and its room appears here — or message someone you met there."
              actions={[{ label: 'Explore events', onPress: () => router.push('/(tabs)/events' as never) }]}
              testID="banter-empty"
            />
          )
        }
        contentContainerStyle={[styles.content, { paddingTop: listTop, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + SPACE.xl }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={inbox.refreshing}
            onRefresh={() => {
              H.threshold()
              void inbox.onRefresh()
            }}
            tintColor={COLOR.textSecondary}
            progressViewOffset={listTop}
          />
        }
      />

      <BanterHeader
        bell={<NotificationBell />}
        searching={searching}
        onSearch={() => {
          setSearching((s) => !s)
          setQuery('')
        }}
        canMarkAll={hasUnread}
        onMarkAll={() => void inbox.handleMarkAllRead()}
      />
      {searching ? (
        <View style={[styles.search, { top: headerHeight + SPACE.sm }]}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search conversations" autoFocus testID="banter-search" />
        </View>
      ) : null}
      <RealtimeStatusBanner status={inbox.socketStatus} style={{ ...styles.banner, top: listTop - SPACE.sm }} />
      {newAbove ? (
        <NewAbovePill
          top={listTop}
          onPress={() => {
            step('release')
            listRef.current?.scrollToOffset({ offset: 0, animated: true })
          }}
        />
      ) : null}

      <MuteSheet chatGroupId={muteFor} onClose={() => setMuteFor(null)} />
      <LeaveRoomSheet chatGroupId={leaveFor} onClose={() => setLeaveFor(null)} onLeft={() => setOpenSwipe(null)} />
    </View>
  )
}

/** The search field's height (SearchField: a 48 pt capsule). */
const SEARCH_FIELD = 48
const REQUEST_REFLOW = LinearTransition.duration(DURATION.base).easing(Easing.bezier(...EASING.standard))

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.ink },
  content: { paddingHorizontal: SPACE.gutter },
  sections: { gap: SPACE.xl, marginBottom: SPACE.xl },
  section: { gap: SPACE.md },
  heading: { paddingTop: SPACE.lg, paddingBottom: SPACE.sm },
  search: { position: 'absolute', left: SPACE.lg, right: SPACE.lg, zIndex: 2 },
  banner: { position: 'absolute', left: SPACE.gutter, right: SPACE.gutter, zIndex: 2 },
  secondary: { color: COLOR.textSecondary },
})

/*
 * Wrapped so `lib/perf.tsx` can report what this screen costs to render.
 * `ScreenProfiler` is the children untouched in production — see its header.
 */
export default function Chat() {
  return (
    <ScreenProfiler id="banter">
      <ChatInner />
    </ScreenProfiler>
  )
}

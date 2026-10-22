import { router, useLocalSearchParams } from 'expo-router'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, Platform, StyleSheet, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useBlendRoom } from '../../components/crews/BlendRoom'
import { ChatHeader, chatFeedFrame, chatHeaderBottom, SubtitleText } from '../../components/chat/ChatHeader'
import { BrokenLink } from '../../components/chat/BrokenLink'
import { KeyboardFrame } from '../../components/chat/KeyboardFrame'
import { CountLine, FeedSkeleton, JustMutedLine, LoadOlder, NewestChip, ReactionFlight, RoomCover, type Flight } from '../../components/chat/ChatParts'
import { RoomGuidelinesBanner } from '../../components/chat/RoomGuidelinesBanner'
import { RoomMessageRow, RoomOutside, senderOf, type Outside, type RowHandlers } from '../../components/chat/RoomFeed'
import { SenderCard, type Sender } from '../../components/chat/SenderCard'
import { ChatBubble } from '../../components/ds/ChatBubble'
import type { Rect } from '../../components/ds/chatShared'
import { Composer } from '../../components/ds/Composer'
import { LongPressMenu, placeLongPress, type MenuItem } from '../../components/ds/ContextMenu'
import { Grain } from '../../components/ds/Grain'
import { HueProvider } from '../../components/ds/shared'
import { Orbs } from '../../components/ds/Orbs'
import { REACTION_CELL, reactionBarWidth } from '../../components/ds/ReactionBar'
import { StateScreen } from '../../components/ds/StateScreen'
import { TypingIndicator } from '../../components/ds/TypingIndicator'
import { DayPill } from '../../components/ds/UnreadDivider'
import RealtimeStatusBanner from '../../components/RealtimeStatusBanner'
import { useToast } from '../../components/Toast'
import { apiClient, type ChatReaction } from '../../lib/apiClient'
import { LINKS_LINE, refusalPlace, runPlace } from '../../lib/chatFeed'
import { emitChatListUpdate } from '../../lib/chatListUpdates'
import { draftOf, failedOf, keepFailed, roomThread, setDraft } from '../../lib/chatOutbox'
import { CHAT_REACTIONS } from '../../lib/chatReactions'
import { copyText, linkSheet, notSentSheet } from '../../lib/chatSheets'
import { idParam, nameParam } from '../../lib/routeParams'
import { subscribeCheckInChanged } from '../../lib/checkIn'
import { newClientId } from '../../lib/clientId'
import { BLEND_CLOSED_LINE, defaultRoomName, roomClosedLine, roomKindParam } from '../../lib/crews'
import { COLOR, SIZE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useKeyboardShown } from '../../lib/keyboard'
import { markDomainsDirty } from '../../lib/liveSyncState'
import { Logger } from '../../lib/logger'
import { mergeNewestPage } from '../../lib/mergeNewestPage'
import { messageMenu, type MessageMenu } from '../../lib/messageMenu'
import { useActiveThread } from '../../lib/notifications'
import { ScreenProfiler } from '../../lib/perf'
import { roomRefusalState } from '../../lib/placeRoom'
import { queryCache } from '../../lib/queryCache'
import { toggleReaction, withMine } from '../../lib/reactions'
import { isMuted, markRoomJoined, markRoomLeft, roomSubtitle, useRoomMembership, useRoomMute } from '../../lib/roomMembership'
import { isSpeech, isTemp, roomMessageFromSocket, roomMessagesFrom, type RoomMessage as Message } from '../../lib/roomMessages'
import { useRoomRow, type RoomRow } from '../../lib/roomRow'
import { blockStep, messageReportStep } from '../../lib/safetyUtils'
import { sendOutcome } from '../../lib/sendOutcome'
import { showSheet } from '../../lib/sheet'
import {
  rejoinChatSocket,
  startTyping,
  stopTyping,
  subscribeToChatMemberBanned,
  subscribeToChatMemberLeft,
  subscribeToChatMemberMuted,
  subscribeToChatMessage,
  subscribeToChatMessageDeleted,
  subscribeToChatReaction,
  subscribeToChatTyping,
  subscribeToLiveEnded,
} from '../../lib/socketClient'
import { clockTime } from '../../lib/time'
import { withDaySeparators } from '../../lib/unreadDivider'
import { useAuth } from '../../lib/useAuth'
import { lockFor, useComposerLock } from '../../lib/useComposerLock'
import { scrollListToEnd, useFollowEnd } from '../../lib/useFollowEnd'
import { useLatest } from '../../lib/useLatest'
import { useLiveSync } from '../../lib/useLiveSync'
import { isOffline, useWaitingSends } from '../../lib/useWaitingSends'
import { userMessage } from '../../lib/userMessage'

type ChatListItem = ({ kind: 'message' } & Message) | { kind: 'separator'; id: string; label: string }

let _tempIdCounter = 0
const MESSAGES_CACHE_TTL = 60 * 1000
/** Read as "at the newest": the reader is within this of the end. */
const AT_END = 80
/** iOS dismisses the keyboard interactively with the drag; Android on the drag (R3-D5 5.3). */
const KEYBOARD_DISMISS = Platform.OS === 'ios' ? 'interactive' : 'on-drag'
const REACTION_INDEX = Object.fromEntries(CHAT_REACTIONS.map((e, i) => [e, i])) as Record<string, number>
const stamp = (m: { created_at: string }) => Date.parse(m.created_at) || 0

/**
 * The event room chat (Flow 5 room frames, R2-D2, R3-0, R3-D5), as a route:
 * the chat room id, and what the opener knew about its room, come from the URL.
 *
 * A glass capsule header over the orbs (the room's square cover, its name, a
 * live count); a feed that scrolls under it and under a floating glass
 * composer. Messages run by sender; broadcasts span the column; typing sits at
 * the end. A long-press lifts the bubble with the six reactions and the menu
 * for its kind (`lib/messageMenu.ts`); a swipe right replies; a sender's face
 * or name opens their card. The composer says why it can't post, in the
 * server's words. Crew chats and Blend rooms are this screen too (`kind`).
 */
function GroupChatInner() {
  const params = useLocalSearchParams()
  const chatRoomId = params.id
  const roomId = String(chatRoomId)
  const insets = useSafeAreaInsets()
  const window = useWindowDimensions()
  const keyboardUp = useKeyboardShown()
  // A reply push for this room is not shown over it (`lib/notifications.ts`).
  useActiveThread(`room:${roomId}`)
  /* The opener's knowledge of the room, filled in from the room's row in the Banter's list when it is missing. */
  const roomInfo: Partial<RoomRow> = useRoomRow(chatRoomId ? roomId : null) ?? {}
  /*
   * The server's row wins; the route's names are a first paint, and a route
   * never supplies an image — `blendn://chat/x?eventImage=…` is anybody's link,
   * and drawing it fetched a host the server never named (Flow 5 security review).
   */
  const roomName = roomInfo.title || nameParam(params.roomName)
  const eventTitle = roomInfo.title || nameParam(params.eventTitle)
  const eventImage = roomInfo.image
  const { user: authUser, loading: authLoading } = useAuth()
  const thread = roomThread(roomId, authUser?.id)
  // A failed send survives leaving the room (SCRUM-633): put back what this phone kept.
  const [messages, setMessages] = useState<Message[]>(() => failedOf<Message>(thread))
  // Read by a refresh to decide whether the older-page cursor moves (lib/mergeNewestPage).
  const messagesRef = useLatest(messages)
  const [newMessage, setNewMessage] = useState(() => draftOf(thread))
  const [loading, setLoading] = useState(true)
  /* The in-flight guard against a double tap landing before `setNewMessage('')` flushes. */
  const sendInFlightRef = useRef(false)
  const composer = useComposerLock()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map())
  const [hasMore, setHasMore] = useState(false)
  const [oldestCursor, setOldestCursor] = useState<string | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [awayFromEnd, setAwayFromEnd] = useState(false)
  /** Messages that arrived while you were reading back: the chip's count. */
  const [newWhileAway, setNewWhileAway] = useState(0)
  /* History did not load. Drawn only while there is nothing on screen. */
  const [loadError, setLoadError] = useState(false)
  /*
   * Not in the room. `left` is a leave the app knows about (made here, or the
   * server's LEFT_ROOM), kept in `lib/roomMembership.ts` so Room info and the
   * Banter agree; `outOfRoom` is history refused as a non-member.
   */
  const [outOfRoom, setOutOfRoom] = useState(false)
  /* A place's room after your Go Live there ended (`NOT_LIVE`): going live again is the way back. */
  const [notLive, setNotLive] = useState(false)
  const notLiveRef = useLatest(notLive)
  /** Removed by the organiser (`USER_BANNED`), in the server's sentence (R2-D2 room states #01). */
  const [removedLine, setRemovedLine] = useState<string | null | undefined>(undefined)
  /** An event room that is not there any more (404, R2-D2 room states #02). */
  const [gone, setGone] = useState(false)
  /** A mute that arrived while you were here (`chat:memberMuted`, R2-D2 composer #06). */
  const [justMuted, setJustMuted] = useState(false)
  /** The place, from the opener (the place screen) or the room's own row (M4). */
  const openedFromPlace = idParam(params.venueId)
  const venueId = openedFromPlace ?? roomInfo.venueId ?? null
  /* A crew's or a Blend's room (step 9), told by the opener; null for an event's. */
  const roomKind = roomKindParam(params.kind) ?? roomInfo.kind ?? null
  const eventRoom = roomKind === null
  /* Back, or — opened from a push with nothing underneath — the Banter. */
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/chat'))
  const crewIdParam = idParam(params.crewId) ?? roomInfo.crewId
  const blendIdParam = idParam(params.blendId) ?? roomInfo.blendId
  const [closedLine, setClosedLine] = useState<string | null>(null)
  const [rejoining, setRejoining] = useState(false)
  const left = useRoomMembership().left.has(roomId)
  const top = chatHeaderBottom(insets.top)
  /* A Blend's sides sit above the feed in this same room, not on a page of their own (Flow 10 · 10.9). */
  const blendRoom = useBlendRoom(roomKind === 'blend' ? (blendIdParam ?? null) : null, top)
  // A Blend not listed to you any more after being listed is closed for you: its clock, or a block across its sides refused your door.
  const outside: Outside | null =
    closedLine !== null
      ? { kind: 'closed', line: closedLine }
      : blendRoom.gone
        ? { kind: 'closed', line: BLEND_CLOSED_LINE }
        : removedLine !== undefined
        ? { kind: 'removed', line: removedLine }
        : gone
          ? { kind: 'gone' }
          : notLive
            ? { kind: 'not_live' }
            : left
              ? { kind: 'left' }
              : outOfRoom
                ? { kind: 'out' }
                : null
  const muted = isMuted(useRoomMute(chatRoomId ? roomId : null))
  /** From the room list (`memberCount`), less anyone who leaves while you watch (`chat:memberLeft`). */
  const [leftSince, setLeftSince] = useState(0)
  const memberCount = roomInfo.memberCount ? Math.max(0, roomInfo.memberCount - leftSince) : null
  const { showToast } = useToast()

  /* The long-press, a sender's card, your reaction's flight (#36, 5.1, #37). */
  const [menu, setMenu] = useState<{ message: Message; anchor: Rect } | null>(null)
  const [cardFor, setCardFor] = useState<Sender | null>(null)
  const [flight, setFlight] = useState<Flight | null>(null)
  const flightFor = useRef<{ id: string; emoji: string } | null>(null)
  const [landed, setLanded] = useState<{ id: string; emoji: string } | null>(null)
  /** People blocked from here: their messages fade from the feed (R3-D5 5.7). */
  const [blocked, setBlocked] = useState<ReadonlySet<string>>(() => new Set())
  const [dockHeight, setDockHeight] = useState<number>(SIZE.input)

  const flatListRef = useRef<FlatList<ChatListItem>>(null)
  const isAtBottomRef = useRef(true)
  /* Messages that rise as they mount: a live arrival while you were at the bottom. Cleared after a second. */
  const arrivingRef = useRef(new Set<string>())
  const markArriving = (id: string) => {
    arrivingRef.current.add(id)
    setTimeout(() => arrivingRef.current.delete(id), 1000)
  }
  /*
   * Every message id this screen has held. The chip counts a socket message
   * only the first time its id is seen: a redelivery, or one history already
   * brought, is not new (the updater's dedupe can't say so — it runs later).
   */
  const seenIds = useRef(new Set<string>())
  useEffect(() => {
    for (const m of messages) seenIds.current.add(m.message_id)
  }, [messages])
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingActiveSentRef = useRef(false)
  const typingCleanupRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const cacheWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Per account: the cached page labels its reader's own messages "You" and carries their reactions.
  const messagesCacheKey = chatRoomId && authUser?.id ? `chat_messages_${authUser.id}_${chatRoomId}` : null

  const scrollToBottom = (animated = true) => scrollListToEnd(flatListRef.current, animated)
  /* Follows the end as content lays out, until a real drag: the newest stays pinned as the keyboard moves (#34). */
  const follow = useFollowEnd(() => scrollToBottom(false))
  const setMessage = (id: string, change: (m: Message) => Message) =>
    setMessages((prev) => prev.map((m) => (m.message_id === id ? change(m) : m)))

  /* Starts a microtask after it is called, so every write comes from a callback. */
  const loadMessages = (force = false, refreshEvenIfCached = false) =>
    Promise.resolve(authUser)
      .then(async (user) => {
        if (!user) return
        if (!force && messagesCacheKey) {
          const cached = queryCache.get<Message[]>(messagesCacheKey)
          if (cached) {
            setMessages((prev) => mergeNewestPage(prev, cached, (m) => m.message_id, isTemp).items)
            setLoading(false)
            if (!refreshEvenIfCached) return
          }
        }

        const result = await apiClient.getChatMessages(roomId, { limit: 50 })
        // Not while this phone knows you left: a Blend answers a leaver's read with the 403 it gives somebody it took out.
        const closed = !result.success && roomKind && !left ? roomClosedLine(roomKind, result.errorCode) : null
        if (closed) return setClosedLine(closed)
        if (!result.success && result.errorCode === 'USER_BANNED') return setRemovedLine(result.error || null)
        if (!result.success && result.errorCode === 'NOT_FOUND' && eventRoom) return setGone(true)
        /* Refused as somebody not in the room: the left state, not "Couldn't load" — Try again would be refused for ever. */
        const refused = result.success ? null : roomRefusalState(result.errorCode)
        if (refused) {
          if (refused === 'left') markRoomLeft(roomId)
          else if (refused === 'out') setOutOfRoom(true)
          else setNotLive(true)
          return
        }
        if (!result.success || !result.data) return setLoadError(true)
        setLoadError(false)
        // Served: whatever this screen said about the room being closed or gone, it is open.
        setClosedLine(null)
        setOutOfRoom(false)
        setRemovedLine(undefined)
        setGone(false)
        // Live again at the place: the socket was taken out of the room at the end (M3).
        if (notLiveRef.current) rejoinChatSocket(roomId)
        setNotLive(false)
        markRoomJoined(roomId)

        const raw = Array.isArray(result.data) ? result.data : (result.data as any)?.messages || (result.data as any)?.data || []
        const pagination = (result.data as any)?.pagination
        const msgs = roomMessagesFrom(Array.isArray(raw) ? raw : [], user.id)
        /* A refresh keeps the older pages already loaded, and what only this phone holds (lib/mergeNewestPage). */
        const { keptOlder } = mergeNewestPage(messagesRef.current, msgs, (m) => m.message_id, isTemp)
        setMessages((prev) => mergeNewestPage(prev, msgs, (m) => m.message_id, isTemp).items)
        if (!keptOlder) {
          setHasMore(pagination?.hasMore || false)
          setOldestCursor(pagination?.nextCursor || null)
        }
        if (messagesCacheKey) queryCache.set(messagesCacheKey, msgs, MESSAGES_CACHE_TTL)
      })
      .catch((err) => {
        Logger.error('chat', 'Error loading messages', { error: err })
        setLoadError(true)
      })
      .finally(() => setLoading(false))

  const loadOlderMessages = async () => {
    if (loadingOlder || !hasMore || !oldestCursor || !authUser) return
    setLoadingOlder(true)
    try {
      const result = await apiClient.getChatMessages(roomId, { limit: 50, before: oldestCursor })
      if (!result.success || !result.data) return
      const raw = Array.isArray(result.data) ? result.data : (result.data as any)?.messages || []
      const pagination = (result.data as any)?.pagination
      setHasMore(pagination?.hasMore || false)
      setOldestCursor(pagination?.nextCursor || null)
      const older = roomMessagesFrom(Array.isArray(raw) ? raw : [], authUser.id)
      setMessages((prev) => {
        const ids = new Set(prev.map((m) => m.message_id))
        return [...older.filter((m) => !ids.has(m.message_id)), ...prev]
      })
    } catch (err) {
      Logger.error('chat', 'Error loading older messages', { error: err })
    } finally {
      setLoadingOlder(false)
    }
  }

  // The cache stays warm, and this phone's unsent messages stay where the room (and the Banter) can find them.
  useEffect(() => {
    keepFailed(thread, messages.filter((m) => m.failed || m.waiting))
    if (!messagesCacheKey) return
    if (cacheWriteTimerRef.current) clearTimeout(cacheWriteTimerRef.current)
    cacheWriteTimerRef.current = setTimeout(() => {
      queryCache.set(messagesCacheKey, messages.filter((m) => !isTemp(m)), MESSAGES_CACHE_TTL)
    }, 500)
    return () => {
      if (cacheWriteTimerRef.current) clearTimeout(cacheWriteTimerRef.current)
    }
  }, [messages, messagesCacheKey, thread])

  // The composer's text stays with the thread when you leave it (the Banter's "Draft ·", R3-D5 5.8).
  const draftRef = useLatest(newMessage)
  useEffect(() => () => setDraft(thread, draftRef.current), [thread, draftRef])

  // Follows the signed-in user once the room can load (adjusted in render).
  if (chatRoomId && authUser && !authLoading && currentUser !== authUser) setCurrentUser(authUser)

  useEffect(() => {
    if (chatRoomId && authUser && !authLoading) loadMessages(false, true)
    // loadMessages is redefined every render; only the listed values should trigger a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatRoomId, authUser, authLoading])

  const subscribeToMessages = () => {
    if (!chatRoomId) return () => {}
    const unsubscribe = [
      subscribeToChatMessage(roomId, (data) => {
        const incoming = roomMessageFromSocket(data.message, currentUser?.id)
        const fresh = !seenIds.current.has(incoming.message_id)
        // At the bottom, somebody else's message rises as it arrives (#13); read back, the list never moves (the chip counts it).
        if (fresh && isAtBottomRef.current && data.message.userId !== currentUser?.id) markArriving(incoming.message_id)
        seenIds.current.add(incoming.message_id)
        setMessages((prev) =>
          prev.some((m) => m.message_id === incoming.message_id)
            ? prev
            : // The quote resolves here: its parent is already in the list.
              [...prev, { ...incoming, replyTo: incoming.reply_to_message_id ? prev.find((m) => m.message_id === incoming.reply_to_message_id) : undefined }]
        )
        setTypingUsers((prev) => {
          if (!prev.has(data.message.userId)) return prev
          const next = new Map(prev)
          next.delete(data.message.userId)
          return next
        })
        // Reading back: count it on the chip rather than pulling you down. Incoming plays no haptic.
        if (isAtBottomRef.current) setTimeout(() => scrollToBottom(true), 80)
        else if (fresh && data.message.userId !== currentUser?.id) setNewWhileAway((n) => n + 1)
      }),
      subscribeToChatTyping(roomId, (data) => {
        if (data.userId === currentUser?.id) return
        const timers = typingCleanupRefs.current
        clearTimeout(timers.get(data.userId))
        timers.delete(data.userId)
        const forget = () =>
          setTypingUsers((p) => {
            const n = new Map(p)
            n.delete(data.userId)
            return n
          })
        if (!data.isTyping) return forget()
        setTypingUsers((p) => new Map(p).set(data.userId, data.userName))
        timers.set(
          data.userId,
          setTimeout(() => {
            timers.delete(data.userId)
            forget()
          }, 3000)
        )
      }),
      /* The server sends the whole tally, so this replaces rather than merges: counts, never who. */
      subscribeToChatReaction(roomId, (data) => setMessage(data.messageId, (m) => ({ ...m, reactions: withMine(data.tally, m.reactions) }))),
      /* A moderation removal of your own message becomes the placeholder; everyone else's copy simply goes. */
      subscribeToChatMessageDeleted(roomId, (data) => {
        const ownRemoval = data.moderation && data.userId && data.userId === currentUser?.id
        setMessages((prev) =>
          ownRemoval
            ? prev.map((m) => (m.message_id === data.messageId ? { ...m, removed: true, message_text: '' } : m))
            : prev.filter((m) => m.message_id !== data.messageId)
        )
      }),
      // Removed while reading: the room becomes the removed state (R2-D2 #01), never a modal.
      subscribeToChatMemberBanned(roomId, (data) => {
        if (data.userId === currentUser?.id && data.banned) setRemovedLine('The organiser has removed you from this room.')
      }),
      // Somebody left: one fewer in the header's count.
      subscribeToChatMemberLeft(roomId, () => setLeftSince((n) => n + 1)),
      // A mute arriving live flips the composer in place, with a "Just now" line (R2-D2 #06).
      subscribeToChatMemberMuted(roomId, (data) => {
        if (data.userId !== currentUser?.id) return
        composer.setLock(data.muted ? { state: 'muted', reason: data.reason } : null)
        setJustMuted(data.muted)
      }),
    ]
    return () => {
      unsubscribe.forEach((u) => u())
      typingCleanupRefs.current.forEach((t) => clearTimeout(t))
      typingCleanupRefs.current.clear()
    }
  }

  /* Not while outside the room: the server refuses the join. A rejoin subscribes again (`join:chat`). */
  useEffect(() => {
    if (!chatRoomId || !currentUser || outside) return
    return subscribeToMessages()
    // subscribeToMessages is redefined every render; only the listed values should re-subscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatRoomId, currentUser, outside === null])

  /*
   * One send of one message, first time or retry. The bubble is already on
   * screen; this decides whether it stays as sent, becomes the removed
   * placeholder (moderation), or is marked failed with the reason.
   */
  const deliver = async (optimistic: Message) => {
    try {
      const result = await apiClient.sendChatMessage(roomId, optimistic.message_text, 'text', undefined, optimistic.reply_to_message_id ?? undefined, optimistic.client_id)
      if (!result.success && result.errorCode === 'USER_BANNED') return setRemovedLine(result.error || null)
      // Every answer re-decides the lock: a refusal sets it, a send that got through lifts it.
      const place = result.success ? null : refusalPlace(result.errorCode, result.error)
      if (place !== 'links') composer.apply(result.success ? null : result.errorCode, result.retryAfter, result.error)
      if (result.success) setJustMuted(false)
      const closed = !result.success && roomKind ? roomClosedLine(roomKind, result.errorCode) : null
      if (closed) setClosedLine(closed)
      const sendRefused = result.success ? null : roomRefusalState(result.errorCode)
      if (sendRefused === 'left') markRoomLeft(roomId)
      else if (sendRefused === 'not_live') setNotLive(true)
      const outcome = sendOutcome(result)
      if (outcome.kind === 'failed') {
        // H.error once, on the answer; the bubble stays, marked.
        H.error()
        setMessage(optimistic.message_id, (m) => ({ ...m, failed: true, waiting: false, failedLine: place === 'links' ? LINKS_LINE : undefined }))
        // The lock or the bubble already says why; anything else is the server's sentence.
        if (!place && !closed && !sendRefused && !lockFor(result.errorCode)) showToast(outcome.reason, 'error')
        return
      }
      const newId = result.data?.id
      // Withheld by moderation: the dashed placeholder in its place and a toast, never a modal (Flow 5 #12).
      if (outcome.kind === 'withheld') {
        setMessage(optimistic.message_id, (m) => ({ ...m, message_id: newId ?? m.message_id, removed: true, failed: false }))
        showToast('That message wasn’t delivered.', 'info')
        return
      }
      /* The socket's echo of your own message can land first: then the optimistic copy is the one to drop. */
      if (newId)
        setMessages((prev) =>
          prev.some((m) => m.message_id === newId)
            ? prev.filter((m) => m.message_id !== optimistic.message_id)
            : prev.map((m) => (m.message_id === optimistic.message_id ? { ...m, message_id: newId, failed: false } : m))
        )
      markDomainsDirty(['chat'])
    } catch (error) {
      Logger.warn('chat', 'send failed', { error })
      setMessage(optimistic.message_id, (m) => ({ ...m, failed: true, waiting: false }))
      showToast("Couldn't send. Try again.", 'error', { haptic: 'error' })
    }
  }

  /* Offline: a send waits, sends itself on reconnect, and is "Not sent" after two minutes (R3-D5 5.8). */
  const holdForConnection = useWaitingSends<Message>({
    waiting: () => messagesRef.current.filter((m) => m.waiting),
    resend: (m) => {
      setMessage(m.message_id, (x) => ({ ...x, waiting: false }))
      void deliver({ ...m, waiting: false })
    },
    expire: (id) => setMessage(id, (m) => (m.waiting ? { ...m, waiting: false, failed: true } : m)),
  })

  const sendMessage = async () => {
    if (!newMessage.trim() || !currentUser || sendInFlightRef.current) return
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    stopTyping(roomId)
    sendInFlightRef.current = true
    const messageText = newMessage.trim()
    const offline = isOffline()
    const optimistic: Message = {
      message_id: 'temp-' + ++_tempIdCounter,
      sender_id: currentUser.id,
      sender_name: 'You',
      message_text: messageText,
      message_type: 'text',
      reply_to_message_id: replyingTo ? replyingTo.message_id : null,
      client_id: newClientId(),
      created_at: new Date().toISOString(),
      replyTo: replyingTo || undefined,
      ...(offline ? { waiting: true } : {}),
    }
    setMessages((prev) => [...prev, optimistic])
    setNewMessage('')
    setReplyingTo(null)
    // Your own send brings the end back into view and follows it again.
    follow.noteAtEnd(true)
    setNewWhileAway(0)
    setTimeout(() => scrollToBottom(true), 80)
    if (authUser?.id) queryCache.invalidate(`group_chats_${authUser.id}`)
    emitChatListUpdate({ type: 'group', chatGroupId: roomId, lastMessage: messageText, lastMessageTime: optimistic.created_at, senderName: 'You' })
    if (offline) holdForConnection(optimistic.message_id)
    // `deliver` catches its own failures, so this always runs.
    else await deliver(optimistic)
    sendInFlightRef.current = false
  }

  const retrySend = (message: Message) => {
    setMessage(message.message_id, (m) => ({ ...m, failed: false, failedLine: undefined }))
    void deliver({ ...message, failed: false, failedLine: undefined })
  }

  /* A reaction lands at once; the server's tally replaces it. Refused, it goes back and says so (#39). */
  const react = async (message: Message, emoji: ChatReaction) => {
    const before = message.reactions
    setMessage(message.message_id, (m) => ({ ...m, reactions: toggleReaction(m.reactions, emoji) }))
    const result = await apiClient.reactToChatMessage(roomId, message.message_id, emoji)
    if (result.success && result.data) {
      const tally = result.data.reactions
      return setMessage(message.message_id, (m) => ({ ...m, reactions: tally }))
    }
    setMessage(message.message_id, (m) => ({ ...m, reactions: before }))
    const reactRefused = roomRefusalState(result.errorCode)
    if (reactRefused === 'left') markRoomLeft(roomId)
    else if (reactRefused === 'not_live') setNotLive(true)
    else if (lockFor(result.errorCode)) composer.apply(result.errorCode, undefined, result.error)
    showToast(userMessage(result, "Couldn't add your reaction. Try again."), 'error', { haptic: 'error' })
  }

  /* Back in, or the server's refusal in its own words; a room you were never in is its 404 (check in). */
  const rejoin = async () => {
    if (rejoining || !chatRoomId) return
    setRejoining(true)
    const result = await apiClient.rejoinChatGroup(roomId)
    setRejoining(false)
    if (!result.success) {
      const closed = roomKind ? roomClosedLine(roomKind, result.errorCode) : null
      if (closed) return setClosedLine(closed)
      showToast(result.errorCode === 'NOT_FOUND' ? 'Check in at the event to join its room.' : userMessage(result, "Couldn't rejoin this room. Try again."), 'error', { haptic: 'error' })
      return
    }
    markRoomJoined(roomId)
    // The socket was refused this room while you were out of it.
    rejoinChatSocket(roomId)
    setOutOfRoom(false)
    setLoading(true)
    showToast("You're back in the room", 'success')
    void loadMessages(true)
  }

  /* "RSVP to this event to join the chat" with I'm going (ROUND3 C3): H.primary, then H.success on the answer. */
  const [rsvping, setRsvping] = useState(false)
  const imGoing = async () => {
    const eventId = roomInfo.eventId
    if (!eventId || rsvping) return
    H.primary()
    setRsvping(true)
    const result = await apiClient.rsvpToEvent(eventId, 'going')
    setRsvping(false)
    if (!result.success) {
      return showToast(userMessage(result, "Couldn't save your RSVP. Try again."), 'error', { haptic: 'error' })
    }
    H.success()
    composer.setLock(null)
  }

  /* A Go Live ended: only this room's re-reads, and answers NOT_LIVE (L2). */
  const loadMessagesRef = useLatest(loadMessages)
  const roomEventIdRef = useLatest(roomInfo.eventId ?? null)
  useEffect(
    () =>
      subscribeToLiveEnded((data) => {
        const mine = roomEventIdRef.current
        if (!mine || mine === data.eventId) void loadMessagesRef.current(true)
      }),
    [loadMessagesRef, roomEventIdRef]
  )
  // Not live here: going live again (anywhere in the app) is the way back in (M3).
  useEffect(() => {
    if (!notLive) return
    return subscribeCheckInChanged(() => void loadMessagesRef.current(true))
  }, [notLive, loadMessagesRef])

  /* Opened from the place, the place is underneath; from the Banter or a link, the place is opened (M4). */
  const goLiveAgain = () => {
    if (openedFromPlace || !venueId) router.back()
    else router.push(`/venue/${venueId}` as never)
  }

  const visible = useMemo(() => messages.filter((m) => !blocked.has(m.sender_id)), [messages, blocked])
  const chatItems: ChatListItem[] = useMemo(() => withDaySeparators(visible, (m) => m.created_at), [visible])

  const socketStatus = useLiveSync({
    enabled: !!chatRoomId && !!currentUser && !outside,
    onSync: () => loadMessages(false, true),
    domains: ['chat'],
    syncOnReconnect: true,
    disconnectedIntervalMs: 15000,
  })

  const myId = currentUser?.id
  /* Muted, locked, closed: the server refuses reactions too, so the bar does not offer them. */
  const refusesWrites = !!composer.lock && composer.lock.state !== 'ratelimited'
  /** What a long-press offers for this message (lib/messageMenu.ts, R3-D5 5.2). */
  const planFor = (message: Message): MessageMenu =>
    messageMenu({
      surface: 'room',
      mine: message.sender_id === myId,
      state: message.removed ? 'removed' : message.failed ? 'failed' : isTemp(message) ? 'sending' : 'sent',
      speech: isSpeech(message),
      refusesWrites,
    })

  /** After a block, their messages fade out of the feed (R3-D5 5.7). */
  const blockFromFeed = (senderId: string) => setBlocked((prev) => new Set(prev).add(senderId))

  const menuItems = (message: Message): MenuItem[] => {
    const plan = planFor(message)
    if (plan.kind !== 'menu') return []
    const items: Record<string, MenuItem> = {
      person: { icon: 'user', label: message.sender_name, chevron: true, onPress: () => setCardFor({ id: message.sender_id, name: message.sender_name }) },
      reply: { icon: 'reply', label: 'Reply', onPress: () => setReplyingTo(message) },
      // No haptic and no toast: copying is silent (C20).
      copy: { icon: 'copy', label: 'Copy', onPress: () => copyText(message.message_text) },
      report: { icon: 'flag', label: 'Report…', onPress: () => showSheet(messageReportStep(message.message_id, 'group', { about: message.sender_name })) },
      // The server takes the room's handle for them (R3-D5 5.1); the one confirm plays H.destructive.
      block: { icon: 'ban', label: 'Block…', destructive: true, onPress: () => showSheet(blockStep(message.sender_name, message.sender_id, () => blockFromFeed(message.sender_id))) },
    }
    // A crew's or a Blend's people are Flow 10's reduced sheet, its handles the room's own (SCRUM-623).
    return plan.items.filter((k) => eventRoom || (k !== 'person' && k !== 'block')).map((k) => items[k])
  }

  /* A failed send opens the Not sent sheet; anything else lifts over the dim (#36). The bubble played H.longPress. */
  const openMenu = (message: Message, anchor: Rect) => {
    const plan = planFor(message)
    if (plan.kind === 'none') return
    if (plan.kind === 'menu') return setMenu({ message, anchor })
    showSheet(
      notSentSheet({
        to: 'the room',
        text: message.message_text,
        onRetry: () => retrySend(message),
        onDelete: () => setMessages((prev) => prev.filter((m) => m.message_id !== message.message_id)),
      })
    )
  }

  /** #37: from the emoji in the bar to the chip under the bubble; the chip pops as it lands. */
  const flyReaction = (message: Message, anchor: Rect, emoji: ChatReaction) => {
    if ((message.reactions ?? []).some((r) => r.emoji === emoji && r.mine)) return
    const mine = message.sender_id === myId
    const at = placeLongPress({
      window,
      insets,
      anchor,
      side: mine ? 'right' : 'left',
      bar: { width: reactionBarWidth(), height: SIZE.control },
      menu: { width: 0, height: menuItems(message).length * SIZE.control },
    })
    if (!at.bar) return
    const cell = REACTION_CELL()
    flightFor.current = { id: message.message_id, emoji }
    setLanded(null)
    setFlight({
      key: Date.now(),
      emoji,
      from: { x: at.bar.left + SPACE.xs + (REACTION_INDEX[emoji] ?? 0) * cell + cell / 2, y: at.bar.top + SIZE.control / 2 },
      to: { x: mine ? anchor.x + anchor.width - SPACE.lg : anchor.x + SPACE.lg, y: anchor.y + anchor.height + SPACE.lg },
    })
  }

  /* Stable for the rows' memo: each reads the screen as it is when it fires. */
  const handlersRef = useLatest({ openMenu, retrySend, react })
  const handlers = useMemo<RowHandlers>(
    () => ({
      menu: (m, a) => handlersRef.current.openMenu(m, a),
      retry: (m) => handlersRef.current.retrySend(m),
      react: (m, e) => void handlersRef.current.react(m, e as ChatReaction),
      reply: (m) => setReplyingTo(m),
      sender: (m) => setCardFor({ id: m.sender_id, name: m.sender_name }),
      link: (url) => showSheet(linkSheet(url, 'room')),
    }),
    [handlersRef]
  )

  const renderChatItem = ({ item, index }: { item: ChatListItem; index: number }) => {
    if (item.kind === 'separator') return <DayPill text={item.label} />
    const place = runPlace(chatItems, index, (i) => (i.kind === 'message' && isSpeech(i) ? i.sender_id : null), (i) => (i.kind === 'message' ? stamp(i) : 0))
    return (
      <RoomMessageRow
        item={item}
        roomId={roomId}
        mine={item.sender_id === myId}
        first={place.first}
        last={place.last}
        landed={landed?.id === item.message_id ? landed.emoji : undefined}
        arriving={arrivingRef.current.has(item.message_id)}
        senderTappable={eventRoom}
        handlers={handlers}
      />
    )
  }

  const onChangeText = (text: string) => {
    setNewMessage(text)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    if (!text.length) {
      stopTyping(roomId)
      typingActiveSentRef.current = false
      return
    }
    if (!typingActiveSentRef.current) startTyping(roomId)
    typingActiveSentRef.current = true
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping(roomId)
      typingActiveSentRef.current = false
    }, 2000)
  }

  const name = roomName || defaultRoomName(roomKind)
  // Most rooms are named for their event: then the line is the live count (dot, Geist Mono), else the event's title.
  const line = roomSubtitle(name, eventTitle || undefined, memberCount)
  const subtitle = !line ? null : line === eventTitle ? <SubtitleText>{line}</SubtitleText> : <CountLine count={memberCount ?? 0} />
  const dockBottom = keyboardUp ? SPACE.sm : Math.max(insets.bottom, SPACE.lg)
  const lock = composer.lock
  const menuPlan = menu ? planFor(menu.message) : null

  return (
    <View style={styles.screen}>
      <Orbs set="brand" paused={keyboardUp} />
      <Grain />
      <KeyboardFrame>
        {outside ? (
          <RoomOutside outside={outside} rejoining={rejoining} onRejoin={() => void rejoin()} onGoLive={goLiveAgain} onBack={goBack} />
        ) : (
          <>
            <FlatList
              ref={flatListRef}
              testID="room-feed"
              data={loading && !messages.length ? [] : chatItems}
              renderItem={renderChatItem}
              keyExtractor={(item) => (item.kind === 'separator' ? item.id : item.message_id)}
              style={[styles.fill, chatFeedFrame(insets.top).style]}
              contentContainerStyle={[styles.listContent, { paddingTop: chatFeedFrame(insets.top, blendRoom.barSpace).paddingTop, paddingBottom: dockHeight + dockBottom + SPACE.md }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={KEYBOARD_DISMISS}
              maxToRenderPerBatch={12}
              windowSize={10}
              initialNumToRender={25}
              // "Load older" on pull at the top (Flow 5 room annotation); the button below is its accessible twin.
              onStartReached={() => void loadOlderMessages()}
              ListHeaderComponent={
                <View style={styles.listHead}>
                  {/* Event rooms are anonymous; a crew's people are named, so the notice would not be true there. */}
                  {eventRoom ? <RoomGuidelinesBanner userId={authUser?.id} chatRoomId={chatRoomId ? roomId : undefined} /> : null}
                  {hasMore ? <LoadOlder busy={loadingOlder} onPress={() => void loadOlderMessages()} /> : null}
                </View>
              }
              /* Typing lives at the end of the feed, in the bubble's shape (#14). */
              ListFooterComponent={
                typingUsers.size > 0 ? (
                  <View style={styles.typing}>
                    <TypingIndicator
                      people={Array.from(typingUsers.entries()).map(([id, n]) => senderOf({ sender_name: n || 'Someone', sender_id: id }, roomId))}
                      testID="room-typing"
                    />
                  </View>
                ) : null
              }
              ListEmptyComponent={
                loading ? (
                  <FeedSkeleton />
                ) : loadError ? (
                  // Never the empty state: a room that failed to load is not an invitation.
                  <View style={styles.centre}>
                    <StateScreen
                      icon="cloud-off"
                      title="Couldn’t load this chat"
                      body="Check your connection and try again."
                      actions={[
                        {
                          label: 'Try again',
                          onPress: () => {
                            setLoadError(false)
                            setLoading(true)
                            void loadMessages(true)
                          },
                        },
                      ]}
                      testID="room-failed"
                    />
                  </View>
                ) : (
                  <View style={styles.centre}>
                    <StateScreen
                      icon="message-circle"
                      title="Start the room conversation"
                      body="Be the first to post so everyone can join."
                      // Fills the composer for you to send or change: the tap sends nothing.
                      actions={[{ label: 'Write a starter', kind: 'lit', onPress: () => setNewMessage('Hey everyone 👋') }]}
                      testID="room-empty"
                    />
                  </View>
                )
              }
              onContentSizeChange={follow.onContentSizeChange}
              onScrollBeginDrag={follow.onScrollBeginDrag}
              onScroll={(e) => {
                const { contentSize, contentOffset, layoutMeasurement } = e.nativeEvent
                const atBottom = contentSize.height - contentOffset.y - layoutMeasurement.height < AT_END
                isAtBottomRef.current = atBottom
                follow.noteAtEnd(atBottom)
                setAwayFromEnd(!atBottom)
                if (atBottom) setNewWhileAway(0)
              }}
              scrollEventThrottle={80}
            />

            {awayFromEnd && messages.length ? (
              <NewestChip
                count={newWhileAway}
                bottom={dockHeight + dockBottom + SPACE.lg}
                onPress={() => {
                  setNewWhileAway(0)
                  scrollToBottom(true)
                }}
              />
            ) : null}

            <View style={[styles.dock, { paddingBottom: dockBottom }]} onLayout={(e) => setDockHeight(e.nativeEvent.layout.height - dockBottom)}>
              {justMuted && lock?.state === 'muted' ? <JustMutedLine /> : null}
              <Composer
                testID="room-composer"
                value={newMessage}
                onChangeText={onChangeText}
                onSend={() => void sendMessage()}
                state={lock?.state ?? 'normal'}
                reason={lock?.reason}
                countdown={composer.countdown}
                action={lock?.state === 'notcheckedin' && roomInfo.eventId ? { label: 'I’m going', onPress: () => void imGoing(), loading: rsvping } : undefined}
                reply={replyingTo ? { name: replyingTo.sender_name, text: replyingTo.message_text } : null}
                onCancelReply={() => setReplyingTo(null)}
                placeholder="Say something to the room"
                onFocus={() => setTimeout(() => scrollToBottom(false), 120)}
              />
            </View>
          </>
        )}
      </KeyboardFrame>

      <ChatHeader
        testID="room-header"
        title={blendRoom.title ?? name}
        muted={muted}
        leading={blendRoom.leading ?? <RoomCover uri={eventImage} />}
        subtitle={outside ? null : (blendRoom.subtitle ?? subtitle)}
        onBack={goBack}
        moreLabel={blendRoom.blend ? 'More' : 'Room info'}
        onMore={() =>
          blendRoom.blend
            ? blendRoom.openMenu()
            : crewIdParam
              ? router.push({ pathname: '/crews/[crewId]', params: { crewId: crewIdParam, fromChat: '1' } })
              : router.push({
                  pathname: '/chat-info/[id]',
                  params: { id: roomId, roomName: roomName || '', eventTitle: eventTitle || '' },
                } as never)
        }
      />
      {outside ? null : blendRoom.bar}
      {outside ? null : blendRoom.overlays}
      {outside ? null : <RealtimeStatusBanner status={socketStatus} style={{ ...styles.banner, top: top + blendRoom.barSpace }} />}

      <LongPressMenu
        testID="room-menu"
        visible={!!menu}
        anchor={menu?.anchor ?? null}
        side={menu && menu.message.sender_id === myId ? 'right' : 'left'}
        items={menu ? menuItems(menu.message) : []}
        reactions={
          menu && menuPlan?.kind === 'menu' && menuPlan.reactions
            ? {
                mine: (menu.message.reactions ?? []).filter((r) => r.mine).map((r) => r.emoji),
                onPick: (emoji) => {
                  flyReaction(menu.message, menu.anchor, emoji)
                  void react(menu.message, emoji)
                },
              }
            : undefined
        }
        onClose={() => setMenu(null)}
      >
        {menu ? (
          <ChatBubble
            lifted
            mine={menu.message.sender_id === myId}
            sender={senderOf(menu.message, roomId)}
            text={menu.message.message_text}
            replyTo={menu.message.replyTo ? { name: menu.message.replyTo.sender_name, text: menu.message.replyTo.message_text } : undefined}
            time={clockTime(menu.message.created_at)}
          />
        ) : null}
      </LongPressMenu>

      <ReactionFlight
        flight={flight}
        onLanded={() => {
          setLanded(flightFor.current)
          setFlight(null)
        }}
      />

      <SenderCard sender={cardFor} eventId={roomInfo.eventId ?? null} chatGroupId={roomId} onClose={() => setCardFor(null)} onBlocked={blockFromFeed} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.ink },
  fill: { flex: 1 },
  listContent: { paddingHorizontal: SPACE.gutter, flexGrow: 1, justifyContent: 'flex-end' },
  listHead: { gap: SPACE.lg, paddingBottom: SPACE.lg },
  typing: { marginTop: SPACE.lg },
  centre: { flexGrow: 1, justifyContent: 'center' },
  dock: { position: 'absolute', left: SPACE.lg, right: SPACE.lg, bottom: 0 },
  banner: { position: 'absolute', left: SPACE.gutter, right: SPACE.gutter },
})

/*
 * Wrapped so `lib/perf.tsx` can report what this screen costs to render.
 * `ScreenProfiler` is the children untouched in production — see its header.
 */
export default function GroupChat() {
  if (!idParam(useLocalSearchParams().id)) return <BrokenLink />
  // Rose world: a room is people together, as Banter and its DMs are; its sheets inherit it.
  return (
    <HueProvider value="rose">
      <ScreenProfiler id="event-chat">
        <GroupChatInner />
      </ScreenProfiler>
    </HueProvider>
  )
}

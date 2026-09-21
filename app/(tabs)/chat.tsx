import { ScreenProfiler } from '../../lib/perf'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import RealtimeStatusBanner from '../../components/RealtimeStatusBanner'
import { SkeletonCircle, SkeletonLine } from '../../components/Skeleton'
import { preloadImages } from '../../components/OptimizedImage'
import ScalePress from '../../components/motion/ScalePress'
import {
  BANTER_PADDING_HORIZONTAL,
  BANTER_SECTION_GAP,
  BanterConversation,
  BanterHeading,
  BanterPinned,
  BanterRequest,
  BanterSearch,
  ROW_AVATAR,
  type ConversationItem,
} from '../../components/banter/BanterSections'
import { matchRowPreview } from '../../lib/matchOpener'
import { NotificationBell } from '../../components/pulse/NotificationBell'
import { roomStateFrom, roomStateLine, type RoomState } from '../../lib/roomState'
import { PulseTopBar, TOP_BAR_HEIGHT } from '../../components/pulse/PulseTopBar'
import { apiClient } from '../../lib/apiClient'
import { subscribeChatListUpdates } from '../../lib/chatListUpdates'
import { hasDirtyDomain } from '../../lib/liveSyncState'
import { Logger } from '../../lib/logger'
import { queryCache } from '../../lib/queryCache'
import {
  ChatMessageCallback,
  PrivateMessageCallback,
  subscribeToChatMessage,
  subscribeToUserNotifications,
} from '../../lib/socketClient'
import { EMBER, EMBER_FONTS } from '../../lib/theme'
import { setConversationLastRead, syncUnreadCache } from '../../lib/unread'
import { useAuth } from '../../lib/useAuth'
import { useLiveSync } from '../../lib/useLiveSync'
import { TAB_BAR_CLEARANCE } from './_layout'

/**
 * The Banter — frame `1141:5247` on the Updates canvas.
 *
 * ## One inbox, not two tabs
 *
 * The screen this replaced split rooms and people into a `group` / `personal`
 * segmented control, and only ever fetched the visible half. The frame has a
 * single **Recent** list: a person is a photograph, a room is a `#211F1F` disc
 * with a glyph, and that is the whole distinction.
 *
 * It is the better model, and not only because it is the design. A tabbed
 * inbox makes you check two places for "did anyone message me", and the tab
 * you are not looking at is the one with the unread message on it. Merging
 * costs one extra request on first load and removes a decision from every
 * visit.
 *
 * ## The rail is "Live now", not "Pinned"
 *
 * The frame's top rail is labelled Pinned, and nothing in the product can pin
 * a conversation — no column, no endpoint, no gesture. Filling it from "most
 * recent" would have duplicated the list directly beneath it under a label
 * that lies.
 *
 * What *is* pinned, by circumstance rather than by a gesture, is the event you
 * are standing in. A room you are checked into is a different object from the
 * rest of the inbox: temporary, anonymous, and only useful while you are
 * there. It is the one conversation that should be at the top without being
 * put there, and it is the only one that stops being relevant on its own.
 *
 * So the rail keeps the frame's component and geometry and changes its
 * heading. Those rooms are lifted out of Recent rather than repeated in it.
 * `isCheckedIn` comes from the API — `checked_in` with no `check_out_time`,
 * which the client cannot derive, because "the event is on now" is not the
 * same as "I am there".
 *
 * ## Also not from the frame
 *
 * - **A menu button** in the top bar's leading slot, which has nowhere to go.
 * - **The compose FAB**, removed by decision: a DM starts from a person, and
 *   every path to one already goes through a profile.
 *
 * ## Anonymity holds in the inbox
 *
 * A DM that opens from a mutual like carries the pseudonym the match card
 * showed, and the real name appears only when that person reveals. The server
 * gates it — pre-reveal, `name` is the pseudonym and `image` is `null` — so the
 * list cannot leak a name it was never sent.
 *
 * What it *can* get wrong is drawing that state as a fault. A null photo
 * through the ordinary avatar is an empty grey circle, which reads as a broken
 * row rather than as anonymity working. `theyRevealed` is carried through so an
 * unrevealed match gets the generated mark instead — the same one the Scene's
 * discs and the room use, seeded on the pseudonym.
 *
 * `revealRequested` is carried and **not yet drawn**: the frame has no slot for
 * it, so today you only learn someone asked by opening the thread. Recorded in
 * `docs/BANTER.md` as a question for the designer, not invented here.
 *
 * **Message requests** are the reverse — in this and not in the frame. A
 * request is the one row that cannot be opened, because tapping it has to mean
 * accept or decline. Matching the frame exactly would have deleted the only
 * way to answer one. See `BanterRequest`.
 */

interface GroupChat {
  chat_room_id: string
  event_id: string
  event_title: string
  event_venue: string
  participant_count: number
  event_image?: string | null
  last_message?: string
  last_message_time?: string
  last_sender_name?: string
  /** Standing in it right now: the room is live and anonymous. */
  is_checked_in: boolean
  /** Readable but not postable — the list says why (SCRUM-178). */
  room_state: RoomState
}

interface PersonalChat {
  conversation_id: string
  other_user_name: string
  other_user_id: string
  other_user_avatar?: string | null
  last_message?: string
  last_message_time?: string
  unread_count: number
  /**
   * They have revealed themselves to you.
   *
   * The server already gates the payload — pre-reveal, `name` is the pseudonym
   * and `image` is `null`, so there is nothing here to leak. This flag exists
   * so the row can *draw* the difference: an unrevealed match gets the
   * generated mark rather than an empty circle.
   */
  they_revealed: boolean
  /** They have asked you to reveal. There is no "declined". */
  reveal_requested: boolean
  /** Opened from a mutual like, not an accepted message request. */
  from_match: boolean
}

interface MessageRequest {
  request_id: string
  sender_name?: string | null
  initial_message?: string | null
}

/** A row in the merged list, plus what it takes to open it. */
type InboxRow = ConversationItem & { sortTime: number; open: () => void }

const GROUP_CHAT_CACHE_TTL = 60 * 1000
const PERSONAL_CHAT_CACHE_TTL = 60 * 1000
const MESSAGE_REQUESTS_CACHE_TTL = 60 * 1000
const CHAT_BACKGROUND_REFRESH_THROTTLE_MS = 15 * 1000

const formatRelativeTime = (timeString: string) => {
  const messageTime = new Date(timeString)
  const now = new Date()
  const diffMs = now.getTime() - messageTime.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'now'
  if (diffHours < 1) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  return messageTime.toLocaleDateString()
}

const previewFromMessage = (message: any): string | undefined => {
  if (!message) return undefined

  const rawText = message.text ?? message.message_text ?? message.content ?? message.body
  if (typeof rawText === 'string' && rawText.trim().length > 0) {
    return rawText.trim()
  }

  const mediaType = String(message.mediaType ?? message.media_type ?? message.type ?? '').toLowerCase()
  if (mediaType.includes('image') || mediaType.includes('photo')) return '[Photo]'
  if (mediaType.includes('voice') || mediaType.includes('audio')) return '[Voice note]'
  if (mediaType.includes('video')) return '[Video]'
  if (message.mediaUrl || message.media_url || message.attachmentUrl || message.attachment_url) return '[Attachment]'
  return undefined
}

const previewFromConversation = (conv: any): { text?: string; time?: string } => {
  const lastMessage = conv?.lastMessage || conv?.last_message || conv?.message || conv?.latestMessage
  const text = previewFromMessage(lastMessage)
    || (typeof conv?.lastMessageText === 'string' && conv.lastMessageText.trim().length > 0 ? conv.lastMessageText.trim() : undefined)
    || (typeof conv?.last_message_text === 'string' && conv.last_message_text.trim().length > 0 ? conv.last_message_text.trim() : undefined)

  const time = (lastMessage?.createdAt
    || lastMessage?.created_at
    || conv?.lastMessageTime
    || conv?.last_message_time
    || conv?.updatedAt
    || conv?.updated_at) as string | undefined

  return { text, time }
}

const displayPreview = (text?: string, fallback: string = 'Start chatting'): string =>
  (text && text.trim().length > 0 ? text : fallback)

function ChatInner() {
  const insets = useSafeAreaInsets()
  const { user, loading: authLoading } = useAuth()
  const [incomingRequests, setIncomingRequests] = useState<MessageRequest[]>([])
  const [groupChats, setGroupChats] = useState<GroupChat[]>([])
  const [personalChats, setPersonalChats] = useState<PersonalChat[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [requestPending, setRequestPending] = useState<Record<string, boolean>>({})
  const requestAnimRefs = useRef<Record<string, Animated.Value>>({})
  const latestLoadIdRef = useRef(0)
  const isLoadingRef = useRef(false)
  const lastFetchRef = useRef({ list: 0, requests: 0 })
  const groupChatUnsubsRef = useRef<Map<string, () => void>>(new Map())

  const handleGroupChatPress = useCallback((chat: GroupChat) => {
    router.push({
      pathname: '/chat/[id]',
      params: {
        id: chat.chat_room_id,
        roomName: chat.event_title,
        eventTitle: chat.event_title,
        eventImage: chat.event_image ?? '',
      } as any,
    })
  }, [])

  const handlePersonalChatPress = useCallback((chat: PersonalChat) => {
    setConversationLastRead(chat.conversation_id).catch(() => {})
    router.push({
      pathname: '/private-chat/[conversationId]',
      params: {
        conversationId: chat.conversation_id,
        otherUserName: chat.other_user_name,
        otherUserId: chat.other_user_id,
        otherUserAvatar: chat.other_user_avatar ?? '',
      } as any,
    })
  }, [])

  /*
   * The merged list.
   *
   * Sorted by last message, newest first, with never-used conversations at the
   * bottom rather than the top — an empty room is not news. `sortTime` is
   * carried on the row so the comparator does not re-parse a date per
   * comparison.
   */
  /* Lifted into the rail above, so not repeated in the list below. */
  const liveRooms = useMemo(() => groupChats.filter((c) => c.is_checked_in), [groupChats])

  const rows = useMemo<InboxRow[]>(() => {
    const merged: InboxRow[] = [
      ...personalChats.map((c) => ({
        id: `p:${c.conversation_id}`,
        title: c.other_user_name,
        /*
         * A match nobody has written in yet says why it exists, rather than the
         * generic "Start chatting" that is true of any empty thread. The row
         * arrived because two people chose each other; it should say so before
         * it is opened.
         */
        preview: c.last_message?.trim()
          ? c.last_message
          : matchRowPreview({ fromMatch: c.from_match }) ?? displayPreview(undefined),
        timeLabel: c.last_message_time ? formatRelativeTime(c.last_message_time) : '',
        avatarUrl: c.other_user_avatar,
        kind: 'direct' as const,
        pseudonymous: !c.they_revealed,
        unread: c.unread_count > 0,
        sortTime: c.last_message_time ? Date.parse(c.last_message_time) : 0,
        open: () => handlePersonalChatPress(c),
      })),
      ...groupChats.filter((c) => !c.is_checked_in).map((c) => ({
        id: `g:${c.chat_room_id}`,
        title: c.event_title,
        preview: roomStateLine(c.room_state) ?? displayPreview(c.last_message, 'No messages yet'),
        timeLabel: c.last_message_time ? formatRelativeTime(c.last_message_time) : '',
        kind: 'event' as const,
        sortTime: c.last_message_time ? Date.parse(c.last_message_time) : 0,
        open: () => handleGroupChatPress(c),
      })),
    ]
    return merged.sort((a, b) => b.sortTime - a.sortTime)
  }, [personalChats, groupChats, handlePersonalChatPress, handleGroupChatPress])

  const hasUnread = useMemo(() => personalChats.some((c) => c.unread_count > 0), [personalChats])

  const handleMarkAllRead = useCallback(async () => {
    if (personalChats.length === 0) return
    await Promise.all(personalChats.map((c) => setConversationLastRead(c.conversation_id)))
    setPersonalChats((prev) => prev.map((c) => ({ ...c, unread_count: 0 })))
  }, [personalChats])

  const onRefresh = useCallback(async () => {
    if (isLoadingRef.current) return
    setRefreshing(true)
    await loadChats(true, true)
    setRefreshing(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Real-time private message updates via Socket.io
  useEffect(() => {
    if (!user) return

    Logger.info('chat', 'Setting up real-time message subscription')

    const handleNewMessage: PrivateMessageCallback = (data) => {
      Logger.debug('chat', 'New message received', { conversationId: data.conversationId })

      setPersonalChats(prev => {
        const idx = prev.findIndex(c => c.conversation_id === data.conversationId)

        if (idx === -1) {
          // New conversation - reload the list to get full details
          loadPersonalChats(undefined, undefined, true)
          return prev
        }

        const updated = [...prev]
        const isFromMe = data.message.senderId === user.id
        const nextPreview = previewFromMessage(data.message) || '[Message]'
        updated[idx] = {
          ...updated[idx],
          last_message: nextPreview,
          last_message_time: data.message.createdAt,
          // Only increment unread if message is from other user
          unread_count: isFromMe ? updated[idx].unread_count : updated[idx].unread_count + 1,
        }
        return updated
      })
    }

    const unsubscribe = subscribeToUserNotifications(user.id, handleNewMessage)

    return () => {
      Logger.debug('chat', 'Cleaning up message subscription')
      unsubscribe()
    }
  }, [user])

  // Real-time group chat updates — subscribe to loaded group chat rooms.
  // Uses incremental delta-subscription to avoid a teardown gap when the list changes.
  useEffect(() => {
    if (!user) return

    const handleGroupMessage: ChatMessageCallback = (data) => {
      Logger.debug('chat', 'Group message received on chat tab', { chatGroupId: data.chatGroupId })

      setGroupChats(prev => {
        const idx = prev.findIndex(c => c.chat_room_id === data.chatGroupId)
        if (idx === -1) return prev

        const updated = [...prev]
        updated[idx] = {
          ...updated[idx],
          last_message: data.message.content,
          last_message_time: data.message.createdAt,
          last_sender_name: data.message.userName,
        }
        return updated
      })
    }

    const newIds = new Set(groupChats.map(c => c.chat_room_id))
    const oldIds = new Set(groupChatUnsubsRef.current.keys())

    for (const id of oldIds) {
      if (!newIds.has(id)) {
        groupChatUnsubsRef.current.get(id)?.()
        groupChatUnsubsRef.current.delete(id)
      }
    }

    for (const id of newIds) {
      if (!oldIds.has(id)) {
        groupChatUnsubsRef.current.set(id, subscribeToChatMessage(id, handleGroupMessage))
      }
    }
  }, [user, groupChats])

  // Cleanup all group chat subscriptions on unmount
  useEffect(() => {
    const subs = groupChatUnsubsRef.current
    return () => {
      subs.forEach(unsub => unsub())
      subs.clear()
    }
  }, [])

  // Instant local updates from chat screens — fires the moment a message is sent,
  // so the list is already up-to-date before the user finishes swiping back.
  useEffect(() => {
    const unsub = subscribeChatListUpdates((update) => {
      if (update.type === 'personal' && update.conversationId) {
        setPersonalChats(prev => {
          const idx = prev.findIndex(c => c.conversation_id === update.conversationId)
          if (idx === -1) return prev
          const updated = [...prev]
          updated[idx] = {
            ...updated[idx],
            last_message: update.lastMessage,
            last_message_time: update.lastMessageTime,
          }
          return updated
        })
      } else if (update.type === 'group' && update.chatGroupId) {
        setGroupChats(prev => {
          const idx = prev.findIndex(c => c.chat_room_id === update.chatGroupId)
          if (idx === -1) return prev
          const updated = [...prev]
          updated[idx] = {
            ...updated[idx],
            last_message: update.lastMessage,
            last_message_time: update.lastMessageTime,
            last_sender_name: update.senderName,
          }
          return updated
        })
      }
    })

    return unsub
  }, [])

  /*
   * Both lists, always.
   *
   * The tabbed version fetched one and left the other stale, which is why
   * switching tabs used to show yesterday's preview for a second. With one
   * list there is one throttle and one cache decision, and the two requests
   * go out together.
   */
  const loadChats = async (force = false, refreshEvenIfCached = false) => {
    if (!user) return

    const perfStart = Date.now()
    const userId = user.id
    const groupCacheKey = `group_chats_${userId}`
    const personalCacheKey = `personal_chats_${userId}`
    const requestsCacheKey = `message_requests_${userId}`

    const cachedGroupChats = force ? null : queryCache.get<GroupChat[]>(groupCacheKey)
    const cachedPersonalChats = force ? null : queryCache.get<PersonalChat[]>(personalCacheKey)
    const cachedRequests = force
      ? null
      : queryCache.get<{ incoming: MessageRequest[]; outgoing: MessageRequest[] }>(requestsCacheKey)

    if (cachedGroupChats) setGroupChats(cachedGroupChats)
    if (cachedPersonalChats) setPersonalChats(cachedPersonalChats)
    if (cachedRequests) setIncomingRequests(cachedRequests.incoming)

    const hasCachedList = !!cachedGroupChats && !!cachedPersonalChats
    const hasCachedRequests = !!cachedRequests
    if (!force && (hasCachedList || hasCachedRequests)) {
      setLoading(false)
    }

    const now = Date.now()
    // Bypass throttle when the chat domain is dirty (e.g. user just sent a message
    // and navigated back) so stale data is never shown after a known change.
    const chatDirty = hasDirtyDomain(['chat'])
    const shouldFetchList = force
      || !hasCachedList
      || chatDirty
      || (refreshEvenIfCached && now - lastFetchRef.current.list > CHAT_BACKGROUND_REFRESH_THROTTLE_MS)
    const shouldFetchRequests = force
      || !hasCachedRequests
      || (refreshEvenIfCached && now - lastFetchRef.current.requests > CHAT_BACKGROUND_REFRESH_THROTTLE_MS)

    if (!shouldFetchList && !shouldFetchRequests) return

    const loadId = ++latestLoadIdRef.current
    try {
      isLoadingRef.current = true
      const hasRenderedData = rows.length > 0 || incomingRequests.length > 0 || hasCachedList || hasCachedRequests
      if (!hasRenderedData && (force || (!hasCachedList && shouldFetchList))) {
        setLoading(true)
      }

      if (shouldFetchList) {
        // If queryCache was empty (e.g. invalidated after a send), also bypass apiClient's
        // internal SWR response cache so we don't get stale data from it either.
        const bypassApiCache = force || !hasCachedList
        await Promise.all([
          loadGroupChats(loadId, groupCacheKey, bypassApiCache),
          loadPersonalChats(loadId, personalCacheKey, bypassApiCache),
        ])
        lastFetchRef.current.list = now
      }
      if (shouldFetchRequests) {
        await loadMessageRequests(loadId, requestsCacheKey, force)
        lastFetchRef.current.requests = now
      }
    } catch (error) {
      Logger.error('chat', 'Error loading chats', { error })
    } finally {
      if (latestLoadIdRef.current === loadId) {
        setLoading(false)
        isLoadingRef.current = false
      }
      Logger.info('chat', 'loadChats timing', {
        force,
        refreshEvenIfCached,
        durationMs: Date.now() - perfStart,
        fetchedList: shouldFetchList,
        fetchedRequests: shouldFetchRequests,
      })
    }
  }

  const socketStatus = useLiveSync({
    enabled: !!user && !authLoading,
    // Background sync should not force blocking skeleton UI.
    onSync: () => loadChats(false, true),
    domains: ['chat'],
    connectedIntervalMs: 20000,
    disconnectedIntervalMs: 8000,
    maxDisconnectedIntervalMs: 30000,
  })

  const loadMessageRequests = async (loadId?: number, cacheKey?: string, force = false) => {
    if (cacheKey && !force) {
      const cached = queryCache.get<{ incoming: MessageRequest[]; outgoing: MessageRequest[] }>(cacheKey)
      if (cached) {
        if (loadId !== undefined && latestLoadIdRef.current !== loadId) return
        setIncomingRequests(cached.incoming)
        return
      }
    }
    try {
      const result = await apiClient.getMessageRequests({ status: 'pending' }, { force })
      if (loadId !== undefined && latestLoadIdRef.current !== loadId) return

      if (result.success && result.data?.requests) {
        const requests: MessageRequest[] = result.data.requests.map((r: any) => ({
          request_id: r.id,
          sender_name: r.sender?.name || null,
          initial_message: r.message || null,
        }))
        setIncomingRequests(requests)
        Logger.info('chat', 'Message requests loaded', { count: requests.length })
        if (cacheKey) {
          queryCache.set(cacheKey, { incoming: requests, outgoing: [] }, MESSAGE_REQUESTS_CACHE_TTL)
        }
      } else {
        setIncomingRequests([])
        if (cacheKey) {
          queryCache.set(cacheKey, { incoming: [], outgoing: [] }, MESSAGE_REQUESTS_CACHE_TTL)
        }
      }
    } catch (e) {
      Logger.error('chat', 'loadMessageRequests failed', { error: e })
      if (loadId === undefined || latestLoadIdRef.current === loadId) {
        setIncomingRequests([])
      }
    }
  }

  const loadGroupChats = async (loadId?: number, cacheKey?: string, force = false) => {
    try {
      const result = await apiClient.getChatGroups({ force })

      if (!result.success || !result.data) {
        Logger.error('chat', 'Error fetching group chats', { error: result.error })
        if (loadId === undefined || latestLoadIdRef.current === loadId) setGroupChats([])
        return
      }

      // Normalize API response shape (array vs wrapped payload)
      const rooms = Array.isArray(result.data)
        ? result.data
        : (result.data as any).groups || (result.data as any).rooms || (result.data as any).data || []

      if (!Array.isArray(rooms)) {
        Logger.warn('chat', 'Unexpected group chat payload shape', { data: result.data })
        if (loadId === undefined || latestLoadIdRef.current === loadId) setGroupChats([])
        return
      }

      const groupChatData: GroupChat[] = rooms
        .map((room: any) => {
          const preview = previewFromConversation(room)
          return {
            chat_room_id: String(room.id || room.chat_room_id || room.chatRoomId || ''),
            event_id: room.event_id || room.eventId || '',
            event_title: room.event?.title || room.event_title || room.eventTitle || room.title || room.name || 'Unknown Event',
            event_venue: room.event?.venue_name || room.event?.venueName || room.venue_name || room.venueName || 'Unknown Venue',
            participant_count: room.participant_count || room.participantCount || room.participants || 0,
            event_image: room.event?.cover_image_url || room.event?.coverImageUrl || room.cover_image_url || room.coverImageUrl || null,
            last_message: preview.text,
            last_message_time: preview.time,
            last_sender_name: undefined,
            is_checked_in: room.isCheckedIn === true,
            room_state: roomStateFrom(room),
          }
        })
        .filter((chat) => chat.chat_room_id)

      if (loadId === undefined || latestLoadIdRef.current === loadId) setGroupChats(groupChatData)
      if (cacheKey) queryCache.set(cacheKey, groupChatData, GROUP_CHAT_CACHE_TTL)
      Logger.info('chat', `Loaded ${groupChatData.length} group chats`)
    } catch (error) {
      Logger.error('chat', 'Error loading group chats', { error })
      setGroupChats([])
    }
  }

  const loadPersonalChats = async (loadId?: number, cacheKey?: string, force = false) => {
    try {
      const result = await apiClient.getConversations({ force })

      if (loadId !== undefined && latestLoadIdRef.current !== loadId) return

      if (result.success && result.data) {
        const conversations = result.data
        const personalChatData: PersonalChat[] = conversations.map((conv: any) => {
          const convId = String(conv.id || conv.conversation_id || '')
          const preview = previewFromConversation(conv)
          const otherUser = conv.otherUser || conv.other_user || {}
          return {
            conversation_id: convId,
            /*
             * Already the pseudonym when they have not revealed —
             * `displayNameInConversation` on the server decides this and every
             * other surface resolves through it. "Someone" rather than
             * "Unknown" to match the server's own last resort; "Unknown" reads
             * as a data error, which this is not.
             */
            other_user_name: otherUser?.name || otherUser?.display_name || 'Someone',
            other_user_id: String(otherUser?.id || otherUser?.user_id || ''),
            other_user_avatar: otherUser?.image || otherUser?.avatar || null,
            last_message: preview.text,
            last_message_time: preview.time,
            unread_count: (conv.unreadCount ?? conv.unread_count) || 0,
            /*
             * Absent means revealed, which looks like the wrong direction and
             * is not.
             *
             * The gate is entirely server-side: `name` is already the pseudonym
             * and `image` already `null` before a reveal, so this flag decides
             * a *picture*, not a permission, and cannot leak either way.
             *
             * Defaulting to `false` would draw a generated disc over every
             * accepted message request — conversations that never had a
             * pseudonym and have shown real names since they existed
             * (`mayShowRealName` returns `true` for them precisely so this does
             * not happen). Failing "closed" here would mislabel real people as
             * anonymous, which is the worse error.
             */
            from_match: conv.fromMatch === true,
            they_revealed: conv.theyRevealed !== false,
            reveal_requested: conv.revealRequested === true,
          }
        }).filter((conv: PersonalChat) => !!conv.conversation_id)

        setPersonalChats(personalChatData)
        syncUnreadCache(conversations)
        if (cacheKey) queryCache.set(cacheKey, personalChatData, PERSONAL_CHAT_CACHE_TTL)
        try {
          const firstScreenUrls = personalChatData
            .map((c) => c.other_user_avatar)
            .filter((u): u is string => !!u)
            .slice(0, 8)
          if (firstScreenUrls.length > 0) {
            preloadImages(firstScreenUrls, 'low')
          }
        } catch {}
      } else {
        setPersonalChats([])
      }
    } catch (error) {
      Logger.error('chat', 'Error loading personal chats', { error })
      if (loadId === undefined || latestLoadIdRef.current === loadId) {
        setPersonalChats([])
      }
    }
  }

  const getRequestAnimValue = useCallback((requestId: string) => {
    const existing = requestAnimRefs.current[requestId]
    if (existing) return existing
    const next = new Animated.Value(1)
    requestAnimRefs.current[requestId] = next
    return next
  }, [])

  const animateRequestRemoval = useCallback((requestId: string) => (
    new Promise<void>((resolve) => {
      Animated.timing(getRequestAnimValue(requestId), {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => resolve())
    })
  ), [getRequestAnimValue])

  const respondToRequest = useCallback(async (request: MessageRequest, action: 'accept' | 'decline') => {
    const requestId = request.request_id
    if (requestPending[requestId]) return
    setRequestPending((prev) => ({ ...prev, [requestId]: true }))

    try {
      await animateRequestRemoval(requestId)
      setIncomingRequests((prev) => prev.filter((r) => r.request_id !== requestId))

      const result = await apiClient.respondToMessageRequest(requestId, action)
      if (!result.success) {
        Logger.error('chat', `Failed to ${action} request`, { requestId, error: result.error })
        await loadChats(true, true)
        return
      }

      Logger.info('chat', `Message request ${action}ed`, { requestId, conversationId: result.data?.conversationId })
      if (action === 'accept' && result.data?.conversationId) {
        router.push({
          pathname: '/private-chat/[conversationId]',
          params: { conversationId: result.data.conversationId } as any,
        })
      }

      // `force`: the cached requests list still holds the card that was just
      // animated away, and the un-forced load put it straight back on screen
      // until a pull-to-refresh (SCRUM-165).
      await loadChats(true, true)
    } catch (e) {
      Logger.error('chat', `Error ${action}ing request`, { requestId, error: e })
      await loadChats(true, true)
    } finally {
      setRequestPending((prev) => {
        const next = { ...prev }
        delete next[requestId]
        return next
      })
      delete requestAnimRefs.current[requestId]
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animateRequestRemoval, requestPending])

  useEffect(() => {
    if (!authLoading && user) loadChats(false, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading])

  const renderItem = useCallback(
    ({ item }: { item: InboxRow }) => <BanterConversation item={item} onPress={item.open} />,
    []
  )

  const header = (
    <View style={styles.header}>
      <BanterSearch />

      {liveRooms.length > 0 ? (
        <View style={styles.section}>
          <BanterHeading title="Live now" trailingIcon="sensors" />
          {/*
            Bleeds the page gutter for the same reason the Pulse's Featured row
            does: a rail that stops inside the margin reads as clipped rather
            than as running off the edge.
          */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.railBleed}
            contentContainerStyle={styles.rail}
          >
            {liveRooms.map((c) => (
              <BanterPinned
                key={c.chat_room_id}
                item={{ id: c.chat_room_id, name: c.event_title, isEvent: true, online: true }}
                onPress={() => handleGroupChatPress(c)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {incomingRequests.length > 0 ? (
        <View style={styles.section}>
          <BanterHeading title="Requests" trailingIcon="mark-email-unread" />
          <View style={styles.requestList}>
            {incomingRequests.map((r) => (
              <Animated.View
                key={r.request_id}
                style={{ opacity: getRequestAnimValue(r.request_id) }}
              >
                <BanterRequest
                  name={r.sender_name || 'Someone'}
                  message={displayPreview(r.initial_message ?? undefined, 'Wants to message you')}
                  pending={requestPending[r.request_id]}
                  onAccept={() => respondToRequest(r, 'accept')}
                  onDecline={() => respondToRequest(r, 'decline')}
                />
              </Animated.View>
            ))}
          </View>
        </View>
      ) : null}

      <BanterHeading
        title="Recent"
        action={hasUnread ? 'Mark all read' : undefined}
        onAction={hasUnread ? handleMarkAllRead : undefined}
      />
    </View>
  )

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <PulseTopBar
        title="The Banter"
        actions={
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Search conversations"
              hitSlop={8}
              style={({ pressed }) => [styles.barButton, pressed && styles.pressed]}
            >
              <Ionicons name="search" size={18} color={EMBER.textPrimary} />
            </Pressable>
            <NotificationBell />
          </>
        }
      />

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={loading ? <InboxSkeleton /> : <EmptyInbox />}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + TOP_BAR_HEIGHT + 32,
            paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + 24,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={EMBER.accent}
            progressViewOffset={insets.top + TOP_BAR_HEIGHT}
          />
        }
      />

      <RealtimeStatusBanner status={socketStatus} />

    </View>
  )
}

/** Three rows at the real row's geometry, so the list does not jump when it lands. */
function InboxSkeleton() {
  return (
    <View style={styles.skeleton}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.skeletonRow}>
          <SkeletonCircle width={ROW_AVATAR} />
          <View style={styles.skeletonBody}>
            <SkeletonLine width="45%" />
            <SkeletonLine width="80%" />
          </View>
        </View>
      ))}
    </View>
  )
}

function EmptyInbox() {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyGlyph}>
        <Ionicons name="chatbubbles-outline" size={36} color={EMBER.textTertiary} />
      </View>
      <Text style={styles.emptyTitle} maxFontSizeMultiplier={1.4}>
        No conversations yet
      </Text>
      <Text style={styles.emptyBody} maxFontSizeMultiplier={1.4}>
        Blend in to an event and its room appears here — or message someone you
        met there.
      </Text>
      <ScalePress style={styles.emptyCta} onPress={() => router.push('/(tabs)/events' as any)} pressedScale={0.97}>
        <Text style={styles.emptyCtaText}>Explore events</Text>
      </ScalePress>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  pressed: { opacity: 0.6 },
  content: { paddingHorizontal: BANTER_PADDING_HORIZONTAL },
  header: { gap: BANTER_SECTION_GAP, marginBottom: 16 },
  // Frame `1141:5255`: a heading and its content are 16 apart, not 32.
  section: { gap: 16 },
  requestList: { gap: 12 },
  railBleed: { marginHorizontal: -BANTER_PADDING_HORIZONTAL },
  // Frame `1141:5261`: gap 24, `pb-[8px]`.
  rail: { gap: 24, paddingBottom: 8, paddingHorizontal: BANTER_PADDING_HORIZONTAL },
  barButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  skeleton: { gap: 8 },
  skeletonRow: { flexDirection: 'row', gap: 16, padding: 16, alignItems: 'center' },
  skeletonBody: { flex: 1, gap: 8 },

  empty: { alignItems: 'center', paddingVertical: 64, paddingHorizontal: 16, gap: 8 },
  emptyGlyph: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: EMBER.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontFamily: EMBER_FONTS.displaySemiBold,
    fontSize: 18,
    lineHeight: 24,
    color: EMBER.textPrimary,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: EMBER_FONTS.displayRegular,
    fontSize: 14,
    lineHeight: 21,
    color: EMBER.textSecondary,
    textAlign: 'center',
  },
  emptyCta: {
    marginTop: 8,
    backgroundColor: EMBER.accent,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  emptyCtaText: {
    fontFamily: EMBER_FONTS.displaySemiBold,
    color: '#FFFFFF',
    fontSize: 14,
  },
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

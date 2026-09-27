import { ScreenProfiler } from '../../lib/perf'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Reanimated, { Easing, FadeOut, LinearTransition, useReducedMotion } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import RealtimeStatusBanner from '../../components/RealtimeStatusBanner'
import { useToast } from '../../components/Toast'
import { SkeletonBlock, SkeletonCircle, SkeletonLine } from '../../components/Skeleton'
import { preloadImages } from '../../components/OptimizedImage'
import ScalePress from '../../components/motion/ScalePress'
import {
  BANTER_PADDING_HORIZONTAL,
  BANTER_SECTION_GAP,
  BanterBucketHeading,
  BanterConversation,
  BanterHeading,
  BanterLiveRoom,
  BanterRequest,
  BanterSearch,
  ROW_AVATAR,
  type ConversationItem,
} from '../../components/banter/BanterSections'
import { bucketRows, inboxTimeLabel, previewWithSender } from '../../components/banter/inbox'
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
import { MOTION_DURATION } from '../../lib/motion'
import { CONTROL, EMBER, EMBER_RADIUS, SPACE, TYPE } from '../../lib/theme'
import { setConversationLastRead, syncUnreadCache } from '../../lib/unread'
import { useAuth } from '../../lib/useAuth'
import { useLiveSync } from '../../lib/useLiveSync'
import { TAB_BAR_CLEARANCE } from './_layout'

/**
 * The Banter — every conversation you have, on one screen.
 *
 * ## One inbox, not two tabs
 *
 * The screen this replaced split rooms and people into a `group` / `personal`
 * segmented control, and only ever fetched the visible half. A tabbed inbox
 * makes you check two places for "did anyone message me", and the tab you are
 * not looking at is the one with the unread message on it. One list costs one
 * extra request on first load and removes a decision from every visit. A
 * person is round, a room is its event's cover in a square, and that is the
 * whole distinction.
 *
 * ## Top to bottom
 *
 * 1. **Live now** — the rooms you are checked into, one full-width row each.
 *    What is pinned, by circumstance rather than by a gesture, is the event you
 *    are standing in: temporary, anonymous, only useful while you are there.
 *    Those rooms are lifted out of the list below rather than repeated in it.
 *    `isCheckedIn` comes from the API — `checked_in` with no `check_out_time`,
 *    which the client cannot derive, because "the event is on now" is not the
 *    same as "I am there".
 * 2. **Requests** — the one row that cannot be opened, because tapping it has
 *    to mean accept or decline. Accept is the screen's one accent.
 * 3. **Conversations**, bucketed Today / This week / Earlier by last activity
 *    (`components/banter/inbox.ts`), "Mark all read" on the first heading.
 *
 * No compose button, by decision: a DM starts from a person, and every path to
 * one already goes through a profile.
 *
 * ## Anonymity holds in the inbox
 *
 * A DM that opens from a mutual like carries the pseudonym the match card
 * showed, and the real name appears only when that person reveals. The server
 * gates it — pre-reveal, `name` is the pseudonym and `image` is `null` — so the
 * list cannot leak a name it was never sent. `theyRevealed` is carried through
 * so an unrevealed match gets the generated mark instead of an empty circle —
 * the same one the Scene's discs and the room use, seeded on the pseudonym.
 *
 * `revealRequested` turns the row's preview into "Asked to reveal names" until
 * you open that thread — this session only; the server keeps the flag until
 * you answer, so it comes back after a relaunch.
 */

interface GroupChat {
  chat_room_id: string
  event_id: string
  event_title: string
  /** `memberCount` — active members. 0 when the server did not say. */
  participant_count: number
  /** The event's cover — the room's square avatar. */
  event_image?: string | null
  last_message?: string
  last_message_time?: string
  /** The sender's name *in this room* — their pseudonym, never a real name. */
  last_sender_name?: string
  last_sender_is_me: boolean
  unread_count: number
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
  /** The last message is yours — the preview says "You: ". */
  last_message_from_me: boolean
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
  sender_avatar?: string | null
  initial_message?: string | null
  created_at?: string | null
}

/** A row in the merged list, plus what it takes to open it and find it. */
type InboxRow = ConversationItem & { sortTime: number; searchText: string; open: () => void }

/** What the FlatList draws: a bucket heading or a conversation. */
type InboxItem =
  | { type: 'heading'; id: string; title: string; first: boolean }
  | ({ type: 'row' } & InboxRow)

const GROUP_CHAT_CACHE_TTL = 60 * 1000
const PERSONAL_CHAT_CACHE_TTL = 60 * 1000
const MESSAGE_REQUESTS_CACHE_TTL = 60 * 1000
const CHAT_BACKGROUND_REFRESH_THROTTLE_MS = 15 * 1000

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
  const { showToast } = useToast()
  const reduceMotion = useReducedMotion()
  const [incomingRequests, setIncomingRequests] = useState<MessageRequest[]>([])
  const [groupChats, setGroupChats] = useState<GroupChat[]>([])
  const [personalChats, setPersonalChats] = useState<PersonalChat[]>([])
  const [loading, setLoading] = useState(true)
  const [listFailed, setListFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [requestPending, setRequestPending] = useState<Record<string, boolean>>({})
  const latestLoadIdRef = useRef(0)
  const isLoadingRef = useRef(false)
  const lastFetchRef = useRef({ list: 0, requests: 0 })
  const groupChatUnsubsRef = useRef<Map<string, () => void>>(new Map())

  /*
   * The room open on top of this tab, if any. A message arriving for it is
   * being read as it lands, so it must not bump the room's unread here. Cleared
   * when the Banter is focused again.
   */
  const openRoomRef = useRef<string | null>(null)
  useFocusEffect(
    useCallback(() => {
      openRoomRef.current = null
    }, [])
  )

  /*
   * Threads whose "Asked to reveal names" you have opened this session. The
   * server keeps `revealRequested` until you answer, so without this every
   * background refresh would put the line straight back.
   */
  const [revealSeen, setRevealSeen] = useState<ReadonlySet<string>>(() => new Set())

  const handleGroupChatPress = useCallback((chat: GroupChat) => {
    openRoomRef.current = chat.chat_room_id
    setGroupChats((prev) =>
      prev.map((c) => (c.chat_room_id === chat.chat_room_id ? { ...c, unread_count: 0 } : c))
    )
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
    if (chat.reveal_requested) {
      setRevealSeen((prev) => new Set(prev).add(chat.conversation_id))
    }
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

  /* Lifted into Live now above, so not repeated in the list below. */
  const liveRooms = useMemo(() => groupChats.filter((c) => c.is_checked_in), [groupChats])

  /*
   * The merged list.
   *
   * Sorted by last message, newest first, with never-used conversations at the
   * bottom rather than the top — an empty room is not news. `sortTime` is
   * carried on the row so the comparator does not re-parse a date per
   * comparison.
   */
  const rows = useMemo<InboxRow[]>(() => {
    const now = new Date()
    const merged: InboxRow[] = [
      ...personalChats.map((c) => {
        const askedToReveal = c.reveal_requested && !revealSeen.has(c.conversation_id)
        /*
         * A match nobody has written in yet says why it exists, rather than the
         * generic "Start chatting" that is true of any empty thread. The row
         * arrived because two people chose each other; it should say so before
         * it is opened.
         */
        const preview = askedToReveal
          ? 'Asked to reveal names'
          : c.last_message?.trim()
            ? previewWithSender(c.last_message, { fromMe: c.last_message_from_me })
            : matchRowPreview({ fromMatch: c.from_match }) ?? displayPreview(undefined)
        return {
          id: `p:${c.conversation_id}`,
          title: c.other_user_name,
          preview,
          previewEmphasis: askedToReveal,
          timeLabel: inboxTimeLabel(c.last_message_time, now),
          avatarUrl: c.other_user_avatar,
          kind: 'direct' as const,
          pseudonymous: !c.they_revealed,
          unread: c.unread_count > 0,
          sortTime: c.last_message_time ? Date.parse(c.last_message_time) : 0,
          searchText: `${c.other_user_name} ${preview}`.toLowerCase(),
          open: () => handlePersonalChatPress(c),
        }
      }),
      ...groupChats.filter((c) => !c.is_checked_in).map((c) => {
        const preview =
          roomStateLine(c.room_state) ??
          (c.last_message?.trim()
            ? previewWithSender(c.last_message, { fromMe: c.last_sender_is_me, name: c.last_sender_name })
            : 'No messages yet')
        return {
          id: `g:${c.chat_room_id}`,
          title: c.event_title,
          preview,
          timeLabel: inboxTimeLabel(c.last_message_time, now),
          avatarUrl: c.event_image,
          kind: 'event' as const,
          unread: c.unread_count > 0,
          sortTime: c.last_message_time ? Date.parse(c.last_message_time) : 0,
          // The sender is searchable even when a room-state line replaces the preview.
          searchText: `${c.event_title} ${preview} ${c.last_sender_name ?? ''}`.toLowerCase(),
          open: () => handleGroupChatPress(c),
        }
      }),
    ]
    return merged.sort((a, b) => b.sortTime - a.sortTime)
  }, [personalChats, groupChats, revealSeen, handlePersonalChatPress, handleGroupChatPress])

  const [query, setQuery] = useState('')
  const trimmedQuery = query.trim().toLowerCase()
  const visibleRows = useMemo(
    () => (trimmedQuery ? rows.filter((r) => r.searchText.includes(trimmedQuery)) : rows),
    [rows, trimmedQuery]
  )

  /*
   * "Mark all read" covers DMs only. The server has no endpoint that marks a
   * room read (only fetching the event chat moves `last_read_message_id`), so
   * offering it for a room's unread would be a button that does nothing.
   */
  const hasUnread = useMemo(() => personalChats.some((c) => c.unread_count > 0), [personalChats])

  /* The rows cut into Today / This week / Earlier, each under its heading. */
  const listItems = useMemo<InboxItem[]>(() => {
    const items: InboxItem[] = []
    bucketRows(visibleRows).forEach((bucket, i) => {
      items.push({ type: 'heading', id: `h:${bucket.title}`, title: bucket.title, first: i === 0 })
      for (const row of bucket.rows) items.push({ type: 'row', ...row })
    })
    return items
  }, [visibleRows])

  /*
   * Optimistic, then written to the server. The local caches alone were undone
   * by the next background refresh, which reloads the server's counts.
   */
  const handleMarkAllRead = useCallback(async () => {
    if (personalChats.length === 0 || !user) return
    const before = personalChats
    const cleared = personalChats.map((c) => ({ ...c, unread_count: 0 }))
    setPersonalChats(cleared)
    await Promise.all(personalChats.map((c) => setConversationLastRead(c.conversation_id)))

    try {
      const result = await apiClient.markAllConversationsRead()
      if (!result.success) throw new Error(result.error || 'mark all read refused')
      queryCache.set(`personal_chats_${user.id}`, cleared, PERSONAL_CHAT_CACHE_TTL)
    } catch (e) {
      Logger.warn('chat', 'mark all read failed', { error: e })
      setPersonalChats(before)
      syncUnreadCache(before)
      showToast("Couldn't mark your chats as read. Try again.", 'error')
    }
  }, [personalChats, user, showToast])

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
          last_message_from_me: isFromMe,
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
        const isFromMe = data.message.userId === user.id
        // Someone else's message in a room you are not reading is unread.
        const bump = !isFromMe && openRoomRef.current !== data.chatGroupId
        updated[idx] = {
          ...updated[idx],
          last_message: data.message.content,
          last_message_time: data.message.createdAt,
          last_sender_name: data.message.userName,
          last_sender_is_me: isFromMe,
          unread_count: bump ? updated[idx].unread_count + 1 : updated[idx].unread_count,
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
            // Only ever emitted by this device's own sends.
            last_message_from_me: true,
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
            last_sender_is_me: true,
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
        const [groupsOk, personalOk] = await Promise.all([
          loadGroupChats(loadId, groupCacheKey, bypassApiCache),
          loadPersonalChats(loadId, personalCacheKey, bypassApiCache),
        ])
        if (latestLoadIdRef.current === loadId) setListFailed(!(groupsOk && personalOk))
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
          sender_avatar: r.sender?.avatar || null,
          initial_message: r.message || null,
          created_at: r.createdAt || null,
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

  /*
   * Both list loaders return whether they succeeded, and on failure leave what
   * is on screen alone: clearing it turned a network error into "No
   * conversations yet", or silently dropped every room.
   */
  const loadGroupChats = async (loadId?: number, cacheKey?: string, force = false): Promise<boolean> => {
    try {
      const result = await apiClient.getChatGroups({ force })

      if (!result.success || !result.data) {
        Logger.error('chat', 'Error fetching group chats', { error: result.error })
        return false
      }

      // Normalize API response shape (array vs wrapped payload)
      const rooms = Array.isArray(result.data)
        ? result.data
        : (result.data as any).groups || (result.data as any).rooms || (result.data as any).data || []

      if (!Array.isArray(rooms)) {
        Logger.warn('chat', 'Unexpected group chat payload shape', { data: result.data })
        return false
      }

      const groupChatData: GroupChat[] = rooms
        .map((room: any) => {
          const preview = previewFromConversation(room)
          return {
            chat_room_id: String(room.id || room.chat_room_id || room.chatRoomId || ''),
            event_id: room.event_id || room.eventId || '',
            event_title: room.event?.title || room.event_title || room.eventTitle || room.title || room.name || 'Unknown Event',
            // `memberCount` is what `GET /chat/groups` sends; the rest never arrived.
            participant_count: Number(room.memberCount ?? room.participant_count) || 0,
            event_image: room.event?.coverImageUrl || room.event?.cover_image_url || room.coverImageUrl || room.cover_image_url || null,
            last_message: preview.text,
            last_message_time: preview.time,
            // The sender's room pseudonym (`anonymous_name`), or null.
            last_sender_name: room.lastMessage?.user?.name || undefined,
            last_sender_is_me: !!room.lastMessage?.user?.id && room.lastMessage.user.id === user?.id,
            unread_count: Number(room.unreadCount ?? room.unread_count) || 0,
            is_checked_in: room.isCheckedIn === true,
            room_state: roomStateFrom(room),
          }
        })
        .filter((chat) => chat.chat_room_id)

      if (loadId === undefined || latestLoadIdRef.current === loadId) setGroupChats(groupChatData)
      if (cacheKey) queryCache.set(cacheKey, groupChatData, GROUP_CHAT_CACHE_TTL)
      Logger.info('chat', `Loaded ${groupChatData.length} group chats`)
      return true
    } catch (error) {
      Logger.error('chat', 'Error loading group chats', { error })
      return false
    }
  }

  const loadPersonalChats = async (loadId?: number, cacheKey?: string, force = false): Promise<boolean> => {
    try {
      const result = await apiClient.getConversations({ force })

      if (loadId !== undefined && latestLoadIdRef.current !== loadId) return true

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
            last_message_from_me: !!conv.lastMessage?.senderId && conv.lastMessage.senderId === user?.id,
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
        return true
      }
      Logger.error('chat', 'Error fetching personal chats', { error: result.error })
      return false
    } catch (error) {
      Logger.error('chat', 'Error loading personal chats', { error })
      return false
    }
  }

  const respondToRequest = useCallback(async (request: MessageRequest, action: 'accept' | 'decline') => {
    const requestId = request.request_id
    if (requestPending[requestId]) return
    setRequestPending((prev) => ({ ...prev, [requestId]: true }))

    /*
     * The card leaves now and the request goes out now — together. It used to
     * wait for a 220ms fade before sending, so every accept was a fifth of a
     * second slower than it had to be. The fade is the row's `exiting`.
     */
    setIncomingRequests((prev) => prev.filter((r) => r.request_id !== requestId))
    try {
      const result = await apiClient.respondToMessageRequest(requestId, action)
      if (!result.success) {
        Logger.error('chat', `Failed to ${action} request`, { requestId, error: result.error })
        showToast(result.error || `Couldn't ${action} that request. Try again.`, 'error')
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
      showToast(`Couldn't ${action} that request. Try again.`, 'error')
      await loadChats(true, true)
    } finally {
      setRequestPending((prev) => {
        const next = { ...prev }
        delete next[requestId]
        return next
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestPending, showToast])

  useEffect(() => {
    if (!authLoading && user) loadChats(false, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading])

  const renderItem = useCallback(
    ({ item }: { item: InboxItem }) =>
      item.type === 'heading' ? (
        <View style={item.first ? undefined : styles.bucketGap}>
          <BanterBucketHeading
            title={item.title}
            action={item.first && hasUnread ? 'Mark all read' : undefined}
            onAction={item.first && hasUnread ? handleMarkAllRead : undefined}
          />
        </View>
      ) : (
        <BanterConversation item={item} onPress={item.open} />
      ),
    [hasUnread, handleMarkAllRead]
  )

  const header = (
    <View style={styles.header}>
      <BanterSearch value={query} onChangeText={setQuery} />

      {listFailed && rows.length > 0 ? (
        <Text style={styles.partialFailure} maxFontSizeMultiplier={1.4}>
          Some chats couldn&apos;t load. Pull down to try again.
        </Text>
      ) : null}

      {liveRooms.length > 0 ? (
        <View style={styles.section}>
          <BanterHeading title="Live now" />
          <View style={styles.liveList}>
            {liveRooms.map((c) => (
              <BanterLiveRoom
                key={c.chat_room_id}
                title={c.event_title}
                coverUrl={c.event_image}
                memberCount={c.participant_count}
                onPress={() => handleGroupChatPress(c)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {incomingRequests.length > 0 ? (
        <View style={styles.section}>
          <BanterHeading title="Requests" detail={String(incomingRequests.length)} />
          <View>
            {incomingRequests.map((r) => (
              /*
               * Fades out while the requests below close the gap, rather than
               * fading to an empty slot that then snaps shut. No blur or
               * shadow in the row, so the layout transition is cheap.
               */
              <Reanimated.View
                key={r.request_id}
                exiting={reduceMotion ? undefined : REQUEST_OUT}
                layout={reduceMotion ? undefined : REQUEST_REFLOW}
              >
                <BanterRequest
                  name={r.sender_name || 'Someone'}
                  avatarUrl={r.sender_avatar}
                  timeLabel={inboxTimeLabel(r.created_at)}
                  message={displayPreview(r.initial_message ?? undefined, 'Wants to message you')}
                  pending={requestPending[r.request_id]}
                  onAccept={() => respondToRequest(r, 'accept')}
                  onDecline={() => respondToRequest(r, 'decline')}
                />
              </Reanimated.View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  )

  /*
   * Live rooms or requests with nothing else is not an empty inbox, so it does
   * not say "No conversations yet" under them.
   */
  const hasHeaderContent = liveRooms.length > 0 || incomingRequests.length > 0

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <PulseTopBar
        title="The Banter"
        actions={<NotificationBell />}
      />

      {/*
        Just under the bar, where the event chat puts it. At the foot of the
        column it sat behind the absolutely positioned tab bar.
      */}
      <RealtimeStatusBanner
        status={socketStatus}
        style={{ ...styles.statusBanner, top: insets.top + TOP_BAR_HEIGHT + SPACE.sm }}
      />

      <FlatList
        data={listItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          loading ? (
            <InboxSkeleton />
          ) : trimmedQuery ? (
            <Text style={styles.noMatches} maxFontSizeMultiplier={1.4}>
              No chats match “{query.trim()}”
            </Text>
          ) : listFailed ? (
            <InboxLoadFailed onRetry={() => void loadChats(true, true)} />
          ) : hasHeaderContent ? null : (
            <EmptyInbox />
          )
        }
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + TOP_BAR_HEIGHT + SPACE.xxl,
            paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + SPACE.xl,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={EMBER.textSecondary}
            progressViewOffset={insets.top + TOP_BAR_HEIGHT}
          />
        }
      />
    </View>
  )
}

/*
 * Four rows at the real row's geometry — people round, rooms square — so the
 * list does not jump or change shape when it lands.
 */
const SKELETON_ROWS: ('person' | 'room')[] = ['person', 'room', 'person', 'person']

function InboxSkeleton() {
  return (
    <View>
      {SKELETON_ROWS.map((kind, i) => (
        <View key={i} style={styles.skeletonRow}>
          {kind === 'room' ? (
            <SkeletonBlock width={ROW_AVATAR} height={ROW_AVATAR} borderRadius={EMBER_RADIUS.sm} />
          ) : (
            <SkeletonCircle width={ROW_AVATAR} />
          )}
          <View style={styles.skeletonBody}>
            <SkeletonLine width="45%" />
            <SkeletonLine width="80%" />
          </View>
        </View>
      ))}
    </View>
  )
}

function InboxLoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyGlyph}>
        <Ionicons name="cloud-offline-outline" size={36} color={EMBER.textTertiary} />
      </View>
      <Text style={styles.emptyTitle} maxFontSizeMultiplier={1.4}>
        Couldn&apos;t load your chats
      </Text>
      <Text style={styles.emptyBody} maxFontSizeMultiplier={1.4}>
        Check your connection and try again.
      </Text>
      <ScalePress
        style={styles.emptyCta}
        onPress={onRetry}
        pressedScale={0.97}
        accessibilityRole="button"
      >
        <Text style={styles.emptyCtaText}>Retry</Text>
      </ScalePress>
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

const REQUEST_OUT = FadeOut.duration(MOTION_DURATION.fast)
const REQUEST_REFLOW = LinearTransition.duration(MOTION_DURATION.normal).easing(Easing.bezier(0.77, 0, 0.175, 1))

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  pressed: { opacity: 0.6 },
  content: { paddingHorizontal: BANTER_PADDING_HORIZONTAL },
  header: { gap: BANTER_SECTION_GAP, marginBottom: BANTER_SECTION_GAP },
  // A heading and its content are 16 apart, not 32.
  section: { gap: SPACE.lg },
  liveList: { gap: SPACE.md },
  /*
   * Between one day's rows and the next heading. The rows carry their own
   * `SPACE.md` padding, so the first heading needs no margin under it and the
   * next one needs only this above.
   */
  bucketGap: { marginTop: SPACE.xl },
  // Above the list and level with the top bar's own zIndex.
  statusBanner: {
    position: 'absolute',
    left: BANTER_PADDING_HORIZONTAL,
    right: BANTER_PADDING_HORIZONTAL,
    zIndex: 10,
  },
  partialFailure: TYPE.meta,
  noMatches: {
    ...TYPE.body,
    color: EMBER.textSecondary,
    textAlign: 'center',
    paddingVertical: SPACE.xxl,
  },

  skeletonRow: { flexDirection: 'row', gap: SPACE.lg, paddingVertical: SPACE.md, alignItems: 'center' },
  skeletonBody: { flex: 1, gap: SPACE.sm },

  empty: { alignItems: 'center', paddingVertical: SPACE.xxxl, paddingHorizontal: SPACE.lg, gap: SPACE.sm },
  // Same glyph tile as the Pulse's empty state (events.tsx `emptyGlyph`).
  emptyGlyph: {
    width: 80,
    height: 80,
    borderRadius: EMBER_RADIUS.lg,
    backgroundColor: EMBER.surfaceSunken,
    borderWidth: 1,
    borderColor: EMBER.separator,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.sm,
  },
  emptyTitle: { ...TYPE.title, textAlign: 'center' },
  emptyBody: { ...TYPE.body, color: EMBER.textSecondary, textAlign: 'center' },
  emptyCta: {
    marginTop: SPACE.sm,
    backgroundColor: EMBER.accent,
    borderRadius: EMBER_RADIUS.pill,
    height: CONTROL.md,
    justifyContent: 'center',
    paddingHorizontal: SPACE.xl,
  },
  // `onGradient`, not white — white fails contrast on the accent fill.
  emptyCtaText: { ...TYPE.button, color: EMBER.onGradient },
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

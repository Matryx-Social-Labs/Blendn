import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'

import { preloadImages } from '../components/OptimizedImage'
import { useToast } from '../components/Toast'
import { refreshAppIconBadge } from './appBadge'
import { apiClient } from './apiClient'
import { subscribeChatListUpdates } from './chatListUpdates'
import { crewRoomsFrom, type CrewRoomRow } from './crews'
import { H } from './haptics'
import { hasDirtyDomain } from './liveSyncState'
import { Logger } from './logger'
import { isPlaceRoom, roomDisplayTitle, roomMemberCount } from './placeRoom'
import { queryCache } from './queryCache'
import { rememberRoomMute } from './roomMembership'
import { roomStateFrom, type RoomState } from './roomState'
import { userReportStep } from './safetyUtils'
import { showSheet } from './sheet'
import { type ChatMessageCallback, type PrivateMessageCallback, subscribeToChatMessage, subscribeToUserNotifications } from './socketClient'
import { useAuth } from './useAuth'
import { useLiveSync } from './useLiveSync'
import { userMessage } from './userMessage'
import { previewText } from '../components/banter/inbox'

/*
 * The Banter's data (`app/(tabs)/chat.tsx`): rooms, crew chats and Blends,
 * DMs, message requests — loaded together, cached, kept live over the socket
 * and the chat-list bus. Moved here whole from the screen when it was
 * redesigned (Flow 5), so the screen is its drawing; the rules are unchanged.
 */

export interface GroupChat {
  chat_room_id: string
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
  /** A place's room (a venue day): "You’re here" where an event's says how many (R4-D5 5-3). */
  is_place?: boolean
  /** Readable but not postable — the list says why (SCRUM-178). */
  room_state: RoomState
}

export interface PersonalChat {
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

export interface MessageRequest {
  request_id: string
  /** Who asked. Opens their profile, and is who a report names. */
  sender_id?: string | null
  sender_name?: string | null
  sender_avatar?: string | null
  initial_message?: string | null
  created_at?: string | null
}

/** A row's last message was a sponsored broadcast: it keeps its time and previews nothing (5.6). */
export const SPONSORED = '\u0000sponsored'

const previewFromMessage = (message: any): string | undefined => {
  if (!message) return undefined

  const rawText = message.text ?? message.message_text ?? message.content ?? message.body
  if (typeof rawText === 'string' && rawText.trim().length > 0) {
    // R3-D5 5.6: "Photo", "Announcement · Toit: …"; a sponsored message is never the preview.
    return previewText(rawText) ?? SPONSORED
  }

  const mediaType = String(message.mediaType ?? message.media_type ?? message.type ?? '').toLowerCase()
  // Said as a person would, not as a bracketed type tag (R3-D5 5.6).
  if (mediaType.includes('image') || mediaType.includes('photo')) return 'Photo'
  if (mediaType.includes('voice') || mediaType.includes('audio')) return 'Voice note'
  if (mediaType.includes('video')) return 'Video'
  if (message.mediaUrl || message.media_url || message.attachmentUrl || message.attachment_url) return 'Sent an attachment'
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


const GROUP_CHAT_CACHE_TTL = 60 * 1000
const PERSONAL_CHAT_CACHE_TTL = 60 * 1000
const MESSAGE_REQUESTS_CACHE_TTL = 60 * 1000
const CHAT_BACKGROUND_REFRESH_THROTTLE_MS = 15 * 1000

export function useBanterInbox() {
  const { user, loading: authLoading } = useAuth()
  const { showToast } = useToast()
  const [incomingRequests, setIncomingRequests] = useState<MessageRequest[]>([])
  const [groupChats, setGroupChats] = useState<GroupChat[]>([])
  /** Crew chats and open Blend rooms (`rooms` on `GET /chat/groups`, step 9). */
  const [crewRooms, setCrewRooms] = useState<CrewRoomRow[]>([])
  const [personalChats, setPersonalChats] = useState<PersonalChat[]>([])
  const [loading, setLoading] = useState(true)
  const [listFailed, setListFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [requestPending, setRequestPending] = useState<Record<string, boolean>>({})
  // Board requests load themselves; this only knows when to ask them again.
  const [boardRefreshKey, setBoardRefreshKey] = useState(0)
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
  const noteOpenRoom = useCallback((id: string | null) => {
    openRoomRef.current = id
  }, [])

  /*
   * Optimistic, then written to the server. The local caches alone were undone
   * by the next background refresh, which reloads the server's counts.
   */
  const handleMarkAllRead = useCallback(async () => {
    if (personalChats.length === 0 || !user) return
    const before = personalChats
    const cleared = personalChats.map((c) => ({ ...c, unread_count: 0 }))
    setPersonalChats(cleared)

    try {
      const result = await apiClient.markAllConversationsRead()
      if (!result.success) throw new Error(result.error || 'mark all read refused')
      queryCache.set(`personal_chats_${user.id}`, cleared, PERSONAL_CHAT_CACHE_TTL)
      // The icon counts conversations with something unread: it just changed.
      void refreshAppIconBadge()
    } catch (e) {
      Logger.warn('chat', 'mark all read failed', { error: e })
      setPersonalChats(before)
      showToast("Couldn't mark your chats as read. Try again.", 'error')
    }
  }, [personalChats, user, showToast])

  // The loaders sit above every callback and effect that calls them: React
  // Compiler rejects a closure that reads a binding before its declaration.
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
          sender_id: r.senderId || r.sender?.id || null,
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
            // A place's room is named for the place; its venue day's title is bookkeeping (step 5).
            event_title: roomDisplayTitle(room) || room.event_title || room.eventTitle || room.title || room.name || 'Event chat',
            // `memberCount` is what `GET /chat/groups` sends; never for a place's room (H5, D-19).
            participant_count: roomMemberCount(room) ?? 0,
            event_image: room.event?.coverImageUrl || room.event?.cover_image_url || room.coverImageUrl || room.cover_image_url || null,
            last_message: preview.text,
            last_message_time: preview.time,
            // The sender's room pseudonym (`anonymous_name`), or null.
            last_sender_name: room.lastMessage?.user?.name || undefined,
            last_sender_is_me: !!room.lastMessage?.user?.id && room.lastMessage.user.id === user?.id,
            unread_count: Number(room.unreadCount ?? room.unread_count) || 0,
            is_checked_in: room.isCheckedIn === true,
            is_place: isPlaceRoom(room),
            room_state: roomStateFrom(room),
          }
        })
        .filter((chat) => chat.chat_room_id)
      // Each row carries your mute of it; the store is what the rows read.
      for (const room of rooms) rememberRoomMute(String(room.id || room.chat_room_id || room.chatRoomId || ''), room.mute)

      // Crew chats and open Blends come with page 1 (`rooms`); each carries your mute of it too.
      const others = crewRoomsFrom(result.data)
      for (const r of others) rememberRoomMute(r.id, r.mute)
      if (loadId === undefined || latestLoadIdRef.current === loadId) {
        setGroupChats(groupChatData)
        setCrewRooms(others)
      }
      if (cacheKey) {
        queryCache.set(cacheKey, groupChatData, GROUP_CHAT_CACHE_TTL)
        queryCache.set(`${cacheKey}_rooms`, others, GROUP_CHAT_CACHE_TTL)
      }
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

    /*
     * A known change (a message the socket delivered, a send) makes both caches
     * stale. Painting them would undo the live row the socket just wrote, and
     * apiClient's SWR copy would hand back the same old list: a DM that landed
     * while the Banter was open vanished until the tab was refocused (drive 2).
     */
    const chatDirty = hasDirtyDomain(['chat'])
    const cachedGroupChats = force || chatDirty ? null : queryCache.get<GroupChat[]>(groupCacheKey)
    const cachedPersonalChats = force || chatDirty ? null : queryCache.get<PersonalChat[]>(personalCacheKey)
    const cachedRequests = force
      ? null
      : queryCache.get<{ incoming: MessageRequest[]; outgoing: MessageRequest[] }>(requestsCacheKey)

    if (cachedGroupChats) setGroupChats(cachedGroupChats)
    const cachedCrewRooms = force ? null : queryCache.get<CrewRoomRow[]>(`${groupCacheKey}_rooms`)
    if (cachedCrewRooms) setCrewRooms(cachedCrewRooms)
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
      const hasRenderedData = groupChats.length + personalChats.length + crewRooms.length > 0 || incomingRequests.length > 0 || hasCachedList || hasCachedRequests
      if (!hasRenderedData && (force || (!hasCachedList && shouldFetchList))) {
        setLoading(true)
      }

      if (shouldFetchList) {
        // If queryCache was empty (e.g. invalidated after a send), also bypass apiClient's
        // internal SWR response cache so we don't get stale data from it either.
        const bypassApiCache = force || !hasCachedList || chatDirty
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

  const onRefresh = useCallback(async () => {
    if (isLoadingRef.current) return
    setRefreshing(true)
    setBoardRefreshKey((k) => k + 1)
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
        const nextPreview = previewFromMessage(data.message) || 'New message'
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
          last_message: previewText(data.message.content) ?? SPONSORED,
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

  const socketStatus = useLiveSync({
    enabled: !!user && !authLoading,
    // Background sync should not force blocking skeleton UI.
    onSync: () => {
      // A board request arrives by push and live sync too, not only on focus.
      setBoardRefreshKey((k) => k + 1)
      return loadChats(false, true)
    },
    domains: ['chat'],
    connectedIntervalMs: 20000,
    disconnectedIntervalMs: 8000,
    maxDisconnectedIntervalMs: 30000,
  })

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
        showToast(userMessage(result, `Couldn't ${action} that request. Try again.`), 'error', { haptic: 'error' })
        await loadChats(true, true)
        return
      }

      Logger.info('chat', `Message request ${action}ed`, { requestId, conversationId: result.data?.conversationId })
      // H.success on the server's yes (Flow 5 #05, ROUND3 F6); a decline shows nobody anything.
      if (action === 'accept') H.success()
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
      showToast(`Couldn't ${action} that request. Try again.`, 'error', { haptic: 'error' })
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

  /*
   * "More" on a request: Block, or Report.
   *
   * Block goes through the request itself (`respond` with `block`), which is
   * what writes the block and closes the request in one step. Report names
   * the sender, and then declines the request, so a report does not leave the
   * thing reported sitting in the inbox waiting for an answer.
   */
  const openRequestMore = (request: MessageRequest) => {
    const name = request.sender_name || 'Someone'
    const senderId = request.sender_id
    showSheet({
      kind: 'actions',
      hue: 'rose',
      title: name,
      message: 'Blocking stops them asking again and hides you from each other. A report goes to our team, and they are not told who sent it.',
      actions: [
        {
          label: 'Block',
          variant: 'destructive',
          run: async () => {
            const result = await apiClient.respondToMessageRequest(request.request_id, 'block')
            if (!result.success) {
              return { ok: false, error: userMessage(result, "Couldn't block them. Try again.") }
            }
            setIncomingRequests((prev) => prev.filter((r) => r.request_id !== request.request_id))
            void loadChats(true, true)
            return { ok: true, toast: `${name} is blocked` }
          },
        },
        ...(senderId
          ? [{
              label: 'Report',
              next: () => userReportStep(name, senderId, () => void respondToRequest(request, 'decline')),
            }]
          : []),
        { label: 'Cancel', cancel: true as const },
      ],
    })
  }

  useEffect(() => {
    // loadChats paints the cached lists before its first await, which is the
    // synchronous setState flagged here. Moving that into render means splitting
    // loadChats across its seven callers and changing the inbox's first frame.
    // That is a change to the inbox, not a lint fix.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!authLoading && user) loadChats(false, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading])

  return {
    user,
    groupChats,
    setGroupChats,
    crewRooms,
    setCrewRooms,
    personalChats,
    setPersonalChats,
    incomingRequests,
    loading,
    listFailed,
    refreshing,
    onRefresh,
    loadChats,
    handleMarkAllRead,
    respondToRequest,
    requestPending,
    openRequestMore,
    socketStatus,
    boardRefreshKey,
    noteOpenRoom,
  }
}

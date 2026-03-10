import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
// Removed AppHeader in favor of custom header matching Figma design
import ActionTray from '../../components/ActionTray'
import ModernChat from '../../components/ModernChat'
import OptimizedImage, { preloadImages } from '../../components/OptimizedImage'
import RealtimeStatusBanner from '../../components/RealtimeStatusBanner'
import FadeInUp from '../../components/motion/FadeInUp'
import ScalePress from '../../components/motion/ScalePress'
import { SkeletonCircle, SkeletonLine } from '../../components/Skeleton'
import { apiClient } from '../../lib/apiClient'
import { useGradientOverlay } from '../../lib/gradientOverlay'
import { Logger } from '../../lib/logger'
import queryCache from '../../lib/queryCache'
import { APP_COLORS } from '../../lib/theme'
import { useMinimumVisible } from '../../lib/useMinimumVisible'
import { computeUnreadCounts, setConversationLastRead, syncUnreadCache } from '../../lib/unread'
import { useAuth } from '../../lib/useAuth'
import { subscribeChatListUpdates } from '../../lib/chatListUpdates'
import { subscribeToUserNotifications, subscribeToChat, PrivateMessageCallback, ChatMessageCallback } from '../../lib/socketClient'
import { hasDirtyDomain } from '../../lib/liveSyncState'
import { useLiveSync } from '../../lib/useLiveSync'

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
}

interface PersonalChat {
  conversation_id: string
  other_user_name: string
  other_user_id: string
  other_user_avatar?: string | null
  last_message?: string
  last_message_time?: string
  unread_count: number
}

interface MessageRequest {
  request_id: string
  sender_name?: string | null
  initial_message?: string | null
}

type ChatTabType = 'group' | 'personal'

const GROUP_CHAT_CACHE_TTL = 60 * 1000
const PERSONAL_CHAT_CACHE_TTL = 60 * 1000
const MESSAGE_REQUESTS_CACHE_TTL = 60 * 1000
const CHAT_BACKGROUND_REFRESH_THROTTLE_MS = 15 * 1000

const getInitials = (name: string) => {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] || ''
  const second = parts[1]?.[0] || ''
  return (first + second).toUpperCase() || first.toUpperCase() || '?'
}

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

export default function Chat() {
  const insets = useSafeAreaInsets()
  const { user, loading: authLoading } = useAuth()
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<ChatTabType>('personal')
  const [incomingRequests, setIncomingRequests] = useState<MessageRequest[]>([])
  const [groupChats, setGroupChats] = useState<GroupChat[]>([])
  const [personalChats, setPersonalChats] = useState<PersonalChat[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showModernChat, setShowModernChat] = useState(false)
  const [settingsTrayVisible, setSettingsTrayVisible] = useState(false)
  const [requestPending, setRequestPending] = useState<Record<string, boolean>>({})
  const { setScrollProgress } = useGradientOverlay()
  const requestAnimRefs = useRef<Record<string, Animated.Value>>({})
  const latestLoadIdRef = useRef(0)
  const isLoadingRef = useRef(false)
  const lastFetchRef = useRef({ group: 0, personal: 0, requests: 0 })
  const skipInitialTabEffectRef = useRef(true)
  const { width, height } = useWindowDimensions()
  const storyChats = useMemo(() => personalChats.slice(0, 10), [personalChats])

  // Responsive sizing based on screen width (baseline ~390)
  const {
    avatarSize,
    storyRingSize,
    storyImageSize,
    unreadSize,
    rowPaddingV,
    emptyPadV,
    storyItemWidth,
  } = useMemo(() => {
    const scale = Math.max(0.9, Math.min(width / 390, 1.2))
    const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max)
    const avatar = clamp(56 * scale, 48, 64)
    const ring = clamp(58 * scale, 54, 68)
    const image = clamp(52 * scale, 48, 60)
    const unread = clamp(22 * scale, 18, 26)
    const rowPad = clamp(12 * scale, 10, 16)
    const emptyPad = clamp(height * 0.12, 40, 100)
    const sItemWidth = clamp(60 * scale, 54, 72)
    return {
      avatarSize: avatar,
      storyRingSize: ring,
      storyImageSize: image,
      unreadSize: unread,
      rowPaddingV: rowPad,
      emptyPadV: emptyPad,
      storyItemWidth: sItemWidth,
    }
  }, [width, height])

  const dynamicStyles = useMemo(() => ({
    avatar: {
      width: avatarSize,
      height: avatarSize,
      borderRadius: avatarSize / 2,
    },
    storyRing: {
      width: storyRingSize,
      height: storyRingSize,
      borderRadius: storyRingSize / 2,
    },
    storyImage: {
      width: storyImageSize,
      height: storyImageSize,
      borderRadius: storyImageSize / 2,
    },
    unreadDot: {
      minWidth: unreadSize,
      height: unreadSize,
      borderRadius: unreadSize / 2,
    },
    avatarSpacing: {
      // Ensure text starts ~71px from left per Figma (text offset - avatar width)
      marginRight: Math.max(12, 71 - avatarSize),
    },
    personalItem: {
      paddingVertical: rowPaddingV,
    },
    chatItem: {
      paddingVertical: rowPaddingV + 2,
    },
    segmentItem: {
      height: 44,
      justifyContent: 'center' as const,
    },
    emptyContainer: {
      paddingVertical: emptyPadV,
    },
    storyItem: {
      width: storyItemWidth,
    },
  }), [avatarSize, storyRingSize, storyImageSize, unreadSize, rowPaddingV, emptyPadV, storyItemWidth])
  const personalItemHeight = useMemo(
    () => Math.round(avatarSize + rowPaddingV * 2 + 14),
    [avatarSize, rowPaddingV]
  )
  const groupItemHeight = useMemo(
    () => Math.round(avatarSize + (rowPaddingV + 2) * 2 + 14),
    [avatarSize, rowPaddingV]
  )

  // Memoized callbacks to prevent re-creation
  const handleGroupChatPress = useCallback((chat: GroupChat) => {
    router.push({
      pathname: '/chat/[id]',
      params: {
        id: chat.chat_room_id,
        roomName: chat.event_title,
        eventTitle: chat.event_title,
      } as any,
    })
  }, [])

  const handlePersonalChatPress = useCallback((chat: PersonalChat) => {
    setConversationLastRead(chat.conversation_id).catch(() => {})
    router.push({
      pathname: '/private-chat/[conversationId]',
      params: { conversationId: chat.conversation_id } as any,
    })
  }, [])

  const onRefresh = useCallback(async () => {
    if (isLoadingRef.current) return
    setRefreshing(true)
    await loadChats(true, true)
    setRefreshing(false)
  }, [])

  const handleMarkAllRead = useCallback(async () => {
    if (activeTab === 'personal' && personalChats.length > 0) {
      await Promise.all(personalChats.map((c) => setConversationLastRead(c.conversation_id)))
      setPersonalChats((prev) => prev.map((c) => ({ ...c, unread_count: 0 })))
    }
  }, [activeTab, personalChats])

  const hasUnread = useMemo(
    () => activeTab === 'personal' && personalChats.some((c) => c.unread_count > 0),
    [activeTab, personalChats]
  )

  // Hydrate on tab switch (cache-first, avoid refetch if cached)
  useEffect(() => {
    if (!authLoading && user) {
      if (skipInitialTabEffectRef.current) {
        skipInitialTabEffectRef.current = false
        return
      }
      loadChats(false, false)
    }
  }, [activeTab, user, authLoading])

  // Load current user's avatar for header
  useEffect(() => {
    let mounted = true
    const run = async () => {
      try {
        if (!user?.id) {
          if (mounted) setMyAvatarUrl(null)
          return
        }

        // Avoid extra fetches when the user object changes but the id is the same.
        if (myAvatarUrl) return

        const result = await apiClient.getProfile(user.id)
        if (mounted) {
          if (!result.success || !result.data) {
            Logger.warn('chat', 'header avatar fetch failed', { error: result.error })
            setMyAvatarUrl(null)
          } else {
            const profile = result.data.profile || {}
            const primary = Array.isArray(profile.profile_photos) && profile.profile_photos.length > 0
              ? profile.profile_photos[0]
              : (Array.isArray(profile.photos) && profile.photos.length > 0 ? profile.photos[0] : result.data.image || null)
            setMyAvatarUrl(primary || null)
          }
        }
      } catch (e) {
        if (mounted) setMyAvatarUrl(null)
      }
    }
    run()
    return () => { mounted = false }
  }, [user?.id, myAvatarUrl])

  // Real-time private message updates via Socket.io
  useEffect(() => {
    if (!user) return

    Logger.info('chat', 'Setting up real-time message subscription')

    const handleNewMessage: PrivateMessageCallback = (data) => {
      Logger.debug('chat', 'New message received', { conversationId: data.conversationId })

      // Update the conversation in the personal chats list
      setPersonalChats(prev => {
        const idx = prev.findIndex(c => c.conversation_id === data.conversationId)

        if (idx === -1) {
          // New conversation - reload the list to get full details
          loadPersonalChats(undefined, undefined, true)
          return prev
        }

        // Update existing conversation
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

        // Move updated conversation to top
        const [item] = updated.splice(idx, 1)
        return [item, ...updated]
      })
    }

    const unsubscribe = subscribeToUserNotifications(user.id, handleNewMessage)

    return () => {
      Logger.debug('chat', 'Cleaning up message subscription')
      unsubscribe()
    }
  }, [user])

  // Real-time group chat updates — subscribe to loaded group chat rooms
  // so chat:message events are received and mark the domain dirty
  useEffect(() => {
    if (!user || groupChats.length === 0) return

    const unsubs: (() => void)[] = []

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

        // Move updated group chat to top
        const [item] = updated.splice(idx, 1)
        return [item, ...updated]
      })
    }

    for (const chat of groupChats) {
      unsubs.push(subscribeToChat(chat.chat_room_id, handleGroupMessage))
    }

    return () => {
      unsubs.forEach(fn => fn())
    }
  }, [user, groupChats.length])

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

          // Move to top
          const [item] = updated.splice(idx, 1)
          return [item, ...updated]
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

          // Move to top
          const [item] = updated.splice(idx, 1)
          return [item, ...updated]
        })
      }
    })

    return unsub
  }, [])

  const loadChats = async (force = false, refreshEvenIfCached = false) => {
    if (!user) return

    const perfStart = Date.now()
    const userId = user.id
    const groupCacheKey = `group_chats_${userId}`
    const personalCacheKey = `personal_chats_${userId}`
    const requestsCacheKey = `message_requests_${userId}`

    const cachedGroupChats = !force && activeTab === 'group'
      ? queryCache.get<GroupChat[]>(groupCacheKey)
      : null
    const cachedPersonalChats = !force && activeTab === 'personal'
      ? queryCache.get<PersonalChat[]>(personalCacheKey)
      : null
    const shouldHydrateRequests = activeTab === 'personal'
    const cachedRequests = !force && shouldHydrateRequests
      ? queryCache.get<{ incoming: MessageRequest[]; outgoing: MessageRequest[] }>(requestsCacheKey)
      : null

    if (cachedGroupChats && activeTab === 'group') setGroupChats(cachedGroupChats)
    if (cachedPersonalChats && activeTab === 'personal') setPersonalChats(cachedPersonalChats)
    if (cachedRequests) {
      setIncomingRequests(cachedRequests.incoming)
    }

    const hasCachedList = activeTab === 'group' ? !!cachedGroupChats : !!cachedPersonalChats
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
      || (refreshEvenIfCached && now - lastFetchRef.current[activeTab] > CHAT_BACKGROUND_REFRESH_THROTTLE_MS)
    const shouldFetchRequests = shouldHydrateRequests && (force
      || !hasCachedRequests
      || (refreshEvenIfCached && now - lastFetchRef.current.requests > CHAT_BACKGROUND_REFRESH_THROTTLE_MS))

    if (!shouldFetchList && !shouldFetchRequests) return

    const loadId = ++latestLoadIdRef.current
    try {
      isLoadingRef.current = true
      const hasRenderedData = activeTab === 'group'
        ? (groupChats.length > 0 || hasCachedList)
        : (personalChats.length > 0 || incomingRequests.length > 0 || hasCachedList || hasCachedRequests)
      if (!hasRenderedData && (force || (!hasCachedList && shouldFetchList))) {
        setLoading(true)
      }
      Logger.debug('chat', `Loading chats for tab: ${activeTab}`)
      
      if (shouldFetchList) {
        if (activeTab === 'group') {
          await loadGroupChats(loadId, groupCacheKey, force)
          lastFetchRef.current.group = now
        } else {
          await loadPersonalChats(loadId, personalCacheKey, force)
          lastFetchRef.current.personal = now
        }
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
        tab: activeTab,
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
      // Note: outgoing requests would need a separate API call if needed
    } catch (e) {
      Logger.error('chat', 'loadMessageRequests failed', { error: e })
      if (loadId === undefined || latestLoadIdRef.current === loadId) {
        setIncomingRequests([])
      }
    }
  }

  const loadGroupChats = async (loadId?: number, cacheKey?: string, force = false) => {
    try {
      Logger.debug('chat', 'Fetching group chats...')

      // Use API to get chat groups
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

      // Transform API response to GroupChat interface
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
          }
        })
        .filter((chat) => chat.chat_room_id)

      if (loadId === undefined || latestLoadIdRef.current === loadId) setGroupChats(groupChatData)
      if (cacheKey) queryCache.set(cacheKey, groupChatData, GROUP_CHAT_CACHE_TTL)
      try {
        const firstScreenUrls = groupChatData
          .map((c) => c.event_image)
          .filter((u): u is string => !!u)
          .slice(0, 8)
        if (firstScreenUrls.length > 0) {
          preloadImages(firstScreenUrls, 'low')
        }
      } catch {}
      Logger.info('chat', `Loaded ${groupChatData.length} group chats`)
    } catch (error) {
      Logger.error('chat', 'Error loading group chats', { error })
      setGroupChats([])
    }
  }

  const loadPersonalChats = async (loadId?: number, cacheKey?: string, force = false) => {
    try {
      const perfStart = Date.now()
      Logger.debug('chat', 'Fetching personal chats...')

      const result = await apiClient.getConversations({ force })

      if (loadId !== undefined && latestLoadIdRef.current !== loadId) return

      if (result.success && result.data) {
        const conversations = result.data
        const hasUnreadCounts = conversations.some((c: any) => c?.unreadCount !== undefined && c?.unreadCount !== null)
        const unreadStart = Date.now()
        const unreadMap = hasUnreadCounts
          ? {}
          : await computeUnreadCounts(conversations.map((c: any) => String(c.id || c.conversation_id || '')).filter(Boolean))
        const unreadDurationMs = Date.now() - unreadStart

        const personalChatData: PersonalChat[] = conversations.map((conv: any) => {
          const convId = String(conv.id || conv.conversation_id || '')
          const preview = previewFromConversation(conv)
          const otherUser = conv.otherUser || conv.other_user || {}
          return {
            conversation_id: convId,
            other_user_name: otherUser?.name || otherUser?.display_name || 'Unknown',
            other_user_id: String(otherUser?.id || otherUser?.user_id || ''),
            other_user_avatar: otherUser?.image || otherUser?.avatar || null,
            last_message: preview.text,
            last_message_time: preview.time,
            unread_count: (conv.unreadCount ?? conv.unread_count ?? unreadMap[convId]) || 0,
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
        Logger.info('chat', `Loaded ${personalChatData.length} personal chats`)
        Logger.info('chat', 'personal chats timing', {
          durationMs: Date.now() - perfStart,
          unreadDurationMs,
          usedApiUnreadCounts: hasUnreadCounts,
        })
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
      const value = getRequestAnimValue(requestId)
      Animated.timing(value, {
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

      await loadChats(false, true)
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
  }, [animateRequestRemoval, loadChats, requestPending])

  

  const GroupChatRow = useMemo(() => {
    const Row = React.memo(function GroupChatRowItem({ item }: { item: GroupChat }) {
      return (
        <TouchableOpacity
          style={[styles.personalItem, dynamicStyles.personalItem]}
          onPress={() => handleGroupChatPress(item)}
          accessibilityRole="button"
          accessibilityLabel={`Open event room ${item.event_title}. ${displayPreview(item.last_message, 'No messages yet')}`}
        >
          <View style={[styles.avatarContainer, dynamicStyles.avatarSpacing]}>
            {item.event_image ? (
              <OptimizedImage source={item.event_image} style={[styles.avatar as any, dynamicStyles.avatar]} width={Math.round(dynamicStyles.avatar.width)} height={Math.round(dynamicStyles.avatar.height)} quality={60} />
            ) : (
              <View style={[styles.avatar, dynamicStyles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitials}>{(item.event_title || 'E').slice(0,1)}</Text>
              </View>
            )}
          </View>
          <View style={styles.personalContent}>
            <View style={styles.personalHeader}>
              <Text style={styles.personalName} numberOfLines={1}>{item.event_title}</Text>
              <Text style={styles.personalTime}>
                {item.last_message_time ? formatRelativeTime(item.last_message_time) : ''}
              </Text>
            </View>
            <View style={styles.personalFooter}>
              <Text style={styles.personalPreview} numberOfLines={1}>
                {displayPreview(item.last_message, 'No messages yet')}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      )
    })
    Row.displayName = 'GroupChatRow'
    return Row
  }, [dynamicStyles, handleGroupChatPress])

  const renderGroupChatItem = useCallback(({ item, index }: { item: GroupChat; index: number }) => (
    <FadeInUp delay={Math.min(index * 22, 150)} distance={8}>
      <GroupChatRow item={item} />
    </FadeInUp>
  ), [GroupChatRow])

  const PersonalChatRow = useMemo(() => {
    const Row = React.memo(function PersonalChatRowItem({ item }: { item: PersonalChat }) {
      const unreadText = item.unread_count > 99 ? '99+' : String(item.unread_count)
      return (
        <TouchableOpacity
          style={[styles.personalItem, dynamicStyles.personalItem]}
          onPress={() => handlePersonalChatPress(item)}
          accessibilityRole="button"
          accessibilityLabel={`Open chat with ${item.other_user_name}. ${displayPreview(item.last_message)}`}
        >
          <View style={[styles.avatarContainer, dynamicStyles.avatarSpacing]}>
            {item.other_user_avatar ? (
              <OptimizedImage source={item.other_user_avatar} style={[styles.avatar as any, dynamicStyles.avatar]} width={Math.round(dynamicStyles.avatar.width)} height={Math.round(dynamicStyles.avatar.height)} quality={60} />
            ) : (
              <View style={[styles.avatar, dynamicStyles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitials}>{getInitials(item.other_user_name)}</Text>
              </View>
            )}
          </View>
          <View style={styles.personalContent}>
            <View style={styles.personalHeader}>
              <Text style={styles.personalName} numberOfLines={1}>{item.other_user_name}</Text>
              <View style={styles.personalHeaderRight}>
                <Text style={styles.personalTime}>
                  {item.last_message_time ? formatRelativeTime(item.last_message_time) : ''}
                </Text>
                {item.unread_count > 0 && (
                  <View style={[styles.unreadDot, dynamicStyles.unreadDot]}>
                    <Text style={styles.unreadDotText}>{unreadText}</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={styles.personalFooter}>
              <Text style={styles.personalPreview} numberOfLines={1}>
                {displayPreview(item.last_message)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      )
    })
    Row.displayName = 'PersonalChatRow'
    return Row
  }, [dynamicStyles, handlePersonalChatPress])

  const renderPersonalChatItem = useCallback(({ item, index }: { item: PersonalChat; index: number }) => (
    <FadeInUp delay={Math.min(index * 22, 150)} distance={8}>
      <PersonalChatRow item={item} />
    </FadeInUp>
  ), [PersonalChatRow])

  const renderEmptyState = useCallback(() => (
    <FadeInUp delay={80} distance={10}>
      <View style={[styles.emptyContainer, dynamicStyles.emptyContainer]}>
      <Text style={styles.emptyTitle}>
        {activeTab === 'group' ? 'No Group Chats' : 'No Personal Chats'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {activeTab === 'group' 
          ? 'Check into events to join group chats' 
          : 'Start conversations with other users'
        }
      </Text>
      <ScalePress
        style={styles.emptyCta}
        onPress={() => router.push(activeTab === 'group' ? '/(tabs)/events' as any : '/(tabs)/match' as any)}
        accessibilityRole="button"
        accessibilityLabel={activeTab === 'group' ? 'Browse events' : 'Discover people'}
      >
        <Text style={styles.emptyCtaText}>{activeTab === 'group' ? 'Browse Events' : 'Discover People'}</Text>
      </ScalePress>
      {incomingRequests.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ textAlign: 'center', color: '#E5E7EB', fontWeight: '600' }}>
            You have {incomingRequests.length} chat request(s)
          </Text>
        </View>
      )}
      </View>
    </FadeInUp>
  ), [activeTab, dynamicStyles.emptyContainer, incomingRequests.length])

  const isLoading = authLoading || loading
  const showLoadingSkeleton = useMinimumVisible(isLoading, 700)
  const getGroupKey = useCallback((item: GroupChat) => item.chat_room_id, [])
  const getPersonalKey = useCallback((item: PersonalChat) => item.conversation_id, [])
  const getGroupItemLayout = useCallback(
    (_: ArrayLike<GroupChat> | null | undefined, index: number) => ({
      length: groupItemHeight,
      offset: groupItemHeight * index,
      index,
    }),
    [groupItemHeight]
  )
  const getPersonalItemLayout = useCallback(
    (_: ArrayLike<PersonalChat> | null | undefined, index: number) => ({
      length: personalItemHeight,
      offset: personalItemHeight * index,
      index,
    }),
    [personalItemHeight]
  )
  const handleListScroll = useCallback(
    (e: any) => {
      setScrollProgress(e.nativeEvent.contentOffset.y, 240)
    },
    [setScrollProgress]
  )

  // Show modern chat demo if toggled
  if (showModernChat) {
    return (
      <>
        <ModernChat
          groupName="Bobs Chat Room"
          participantCount={5}
          onBack={() => setShowModernChat(false)}
          onSettings={() => setSettingsTrayVisible(true)}
        />
        <ActionTray
          visible={settingsTrayVisible}
          title="Settings"
          message="Chat settings will be available soon."
          buttons={[{ label: 'Done', variant: 'primary', onPress: () => setSettingsTrayVisible(false) }]}
          onClose={() => setSettingsTrayVisible(false)}
          size="compact"
        />
      </>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <StatusBar style="light" backgroundColor={APP_COLORS.backgroundBase} />
      {/* Header gradient + stories */}
      <View style={[styles.headerGradient, { paddingTop: insets.top }]}>
        <LinearGradient
          colors={['#111214', APP_COLORS.backgroundBase]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Custom header row to mirror Figma (title only, no avatar) */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>The Banter</Text>
          </View>
          <View style={styles.headerActions}>
            {hasUnread && (
              <TouchableOpacity
                onPress={handleMarkAllRead}
                style={styles.headerActionBtn}
                accessibilityRole="button"
                accessibilityLabel="Mark all conversations as read"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="checkmark-done-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.headerRight} onPress={() => router.push('/edit-profile')}
              accessibilityRole="button" accessibilityLabel="Edit profile">
              <Ionicons name="pencil" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

      {activeTab === 'personal' && !showLoadingSkeleton && storyChats.length > 0 && (
        <View style={styles.storiesCard}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.storiesRow}
            >
              {(storyChats).map((c, idx) => (
                <View key={c.conversation_id ?? idx} style={[styles.storyItem, dynamicStyles.storyItem, idx !== storyChats.length - 1 && styles.storyItemSpacing]}>
                  <LinearGradient
                    colors={[APP_COLORS.accent, '#64D2FF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.storyRing, dynamicStyles.storyRing]}
                  >
                    {c.other_user_avatar ? (
                      <OptimizedImage source={c.other_user_avatar} style={[styles.storyImage as any, dynamicStyles.storyImage]} width={Math.round(dynamicStyles.storyImage.width)} height={Math.round(dynamicStyles.storyImage.height)} quality={60} />
                    ) : (
                      <View style={[styles.storyImage, dynamicStyles.storyImage, styles.avatarFallback]}>
                        <Text style={styles.avatarInitials}>{getInitials(c.other_user_name)}</Text>
                      </View>
                    )}
                  </LinearGradient>
                  <Text style={styles.storyLabel} numberOfLines={1}>{c.other_user_name?.split(' ')[0] || 'User'}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      <RealtimeStatusBanner status={socketStatus} style={styles.socketBanner} />

      {/* Segmented control */}
      <View style={styles.segmentContainer}>
        <View style={styles.segmentPill}>
          {/* Gradient background (cheaper than blur) */}
          <LinearGradient
            colors={[APP_COLORS.backgroundElevated, APP_COLORS.backgroundCard]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.segmentGradient}
          />
          {/* borderless glass */}
          <TouchableOpacity
            onPress={() => setActiveTab('personal')}
          style={[styles.segmentItem, dynamicStyles.segmentItem, activeTab === 'personal' && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, activeTab === 'personal' && styles.segmentTextActive]}>Recent Chats</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab('group')}
          style={[styles.segmentItem, dynamicStyles.segmentItem, activeTab === 'group' && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, activeTab === 'group' && styles.segmentTextActive]}>Event Rooms</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Chat List */}
      {activeTab === 'group' ? (
        showLoadingSkeleton ? (
          <View style={[styles.listContainer]}>
            {[...Array(8)].map((_, i) => (
              <View key={`sk-g-${i}`} style={styles.chatItem}>
                <View style={styles.chatHeader}>
                  <SkeletonLine width={'60%'} />
                  <SkeletonLine width={40} />
                </View>
                <SkeletonLine width={'40%'} style={{ marginBottom: 10 }} />
                <SkeletonLine width={'80%'} />
              </View>
            ))}
          </View>
        ) : (
          <FadeInUp delay={40} distance={6}>
            <FlatList
              data={groupChats}
              renderItem={renderGroupChatItem}
              keyExtractor={getGroupKey}
              initialNumToRender={6}
              maxToRenderPerBatch={6}
              updateCellsBatchingPeriod={50}
              windowSize={8}
              getItemLayout={getGroupItemLayout}
              removeClippedSubviews
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
              ListEmptyComponent={renderEmptyState}
              contentContainerStyle={[
                styles.listContainer,
                groupChats.length === 0 && styles.emptyListContainer
              ]}
              onScroll={handleListScroll}
              scrollEventThrottle={16}
            />
          </FadeInUp>
        )
      ) : (
        showLoadingSkeleton ? (
          <View style={[styles.listContainer]}>
            {[...Array(10)].map((_, i) => (
              <View key={`sk-p-${i}`} style={styles.personalItem}>
                <View style={styles.avatarContainer}>
                  <SkeletonCircle width={56} />
                </View>
                <View style={styles.personalContent}>
                  <View style={styles.personalHeader}>
                    <SkeletonLine width={'40%'} />
                    <SkeletonLine width={40} />
                  </View>
                  <View style={styles.personalFooter}>
                    <SkeletonLine width={'70%'} />
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <>
            {incomingRequests.length > 0 && (
              <View style={styles.requestsContainer}>
                <Text style={styles.requestsTitle}>Requests</Text>
                {incomingRequests.map((r) => {
                  const requestAnim = getRequestAnimValue(r.request_id)
                  const isPending = !!requestPending[r.request_id]
                  return (
                  <Animated.View
                    key={r.request_id}
                    style={[
                      styles.requestItem,
                      {
                        opacity: requestAnim,
                        transform: [
                          {
                            scale: requestAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.94, 1],
                            }),
                          },
                          {
                            translateY: requestAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [-10, 0],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    <Text style={styles.requestSender}>{r.sender_name || 'User'}</Text>
                    {!!r.initial_message && (
                      <Text style={styles.requestMessage} numberOfLines={1}>{r.initial_message}</Text>
                    )}
                    <View style={styles.requestActions}>
                      <ScalePress
                        style={[styles.reqBtn, styles.reject, isPending && styles.reqBtnDisabled]}
                        onPress={() => respondToRequest(r, 'decline')}
                        disabled={isPending}
                        pressedScale={0.97}
                      >
                        <Text style={styles.reqBtnText}>Reject</Text>
                      </ScalePress>
                      <ScalePress
                        style={[styles.reqBtn, styles.reqBtnSpacing, styles.accept, isPending && styles.reqBtnDisabled]}
                        onPress={() => respondToRequest(r, 'accept')}
                        disabled={isPending}
                        pressedScale={0.97}
                      >
                        <Text style={styles.reqBtnText}>Accept</Text>
                      </ScalePress>
                    </View>
                  </Animated.View>
                )})}
              </View>
            )}
            <FadeInUp delay={40} distance={6}>
              <FlatList
                data={personalChats}
                renderItem={renderPersonalChatItem}
                keyExtractor={getPersonalKey}
                initialNumToRender={6}
                maxToRenderPerBatch={4}
                updateCellsBatchingPeriod={50}
                windowSize={6}
                getItemLayout={getPersonalItemLayout}
                removeClippedSubviews
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                ListEmptyComponent={renderEmptyState}
                contentContainerStyle={[
                  styles.listContainer,
                  personalChats.length === 0 && styles.emptyListContainer
                ]}
                onScroll={handleListScroll}
                scrollEventThrottle={32}
              />
            </FadeInUp>
          </>
        )
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: APP_COLORS.backgroundBase,
  },
  headerGradient: {
  },
  
  storiesCard: {
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
    backgroundColor: APP_COLORS.backgroundElevated,
  },
  storiesRow: {
    paddingHorizontal: 8,
  },
  storyItem: {
    alignItems: 'center',
  },
  storyItemSpacing: {
    marginRight: 16,
  },
  storyRing: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
  },
  storyImage: {
    backgroundColor: APP_COLORS.backgroundCard,
  },
  storyLabel: {
    marginTop: 6,
    fontSize: 14,
    color: APP_COLORS.textPrimary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: APP_COLORS.backgroundBase,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  segmentContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  socketBanner: {
    marginTop: 8,
    marginHorizontal: 16,
  },
  segmentPill: {
    flexDirection: 'row',
    borderRadius: 26,
    overflow: 'hidden',
    height: 52,
    position: 'relative',
    paddingHorizontal: 6,
    paddingVertical: 0,
    alignItems: 'center',
    backgroundColor: APP_COLORS.backgroundElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
  },
  segmentGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 26,
  },
  // no stroke for borderless look
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 22,
  },
  segmentActive: {
    backgroundColor: 'rgba(10,132,255,0.18)',
    borderRadius: 22,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '700',
    color: APP_COLORS.textSecondary,
  },
  segmentTextActive: {
    color: APP_COLORS.textPrimary,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  emptyListContainer: {
    flex: 1,
  },
  personalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 14,
  },
  chatItem: {
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 14,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 16,
  },
  avatar: {
    backgroundColor: APP_COLORS.backgroundCard,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  avatarInitials: {
    fontSize: 18,
    fontWeight: '700',
    color: APP_COLORS.textPrimary,
  },
  onlineDot: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2AD866',
    borderWidth: 2,
    borderColor: '#0E0E0E',
  },
  personalContent: {
    flex: 1,
  },
  personalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  personalHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  personalName: {
    fontSize: 20,
    fontWeight: '700',
    color: APP_COLORS.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  personalTime: {
    fontSize: 12,
    color: APP_COLORS.textTertiary,
  },
  personalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  personalPreview: {
    fontSize: 12,
    color: APP_COLORS.textSecondary,
    flex: 1,
    marginRight: 8,
  },
  unreadDot: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: APP_COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  unreadDotText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  chatTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: APP_COLORS.textPrimary,
    flex: 1,
  },
  participantCount: {
    fontSize: 14,
    color: APP_COLORS.textSecondary,
  },
  unreadBadge: {
    backgroundColor: APP_COLORS.accent,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  unreadCount: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  requestItem: {
    backgroundColor: APP_COLORS.backgroundElevated,
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
  },
  requestActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  reqBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  reqBtnDisabled: {
    opacity: 0.62,
  },
  reqBtnSpacing: { marginLeft: 10 },
  requestsContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  requestsTitle: {
    fontWeight: '700',
    color: APP_COLORS.textPrimary,
    marginBottom: 8,
  },
  requestSender: {
    fontWeight: '600',
    color: APP_COLORS.textPrimary,
  },
  requestMessage: {
    color: APP_COLORS.textSecondary,
    marginTop: 4,
  },
  accept: { backgroundColor: APP_COLORS.success },
  reject: { backgroundColor: APP_COLORS.destructive },
  reqBtnText: { color: '#fff', fontWeight: '700' },
  chatVenue: {
    fontSize: 14,
    color: APP_COLORS.textSecondary,
    marginBottom: 8,
  },
  lastMessageContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  lastMessage: {
    fontSize: 14,
    color: APP_COLORS.textSecondary,
    flex: 1,
    marginRight: 8,
  },
  lastMessageTime: {
    fontSize: 12,
    color: APP_COLORS.textTertiary,
    minWidth: 44,
    textAlign: 'right',
    marginLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: APP_COLORS.textPrimary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: APP_COLORS.textSecondary,
    textAlign: 'center',
  },
  emptyCta: {
    marginTop: 14,
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: APP_COLORS.accent,
  },
  emptyCtaText: {
    color: APP_COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  // Header styles (Figma: small avatar + title on gradient)
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    marginLeft: 0,
    fontSize: 24,
    fontWeight: '700',
    color: APP_COLORS.textPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerActionBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
}) 

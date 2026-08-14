import AsyncStorage from '@react-native-async-storage/async-storage'
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
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import OptimizedImage, { preloadImages } from '../../components/OptimizedImage'
import RealtimeStatusBanner from '../../components/RealtimeStatusBanner'
import { useToast } from '../../components/Toast'
import FadeInUp from '../../components/motion/FadeInUp'
import ScalePress from '../../components/motion/ScalePress'
import { SkeletonCircle, SkeletonLine } from '../../components/Skeleton'
import Avatar from '../../components/ui/Avatar'
import GlassSurface from '../../components/ui/GlassSurface'
import { apiClient } from '../../lib/apiClient'
import { useGradientOverlay } from '../../lib/gradientOverlay'
import { Logger } from '../../lib/logger'
import queryCache from '../../lib/queryCache'
import { APP_COLORS, APP_FONTS, APP_RADIUS } from '../../lib/theme'
import { setConversationLastRead, syncUnreadCache } from '../../lib/unread'
import { useAuth } from '../../lib/useAuth'
import { subscribeChatListUpdates } from '../../lib/chatListUpdates'
import { subscribeToUserNotifications, subscribeToChatMessage, PrivateMessageCallback, ChatMessageCallback } from '../../lib/socketClient'
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
  sender_id?: string | null
  sender_name?: string | null
  sender_avatar?: string | null
  initial_message?: string | null
}

type UnifiedChatItem =
  | { type: 'personal'; id: string; data: PersonalChat }
  | { type: 'group'; id: string; data: GroupChat }

interface PinnedRef {
  id: string
  type: 'group' | 'personal'
}

const GROUP_CHAT_CACHE_TTL = 60 * 1000
const PERSONAL_CHAT_CACHE_TTL = 60 * 1000
const MESSAGE_REQUESTS_CACHE_TTL = 60 * 1000
const CHAT_BACKGROUND_REFRESH_THROTTLE_MS = 15 * 1000
const PINNED_KEY = 'pinned_chats'
const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 }

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
  const { showToast } = useToast()
  const [incomingRequests, setIncomingRequests] = useState<MessageRequest[]>([])
  const [groupChats, setGroupChats] = useState<GroupChat[]>([])
  const [personalChats, setPersonalChats] = useState<PersonalChat[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [requestPending, setRequestPending] = useState<Record<string, boolean>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [pinnedRefs, setPinnedRefs] = useState<PinnedRef[]>([])
  const { setScrollProgress } = useGradientOverlay()
  const requestAnimRefs = useRef<Record<string, Animated.Value>>({})
  const latestLoadIdRef = useRef(0)
  const isLoadingRef = useRef(false)
  const lastFetchRef = useRef({ list: 0, requests: 0 })
  const groupChatUnsubsRef = useRef<Map<string, () => void>>(new Map())
  const searchInputRef = useRef<TextInput>(null)

  const comingSoon = useCallback(() => showToast('Coming soon', 'info'), [showToast])

  // Memoized callbacks to prevent re-creation
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

  const onRefresh = useCallback(async () => {
    if (isLoadingRef.current) return
    setRefreshing(true)
    await loadChats(true, true)
    setRefreshing(false)
  }, [])

  const handleMarkAllRead = useCallback(async () => {
    if (personalChats.length > 0) {
      await Promise.all(personalChats.map((c) => setConversationLastRead(c.conversation_id)))
      setPersonalChats((prev) => prev.map((c) => ({ ...c, unread_count: 0 })))
    }
  }, [personalChats])

  const hasUnread = useMemo(
    () => personalChats.some((c) => c.unread_count > 0),
    [personalChats]
  )

  // Load pinned conversation refs (local-only feature, no backend concept exists).
  useEffect(() => {
    let mounted = true
    const run = async () => {
      if (!user?.id) {
        if (mounted) setPinnedRefs([])
        return
      }
      try {
        const raw = await AsyncStorage.getItem(`${PINNED_KEY}_${user.id}`)
        if (mounted) setPinnedRefs(raw ? JSON.parse(raw) : [])
      } catch (e) {
        Logger.warn('chat', 'Failed to load pinned chats', { error: e })
        if (mounted) setPinnedRefs([])
      }
    }
    run()
    return () => { mounted = false }
  }, [user?.id])

  const togglePin = useCallback((id: string, type: 'group' | 'personal', name: string) => {
    if (!user?.id) return
    setPinnedRefs((prev) => {
      const exists = prev.some((p) => p.id === id && p.type === type)
      const next = exists ? prev.filter((p) => !(p.id === id && p.type === type)) : [...prev, { id, type }]
      AsyncStorage.setItem(`${PINNED_KEY}_${user.id}`, JSON.stringify(next)).catch((e) => {
        Logger.warn('chat', 'Failed to persist pinned chats', { error: e })
      })
      showToast(exists ? `Unpinned ${name}` : `Pinned ${name}`, 'success')
      return next
    })
  }, [user?.id, showToast])

  // Load current user's avatar for header — no longer used (header no longer shows an avatar
  // per Figma's Banter design), avatar fetch removed.

  // Real-time private message updates via Socket.io
  useEffect(() => {
    if (!user) return

    Logger.info('chat', 'Setting up real-time message subscription')

    const handleNewMessage: PrivateMessageCallback = (data) => {
      Logger.debug('chat', 'New message received', { conversationId: data.conversationId })

      setPersonalChats(prev => {
        const idx = prev.findIndex(c => c.conversation_id === data.conversationId)

        if (idx === -1) {
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
          unread_count: isFromMe ? updated[idx].unread_count : updated[idx].unread_count + 1,
        }

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

  // Real-time group chat updates — subscribe to loaded group chat rooms.
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

        const [item] = updated.splice(idx, 1)
        return [item, ...updated]
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

  useEffect(() => {
    return () => {
      groupChatUnsubsRef.current.forEach(unsub => unsub())
      groupChatUnsubsRef.current.clear()
    }
  }, [])

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

    const cachedGroupChats = !force ? queryCache.get<GroupChat[]>(groupCacheKey) : null
    const cachedPersonalChats = !force ? queryCache.get<PersonalChat[]>(personalCacheKey) : null
    const cachedRequests = !force
      ? queryCache.get<{ incoming: MessageRequest[]; outgoing: MessageRequest[] }>(requestsCacheKey)
      : null

    if (cachedGroupChats) setGroupChats(cachedGroupChats)
    if (cachedPersonalChats) setPersonalChats(cachedPersonalChats)
    if (cachedRequests) setIncomingRequests(cachedRequests.incoming)

    const hasCachedList = !!cachedGroupChats || !!cachedPersonalChats
    const hasCachedRequests = !!cachedRequests
    if (!force && (hasCachedList || hasCachedRequests)) {
      setLoading(false)
    }

    const now = Date.now()
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
      const hasRenderedData = groupChats.length > 0 || personalChats.length > 0 || incomingRequests.length > 0 || hasCachedList || hasCachedRequests
      if (!hasRenderedData && (force || (!hasCachedList && shouldFetchList))) {
        setLoading(true)
      }
      Logger.debug('chat', 'Loading chats')

      if (shouldFetchList) {
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

  useEffect(() => {
    if (!authLoading && user) {
      loadChats(false, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading])

  const socketStatus = useLiveSync({
    enabled: !!user && !authLoading,
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
          sender_id: r.senderId || r.sender?.id || null,
          sender_name: r.sender?.name || null,
          sender_avatar: r.sender?.avatar || null,
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
      Logger.debug('chat', 'Fetching group chats...')

      const result = await apiClient.getChatGroups({ force })

      if (!result.success || !result.data) {
        Logger.error('chat', 'Error fetching group chats', { error: result.error })
        if (loadId === undefined || latestLoadIdRef.current === loadId) setGroupChats([])
        return
      }

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
            unread_count: (conv.unreadCount ?? conv.unread_count) || 0,
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
        Logger.info('chat', `Loaded ${personalChatData.length} personal chats`, {
          durationMs: Date.now() - perfStart,
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
          pathname: '/connection-success',
          params: {
            conversationId: result.data.conversationId,
            otherUserId: request.sender_id || '',
            otherUserName: request.sender_name || 'them',
            otherUserAvatar: request.sender_avatar || '',
          } as any,
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

  // Merge group + personal chats into one recency-sorted list, matching Figma's unified inbox
  // (the old implementation split these into two tabs — see FIGMA_REDESIGN_BACKLOG.md).
  const unifiedItems = useMemo<UnifiedChatItem[]>(() => {
    const personal: UnifiedChatItem[] = personalChats.map((c) => ({ type: 'personal', id: c.conversation_id, data: c }))
    const group: UnifiedChatItem[] = groupChats.map((c) => ({ type: 'group', id: c.chat_room_id, data: c }))
    const merged = [...personal, ...group]
    merged.sort((a, b) => {
      const at = a.data.last_message_time ? new Date(a.data.last_message_time).getTime() : 0
      const bt = b.data.last_message_time ? new Date(b.data.last_message_time).getTime() : 0
      return bt - at
    })
    return merged
  }, [personalChats, groupChats])

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return unifiedItems
    return unifiedItems.filter((item) => {
      const name = item.type === 'personal' ? item.data.other_user_name : item.data.event_title
      return name.toLowerCase().includes(q)
    })
  }, [unifiedItems, searchQuery])

  const pinnedItems = useMemo(() => {
    return pinnedRefs
      .map((ref) => unifiedItems.find((i) => i.id === ref.id && i.type === ref.type))
      .filter((i): i is UnifiedChatItem => !!i)
  }, [pinnedRefs, unifiedItems])

  const itemName = useCallback((item: UnifiedChatItem) => (
    item.type === 'personal' ? item.data.other_user_name : item.data.event_title
  ), [])

  const handleItemPress = useCallback((item: UnifiedChatItem) => {
    if (item.type === 'personal') handlePersonalChatPress(item.data)
    else handleGroupChatPress(item.data)
  }, [handlePersonalChatPress, handleGroupChatPress])

  const ChatRow = useMemo(() => {
    const Row = React.memo(function ChatRowItem({ item }: { item: UnifiedChatItem }) {
      const isPersonal = item.type === 'personal'
      const name = itemName(item)
      const preview = isPersonal
        ? displayPreview(item.data.last_message)
        : displayPreview(item.data.last_message, 'No messages yet')
      const time = item.data.last_message_time
      const unread = isPersonal && item.data.unread_count > 0
      const avatarSource = isPersonal ? item.data.other_user_avatar : item.data.event_image

      return (
        <TouchableOpacity
          style={styles.row}
          onPress={() => handleItemPress(item)}
          onLongPress={() => togglePin(item.id, item.type, name)}
          delayLongPress={350}
          accessibilityRole="button"
          accessibilityLabel={`Open ${isPersonal ? 'chat with' : 'event room'} ${name}. ${preview}`}
        >
          {avatarSource ? (
            <Avatar source={avatarSource} size={56} statusDot={unread} statusColor={APP_COLORS.accent} />
          ) : (
            <View style={styles.rowFallbackAvatar}>
              {isPersonal ? (
                <Text style={styles.avatarInitials}>{getInitials(name)}</Text>
              ) : (
                <Ionicons name="people" size={22} color={APP_COLORS.textSecondary} />
              )}
              {unread && <View style={styles.fallbackUnreadDot} />}
            </View>
          )}
          <View style={styles.rowContent}>
            <View style={styles.rowHeader}>
              <Text style={[styles.rowName, unread && styles.rowNameUnread]} numberOfLines={1}>{name}</Text>
              <Text style={[styles.rowTime, unread && styles.rowTimeUnread]}>
                {time ? formatRelativeTime(time) : ''}
              </Text>
            </View>
            <Text style={[styles.rowPreview, unread && styles.rowPreviewUnread]} numberOfLines={1}>{preview}</Text>
          </View>
        </TouchableOpacity>
      )
    })
    Row.displayName = 'ChatRow'
    return Row
  }, [handleItemPress, itemName, togglePin])

  const renderChatItem = useCallback(({ item, index }: { item: UnifiedChatItem; index: number }) => (
    <FadeInUp delay={Math.min(index * 22, 150)} distance={8}>
      <ChatRow item={item} />
    </FadeInUp>
  ), [ChatRow])

  const renderEmptyState = useCallback(() => (
    <FadeInUp delay={80} distance={10}>
      <View style={styles.emptyContainer}>
        <View style={styles.emptyGlyph}>
          <Ionicons name="chatbubbles-outline" size={36} color={APP_COLORS.textTertiary} />
        </View>
        <Text style={styles.emptyTitle}>
          {searchQuery ? 'No matches' : 'No conversations yet'}
        </Text>
        <Text style={styles.emptySubtitle}>
          {searchQuery
            ? 'Try a different search'
            : 'Check into events or start chatting with people you meet'}
        </Text>
        {!searchQuery && (
          <ScalePress
            style={styles.emptyCta}
            onPress={() => router.push('/(tabs)/match' as any)}
            accessibilityRole="button"
            accessibilityLabel="Discover people"
          >
            <Text style={styles.emptyCtaText}>Discover People</Text>
          </ScalePress>
        )}
        {incomingRequests.length > 0 && (
          <View style={{ marginTop: 16 }}>
            <Text style={{ textAlign: 'center', color: '#E5E7EB', fontWeight: '600' }}>
              You have {incomingRequests.length} chat request(s)
            </Text>
          </View>
        )}
      </View>
    </FadeInUp>
  ), [incomingRequests.length, searchQuery])

  const isLoading = authLoading || loading
  const getItemKey = useCallback((item: UnifiedChatItem) => `${item.type}-${item.id}`, [])
  const handleListScroll = useCallback(
    (e: any) => {
      setScrollProgress(e.nativeEvent.contentOffset.y, 240)
    },
    [setScrollProgress]
  )

  const fabBottom = 44 + Math.max(insets.bottom, 6) + 16

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <StatusBar style="light" backgroundColor={APP_COLORS.backgroundBase} />

      <GlassSurface intensity={20} tint="rgba(15,14,14,0.8)" borderRadius={0} bordered={false}>
        <View style={[styles.headerRow, { paddingTop: insets.top + 8 }]} accessibilityRole="header">
          <View style={styles.headerLeft}>
            <TouchableOpacity
              onPress={comingSoon}
              hitSlop={HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel="Open menu"
            >
              <Ionicons name="menu" size={22} color={APP_COLORS.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>The Banter</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => searchInputRef.current?.focus()}
              hitSlop={HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel="Search conversations"
            >
              <Ionicons name="search" size={20} color={APP_COLORS.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={comingSoon}
              hitSlop={HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              style={styles.bellBtn}
            >
              <Ionicons name="notifications-outline" size={20} color={APP_COLORS.textPrimary} />
              <View style={styles.bellDot} />
            </TouchableOpacity>
          </View>
        </View>
      </GlassSurface>

      <RealtimeStatusBanner status={socketStatus} style={styles.socketBanner} />

      {isLoading ? (
        <View style={styles.listContainer}>
          {[...Array(8)].map((_, i) => (
            <View key={`sk-${i}`} style={styles.row}>
              <SkeletonCircle width={56} />
              <View style={styles.rowContent}>
                <View style={styles.rowHeader}>
                  <SkeletonLine width={'50%'} />
                  <SkeletonLine width={36} />
                </View>
                <SkeletonLine width={'75%'} style={{ marginTop: 8 }} />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          renderItem={renderChatItem}
          keyExtractor={getItemKey}
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          updateCellsBatchingPeriod={50}
          windowSize={8}
          removeClippedSubviews
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <>
              <View style={styles.searchBar}>
                <Ionicons name="search" size={18} color={APP_COLORS.textTertiary} />
                <TextInput
                  ref={searchInputRef}
                  style={styles.searchInput}
                  placeholder="Search conversations..."
                  placeholderTextColor="rgba(174,170,170,0.5)"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  returnKeyType="search"
                  autoCorrect={false}
                />
              </View>

              {pinnedItems.length > 0 && (
                <View style={styles.pinnedSection}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>Pinned</Text>
                    <Ionicons name="pin" size={14} color={APP_COLORS.textSecondary} />
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.pinnedRow}
                  >
                    {pinnedItems.map((item) => {
                      const name = itemName(item)
                      return (
                        <TouchableOpacity
                          key={`${item.type}-${item.id}`}
                          style={styles.pinnedItem}
                          onPress={() => handleItemPress(item)}
                          onLongPress={() => togglePin(item.id, item.type, name)}
                          delayLongPress={350}
                          accessibilityRole="button"
                          accessibilityLabel={`${name}, pinned. Long press to unpin.`}
                        >
                          {item.type === 'personal' ? (
                            item.data.other_user_avatar ? (
                              <Avatar source={item.data.other_user_avatar} size={64} ringColor={APP_COLORS.accent} ringWidth={2} />
                            ) : (
                              <View style={[styles.pinnedFallbackAvatar, { borderColor: APP_COLORS.accent }]}>
                                <Text style={styles.avatarInitials}>{getInitials(name)}</Text>
                              </View>
                            )
                          ) : (
                            <View style={styles.pinnedGroupWrap}>
                              {item.data.event_image ? (
                                <OptimizedImage
                                  source={item.data.event_image}
                                  style={styles.pinnedGroupImage as any}
                                  width={64}
                                  height={64}
                                  quality={60}
                                />
                              ) : (
                                <LinearGradient
                                  colors={APP_COLORS.accentGradient}
                                  start={{ x: 0, y: 0 }}
                                  end={{ x: 1, y: 1 }}
                                  style={styles.pinnedGroupImage}
                                >
                                  <Ionicons name="people" size={24} color={APP_COLORS.onAccent} />
                                </LinearGradient>
                              )}
                              <View style={styles.eventBadge}>
                                <Text style={styles.eventBadgeText}>EVENT</Text>
                              </View>
                            </View>
                          )}
                          <Text style={styles.pinnedName} numberOfLines={1}>{name}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </ScrollView>
                </View>
              )}

              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Recent</Text>
                {hasUnread && (
                  <TouchableOpacity onPress={handleMarkAllRead} accessibilityRole="button" accessibilityLabel="Mark all conversations as read">
                    <Text style={styles.markAllReadText}>Mark all read</Text>
                  </TouchableOpacity>
                )}
              </View>

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
                    )
                  })}
                </View>
              )}
            </>
          }
          ListEmptyComponent={renderEmptyState}
          contentContainerStyle={[
            styles.listContainer,
            filteredItems.length === 0 && styles.emptyListContainer,
          ]}
          onScroll={handleListScroll}
          scrollEventThrottle={16}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { bottom: fabBottom }]}
        onPress={comingSoon}
        accessibilityRole="button"
        accessibilityLabel="New message"
      >
        <LinearGradient
          colors={APP_COLORS.accentGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <Ionicons name="chatbubble-ellipses" size={22} color={APP_COLORS.onAccent} />
        </LinearGradient>
      </TouchableOpacity>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: APP_COLORS.backgroundBase,
  },
  socketBanner: {
    marginTop: 8,
    marginHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerTitle: {
    fontFamily: APP_FONTS.heading,
    color: APP_COLORS.accent,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  bellBtn: {
    position: 'relative',
  },
  bellDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: APP_COLORS.accentSecondary,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: APP_COLORS.backgroundCard,
    borderRadius: APP_RADIUS.pill,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 24,
  },
  searchInput: {
    flex: 1,
    color: APP_COLORS.textPrimary,
    fontSize: 16,
    fontFamily: APP_FONTS.body,
    padding: 0,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: APP_FONTS.heading,
    fontSize: 16,
    fontWeight: '700',
    color: APP_COLORS.textPrimary,
    letterSpacing: -0.4,
  },
  markAllReadText: {
    fontFamily: APP_FONTS.bodyBold,
    fontSize: 16,
    fontWeight: '700',
    color: APP_COLORS.accent,
  },
  pinnedSection: {
    marginBottom: 8,
  },
  pinnedRow: {
    gap: 24,
    paddingBottom: 8,
  },
  pinnedItem: {
    alignItems: 'center',
    gap: 8,
    width: 72,
  },
  pinnedFallbackAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    backgroundColor: APP_COLORS.backgroundCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinnedGroupWrap: {
    width: 64,
    height: 64,
  },
  pinnedGroupImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  eventBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: APP_COLORS.highlight,
    borderRadius: APP_RADIUS.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  eventBadgeText: {
    fontFamily: APP_FONTS.bodyBold,
    fontSize: 10,
    fontWeight: '700',
    color: '#570066',
  },
  pinnedName: {
    fontFamily: APP_FONTS.bodyMedium,
    fontSize: 14,
    fontWeight: '500',
    color: APP_COLORS.textPrimary,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 140,
  },
  emptyListContainer: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: APP_COLORS.separator,
  },
  rowFallbackAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: APP_COLORS.backgroundCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackUnreadDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: APP_COLORS.accent,
    borderWidth: 2,
    borderColor: APP_COLORS.backgroundBase,
  },
  avatarInitials: {
    fontSize: 18,
    fontWeight: '700',
    color: APP_COLORS.textPrimary,
  },
  rowContent: {
    flex: 1,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowName: {
    fontFamily: APP_FONTS.bodyBold,
    fontSize: 16,
    fontWeight: '700',
    color: APP_COLORS.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  rowNameUnread: {
    color: APP_COLORS.textPrimary,
  },
  rowTime: {
    fontFamily: APP_FONTS.body,
    fontSize: 11,
    color: APP_COLORS.textTertiary,
  },
  rowTimeUnread: {
    color: APP_COLORS.accent,
    fontFamily: APP_FONTS.bodyBold,
    fontWeight: '700',
  },
  rowPreview: {
    fontFamily: APP_FONTS.body,
    fontSize: 16,
    color: APP_COLORS.textSecondary,
    marginTop: 2,
  },
  rowPreviewUnread: {
    color: APP_COLORS.textPrimary,
    fontFamily: APP_FONTS.bodySemiBold,
    fontWeight: '600',
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
    marginBottom: 16,
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
  },
  emptyGlyph: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: APP_COLORS.backgroundElevated,
    borderWidth: 1,
    borderColor: APP_COLORS.separator,
    marginBottom: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: APP_COLORS.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    color: APP_COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
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
  fab: {
    position: 'absolute',
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  fabGradient: {
    flex: 1,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

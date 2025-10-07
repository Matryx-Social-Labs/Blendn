import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
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
import ModernChat from '../../components/ModernChat'
import OptimizedImage from '../../components/OptimizedImage'
import { SkeletonCircle, SkeletonLine } from '../../components/Skeleton'
import { useGradientOverlay } from '../../lib/gradientOverlay'
import { Logger } from '../../lib/logger'
import { callRpc, supabase } from '../../lib/supabase'
import { computeUnreadCounts, setConversationLastRead } from '../../lib/unread'
import { useAuth } from '../../lib/useAuth'

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

export default function Chat() {
  const insets = useSafeAreaInsets()
  const { user, loading: authLoading } = useAuth()
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<ChatTabType>('personal')
  const [incomingRequests, setIncomingRequests] = useState<MessageRequest[]>([])
  const [outgoingRequests, setOutgoingRequests] = useState<MessageRequest[]>([])
  const [groupChats, setGroupChats] = useState<GroupChat[]>([])
  const [personalChats, setPersonalChats] = useState<PersonalChat[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showModernChat, setShowModernChat] = useState(false)
  const { setScrollProgress } = useGradientOverlay()
  const latestLoadIdRef = useRef(0)
  const isLoadingRef = useRef(false)
  const { width, height } = useWindowDimensions()

  // Responsive sizing based on screen width (baseline ~390)
  const {
    avatarSize,
    storyRingSize,
    storyImageSize,
    unreadSize,
    rowPaddingV,
    segmentPaddingV,
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
    const segPad = clamp(12 * scale, 10, 18)
    const emptyPad = clamp(height * 0.12, 40, 100)
    const sItemWidth = clamp(60 * scale, 54, 72)
    return {
      avatarSize: avatar,
      storyRingSize: ring,
      storyImageSize: image,
      unreadSize: unread,
      rowPaddingV: rowPad,
      segmentPaddingV: segPad,
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
  }), [avatarSize, storyRingSize, storyImageSize, unreadSize, rowPaddingV, segmentPaddingV, emptyPadV, storyItemWidth])

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
    await loadChats()
    setRefreshing(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && user) {
        loadChats()
      }
      return () => {}
    }, [user, authLoading, activeTab])
  )

  // Load current user's avatar for header
  useEffect(() => {
    let mounted = true
    const run = async () => {
      try {
        if (!user) { setMyAvatarUrl(null); return }
        const { data, error } = await supabase
          .from('user_profiles')
          .select('profile_photos, photos')
          .eq('user_id', user.id)
          .maybeSingle()
        if (mounted) {
          if (error) {
            Logger.warn('chat', 'header avatar fetch failed', { error })
            setMyAvatarUrl(null)
          } else {
            const primary = Array.isArray(data?.profile_photos) && data.profile_photos.length > 0
              ? data.profile_photos[0]
              : (Array.isArray(data?.photos) && data.photos.length > 0 ? data.photos[0] : null)
            setMyAvatarUrl(primary || null)
          }
        }
      } catch (e) {
        if (mounted) setMyAvatarUrl(null)
      }
    }
    run()
    return () => { mounted = false }
  }, [user])

  // Realtime: update personal chat list when new private_messages arrive
  useEffect(() => {
    if (!user || activeTab !== 'personal') return
    const channel = supabase
      .channel(`personal_chats_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'private_messages' },
        (payload: any) => {
          const row = payload.new
          if (!row?.conversation_id) return
          setPersonalChats(prev => {
            const idx = prev.findIndex(c => c.conversation_id === row.conversation_id)
            const updatedTime = row.created_at
            let next = [...prev]
            if (idx >= 0) {
              const item = next[idx]
              const updated = {
                ...item,
                last_message: row.message_text,
                last_message_time: updatedTime,
                // increment unread only if message is from the other user
                unread_count: row.sender_id && user?.id && row.sender_id !== user.id
                  ? (item.unread_count || 0) + 1
                  : item.unread_count,
              }
              next.splice(idx, 1)
              next = [updated, ...next]
            } else {
              // If conversation is not present, refresh the list to auto-add
              loadPersonalChats(latestLoadIdRef.current).catch(() => {})
            }
            return next
          })
        }
      )
      .subscribe()

    return () => {
      try { supabase.removeChannel(channel) } catch {}
    }
  }, [user, activeTab])

  const loadChats = async () => {
    if (!user) return

    const loadId = ++latestLoadIdRef.current
    try {
      isLoadingRef.current = true
      setLoading(true)
      Logger.debug('chat', `Loading chats for tab: ${activeTab}`)
      
      if (activeTab === 'group') {
        await loadGroupChats(loadId)
      } else {
        await loadPersonalChats(loadId)
      }
      await loadMessageRequests(loadId)
      
    } catch (error) {
      Logger.error('chat', 'Error loading chats', { error })
    } finally {
      if (latestLoadIdRef.current === loadId) {
        setLoading(false)
        isLoadingRef.current = false
      }
    }
  }

  const loadMessageRequests = async (loadId?: number) => {
    try {
      const [inc, out] = await Promise.all([
        callRpc('get_incoming_message_requests', { p_user_id: user.id }),
        callRpc('get_outgoing_message_requests', { p_user_id: user.id }),
      ])
      if (loadId === undefined || latestLoadIdRef.current === loadId) {
        setIncomingRequests(Array.isArray(inc.data) ? inc.data as MessageRequest[] : [])
        setOutgoingRequests(Array.isArray(out.data) ? out.data as MessageRequest[] : [])
      }
    } catch (e) {
      Logger.error('chat', 'loadMessageRequests failed', { error: e })
    }
  }

  const loadGroupChats = async (loadId?: number) => {
    try {
      Logger.debug('chat', 'Fetching group chats...')
      
      // Get user's chat participants first (they can only see their own)
      const { data: userParticipations, error: participantError } = await supabase
        .from('chat_participants')
        .select('chat_room_id')
        .eq('user_id', user.id)

      if (participantError) {
        Logger.error('chat', 'Error fetching user participations', { error: participantError })
        if (loadId === undefined || latestLoadIdRef.current === loadId) setGroupChats([])
        return
      }

      if (!userParticipations || userParticipations.length === 0) {
        if (loadId === undefined || latestLoadIdRef.current === loadId) setGroupChats([])
        return
      }

      // Get chat room details for each participation
      const chatRoomIds = userParticipations.map(p => p.chat_room_id)
       const { data: chatRooms, error: roomError } = await supabase
         .from('chat_rooms')
         .select(`
           id,
           name,
           event_id,
           events (
             title,
             venue_name,
             cover_image_url
           )
         `)
        .in('id', chatRoomIds)

      if (roomError) {
        Logger.error('chat', 'Error fetching chat rooms', { error: roomError })
        if (loadId === undefined || latestLoadIdRef.current === loadId) setGroupChats([])
        return
      }

      // Compute participant counts in one batch
      const { data: counts, error: countError } = await supabase
        .from('chat_participants')
        .select('chat_room_id')
        .in('chat_room_id', chatRoomIds)
      if (countError) {
        Logger.warn('chat', 'Could not fetch participant counts', { error: countError })
      }
      const countMap = new Map<string, number>()
      ;(counts || []).forEach((row: any) => {
        const id = String(row.chat_room_id)
        countMap.set(id, (countMap.get(id) || 0) + 1)
      })

      // Fetch latest message per chat room
      const { data: lastMsgs } = await supabase
        .from('chat_messages')
        .select('chat_room_id, message_text, created_at, sender_id')
        .in('chat_room_id', chatRoomIds)
        .order('created_at', { ascending: false })
        .limit(Math.max(chatRoomIds.length * 2, 50))

      const lastByRoom: Record<string, { text: string, time: string }> = {}
      ;(lastMsgs || []).forEach((m: any) => {
        if (!lastByRoom[m.chat_room_id]) {
          lastByRoom[m.chat_room_id] = { text: m.message_text, time: m.created_at }
        }
      })

      // Transform the data to match our GroupChat interface
       const groupChatData: GroupChat[] = chatRooms?.map((room: any) => ({
        chat_room_id: room.id,
        event_id: room.event_id || '',
        event_title: room.events?.title || 'Unknown Event',
        event_venue: room.events?.venue_name || 'Unknown Venue',
        participant_count: countMap.get(String(room.id)) || 0,
        event_image: room.events?.cover_image_url || null,
        last_message: lastByRoom[String(room.id)]?.text,
        last_message_time: lastByRoom[String(room.id)]?.time,
         last_sender_name: undefined
      })) || []

      if (loadId === undefined || latestLoadIdRef.current === loadId) setGroupChats(groupChatData)
      Logger.info('chat', `Loaded ${groupChatData.length} group chats`)
    } catch (error) {
      Logger.error('chat', 'Error loading group chats', { error })
      setGroupChats([])
    }
  }

  const loadPersonalChats = async (loadId?: number) => {
    try {
      Logger.debug('chat', 'Fetching personal chats...')
      
      // Get only conversations where the current user is part of the match (server-side filter)
      const { data: conversations, error: conversationError } = await supabase
        .from('private_conversations')
        .select(`
          id,
          match_id,
          last_message_at,
          matches!inner (
            user1_id,
            user2_id
          )
        `)
        // Filter on the joined matches table so only the current user's conversations are returned
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`, { foreignTable: 'matches' })
        .order('last_message_at', { ascending: false })

      if (conversationError) {
        Logger.error('chat', 'Error fetching conversations', { error: conversationError })
        if (loadId === undefined || latestLoadIdRef.current === loadId) setPersonalChats([])
        return
      }

      // Build list of other user IDs, then batch fetch their profiles
      const conversationList = (conversations || []) as any[]
      const otherUserIdsSet = new Set<string>()
      const otherUserIdByConversationId: Record<string, string> = {}
      const conversationIds: string[] = []

      for (const conversation of conversationList) {
        const match = Array.isArray(conversation.matches) ? conversation.matches[0] : conversation.matches
        if (!match) continue

        const isUser1 = match.user1_id === user.id
        const otherUserId = isUser1 ? match.user2_id : match.user1_id
        if (otherUserId) {
          otherUserIdsSet.add(otherUserId)
          otherUserIdByConversationId[conversation.id] = otherUserId
        }
        if (conversation.id) {
          conversationIds.push(conversation.id)
        }
      }

      const otherUserIds = Array.from(otherUserIdsSet)

      // Fetch user profile display names and avatars
      let profilesById: Record<string, { user_id: string, display_name: string | null, avatar_url: string | null }> = {}
      if (otherUserIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('user_profiles')
          .select('user_id, display_name, profile_photos, photos')
          .in('user_id', otherUserIds)

        if (profilesError) {
          Logger.error('chat', 'Error fetching user_profiles', { error: profilesError })
        } else {
          profilesById = (profiles || []).reduce((acc: Record<string, { user_id: string, display_name: string | null, avatar_url: string | null }>, p: any) => {
            // Prefer profile_photos first item, then photos first item if present
            const primaryPhoto = Array.isArray(p?.profile_photos) && p.profile_photos.length > 0
              ? p.profile_photos[0]
              : (Array.isArray(p?.photos) && p.photos.length > 0 ? p.photos[0] : null)
            acc[p.user_id] = {
              user_id: p.user_id,
              display_name: p.display_name ?? null,
              avatar_url: primaryPhoto,
            }
            return acc
          }, {})
        }
      }

      // Fetch the latest message for each conversation (for preview + time)
      let lastMessageByConversationId: Record<string, { text: string, time: string }> = {}
      if (conversationIds.length > 0) {
        const { data: msgs, error: msgErr } = await supabase
          .from('private_messages')
          .select('conversation_id, message_text, created_at')
          .in('conversation_id', conversationIds)
          .order('created_at', { ascending: false })
          .limit(Math.max(conversationIds.length * 2, 50))

        if (msgErr) {
          Logger.error('chat', 'Error fetching last messages', { error: msgErr })
        } else if (Array.isArray(msgs)) {
          for (const m of msgs as any[]) {
            if (!lastMessageByConversationId[m.conversation_id]) {
              lastMessageByConversationId[m.conversation_id] = {
                text: m.message_text,
                time: m.created_at,
              }
            }
          }
        }
      }

      const userConversations = conversationList.map((conversation: any) => {
        const otherUserId = otherUserIdByConversationId[conversation.id]
        const otherUserProfile = otherUserId ? profilesById[otherUserId] : undefined
        const lastMeta = lastMessageByConversationId[conversation.id]

        return {
          conversation_id: conversation.id,
          other_user_id: otherUserId,
          other_user_name: otherUserProfile?.display_name || 'User',
          other_user_avatar: otherUserProfile?.avatar_url || null,
          last_message: lastMeta?.text,
          last_message_time: lastMeta?.time || conversation.last_message_at,
          unread_count: 0,
        } as PersonalChat
      })

      try {
        const counts = await computeUnreadCounts(conversationIds)
        const withUnread = userConversations.map(c => ({
          ...c,
          unread_count: counts[c.conversation_id] || 0,
        }))
        if (loadId === undefined || latestLoadIdRef.current === loadId) setPersonalChats(withUnread)
      } catch {
        if (loadId === undefined || latestLoadIdRef.current === loadId) setPersonalChats(userConversations)
      }
      Logger.info('chat', `Loaded ${userConversations.length} personal chats`)
    } catch (error) {
      Logger.error('chat', 'Error loading personal chats', { error })
      setPersonalChats([])
    }
  }

  

  const renderGroupChatItem = useCallback(({ item }: { item: GroupChat }) => (
    <TouchableOpacity 
      style={[styles.personalItem, dynamicStyles.personalItem]} 
      onPress={() => handleGroupChatPress(item)}
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
            {item.last_message || 'Say hi 👋'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  ), [handleGroupChatPress])

  const renderPersonalChatItem = useCallback(({ item }: { item: PersonalChat }) => {
    const unreadText = item.unread_count > 99 ? '99+' : String(item.unread_count)
    return (
    <TouchableOpacity 
      style={[styles.personalItem, dynamicStyles.personalItem]} 
      onPress={() => handlePersonalChatPress(item)}
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
            {item.last_message || 'Say hi 👋'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  )
  }, [handlePersonalChatPress])

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

  const renderEmptyState = () => (
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
      {incomingRequests.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ textAlign: 'center', color: '#333', fontWeight: '600' }}>You have {incomingRequests.length} chat request(s)</Text>
        </View>
      )}
    </View>
  )

  const isLoading = authLoading || loading

  // Show modern chat demo if toggled
  if (showModernChat) {
    return (
      <ModernChat
        groupName="Bobs Chat Room"
        participantCount={5}
        onBack={() => setShowModernChat(false)}
        onSettings={() => alert('Settings pressed!')}
      />
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      {/* Header gradient + stories */}
      <View style={[styles.headerGradient, { paddingTop: insets.top }]}>
        <LinearGradient
          colors={["#480D37", "#000000"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Custom header row to mirror Figma (title only, no avatar) */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>The Banter</Text>
          </View>
          <TouchableOpacity style={styles.headerRight} onPress={() => router.push('/edit-profile')}
            accessibilityRole="button" accessibilityLabel="Edit profile">
            <Ionicons name="pencil" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

      <View style={styles.storiesCard}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.storiesRow}
          >
            {(personalChats.slice(0, 10)).map((c, idx) => (
              <View key={c.conversation_id ?? idx} style={[styles.storyItem, dynamicStyles.storyItem, idx !== personalChats.slice(0, 10).length - 1 && styles.storyItemSpacing]}>
                <LinearGradient
                  colors={["#FFD36E", "#FF5BA6"]}
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
      </View>

      {/* Segmented control */}
      <View style={styles.segmentContainer}>
        <View style={styles.segmentPill}>
          {/* Glass background */}
          <BlurView intensity={30} tint="dark" style={styles.segmentGlassBlur} />
          <View pointerEvents="none" style={styles.segmentTint} />
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
            <Text style={[styles.segmentText, activeTab === 'group' && styles.segmentTextActive]}>Go Anonymous</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Chat List */}
      {activeTab === 'group' ? (
        isLoading ? (
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
          <FlatList
            data={groupChats}
            renderItem={renderGroupChatItem}
            keyExtractor={(item) => item.chat_room_id}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={10}
            removeClippedSubviews
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            ListEmptyComponent={renderEmptyState}
            contentContainerStyle={[
              styles.listContainer,
              groupChats.length === 0 && styles.emptyListContainer
            ]}
            onScroll={(e) => setScrollProgress(e.nativeEvent.contentOffset.y, 240)}
            scrollEventThrottle={16}
          />
        )
      ) : (
        isLoading ? (
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
                {incomingRequests.map((r) => (
                  <View key={r.request_id} style={styles.requestItem}>
                    <Text style={styles.requestSender}>{r.sender_name || 'User'}</Text>
                    {!!r.initial_message && (
                      <Text style={styles.requestMessage} numberOfLines={1}>{r.initial_message}</Text>
                    )}
                    <View style={styles.requestActions}>
                      <TouchableOpacity style={[styles.reqBtn, styles.reject]} onPress={async () => {
                        try { await callRpc('respond_message_request', { p_request_id: r.request_id, p_user_id: user.id, p_action: 'reject' }); loadChats() } catch {}
                      }}>
                        <Text style={styles.reqBtnText}>Reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.reqBtn, styles.reqBtnSpacing, styles.accept]} onPress={async () => {
                        try {
                          const { data } = await callRpc('respond_message_request', { p_request_id: r.request_id, p_user_id: user.id, p_action: 'accept' })
                          const res = Array.isArray(data) ? data[0] : data
                          loadChats()
                          if (res?.success && res.conversation_id) {
                            const nameParam = `?otherUserName=${encodeURIComponent(r.sender_name || 'User')}`
                            router.push(`/private-chat/${res.conversation_id}${nameParam}`)
                          }
                        } catch {}
                      }}>
                        <Text style={styles.reqBtnText}>Accept</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
            <FlatList
              data={personalChats}
              renderItem={renderPersonalChatItem}
              keyExtractor={(item) => item.conversation_id}
              initialNumToRender={12}
              maxToRenderPerBatch={10}
              windowSize={12}
              removeClippedSubviews
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
              ListEmptyComponent={renderEmptyState}
              contentContainerStyle={[
                styles.listContainer,
                personalChats.length === 0 && styles.emptyListContainer
              ]}
              onScroll={(e) => setScrollProgress(e.nativeEvent.contentOffset.y, 240)}
              scrollEventThrottle={16}
            />
          </>
        )
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  headerGradient: {
  },
  
  storiesCard: {
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.04)'
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
    backgroundColor: '#2b2b2b',
  },
  storyLabel: {
    marginTop: 6,
    fontSize: 14,
    color: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
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
  segmentPill: {
    flexDirection: 'row',
    borderRadius: 26,
    overflow: 'hidden',
    height: 52,
    position: 'relative',
    paddingHorizontal: 6,
    paddingVertical: 0,
    alignItems: 'center',
  },
  segmentGlassBlur: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 26,
  },
  segmentTint: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 26,
    backgroundColor: 'rgba(118,118,128,0.32)',
  },
  // no stroke for borderless look
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 22,
  },
  segmentActive: {
    backgroundColor: '#480D37',
    borderRadius: 22,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
  },
  segmentTextActive: {
    color: '#FFFFFF',
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
    backgroundColor: '#2b2b2b',
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
    color: '#DADADA',
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
    color: '#FFFFFF',
    flex: 1,
    marginRight: 8,
  },
  personalTime: {
    fontSize: 12,
    color: '#797C7B',
  },
  personalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  personalPreview: {
    fontSize: 12,
    color: '#797C7B',
    flex: 1,
    marginRight: 8,
  },
  unreadDot: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: '#E94B59',
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
    color: '#FFFFFF',
    flex: 1,
  },
  participantCount: {
    fontSize: 14,
    color: '#C9C9C9',
  },
  unreadBadge: {
    backgroundColor: '#E94B59',
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
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)'
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
  reqBtnSpacing: { marginLeft: 10 },
  requestsContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  requestsTitle: {
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  requestSender: {
    fontWeight: '600',
    color: '#333',
  },
  requestMessage: {
    color: '#666',
    marginTop: 4,
  },
  accept: { backgroundColor: '#4CAF50' },
  reject: { backgroundColor: '#FF6B6B' },
  reqBtnText: { color: '#fff', fontWeight: '700' },
  chatVenue: {
    fontSize: 14,
    color: '#C9C9C9',
    marginBottom: 8,
  },
  lastMessageContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  lastMessage: {
    fontSize: 14,
    color: '#C9C9C9',
    flex: 1,
    marginRight: 8,
  },
  lastMessageTime: {
    fontSize: 12,
    color: '#B5B5B5',
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
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#C9C9C9',
    textAlign: 'center',
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
    color: '#FFFFFF',
  },
  headerRight: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
}) 
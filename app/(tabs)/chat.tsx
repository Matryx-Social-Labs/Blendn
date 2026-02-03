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
import { apiClient } from '../../lib/apiClient'
import { useGradientOverlay } from '../../lib/gradientOverlay'
import { Logger } from '../../lib/logger'
import { computeUnreadCounts, setConversationLastRead } from '../../lib/unread'
import { useAuth } from '../../lib/useAuth'
import { subscribeToUserNotifications, PrivateMessageCallback } from '../../lib/socketClient'

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

  // Real-time message updates via Socket.io
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
          loadPersonalChats()
          return prev
        }

        // Update existing conversation
        const updated = [...prev]
        const isFromMe = data.message.senderId === user.id
        updated[idx] = {
          ...updated[idx],
          last_message: data.message.text || '[Media]',
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
      const result = await apiClient.getMessageRequests({ status: 'pending' })
      if (loadId !== undefined && latestLoadIdRef.current !== loadId) return

      if (result.success && result.data?.requests) {
        const requests = result.data.requests.map((r: any) => ({
          request_id: r.id,
          sender_name: r.sender?.name || null,
          initial_message: r.message || null,
        }))
        setIncomingRequests(requests)
        Logger.info('chat', 'Message requests loaded', { count: requests.length })
      } else {
        setIncomingRequests([])
      }
      // Note: outgoing requests would need a separate API call if needed
      setOutgoingRequests([])
    } catch (e) {
      Logger.error('chat', 'loadMessageRequests failed', { error: e })
      if (loadId === undefined || latestLoadIdRef.current === loadId) {
        setIncomingRequests([])
        setOutgoingRequests([])
      }
    }
  }

  const loadGroupChats = async (loadId?: number) => {
    try {
      Logger.debug('chat', 'Fetching group chats...')

      // Use API to get chat groups
      const result = await apiClient.getChatGroups()

      if (!result.success || !result.data) {
        Logger.error('chat', 'Error fetching group chats', { error: result.error })
        if (loadId === undefined || latestLoadIdRef.current === loadId) setGroupChats([])
        return
      }

      // Transform API response to GroupChat interface
      const groupChatData: GroupChat[] = (result.data || []).map((room: any) => ({
        chat_room_id: room.id,
        event_id: room.event_id || room.eventId || '',
        event_title: room.event?.title || room.name || 'Unknown Event',
        event_venue: room.event?.venue_name || room.event?.venueName || 'Unknown Venue',
        participant_count: room.participant_count || room.participantCount || 0,
        event_image: room.event?.cover_image_url || room.event?.coverImageUrl || null,
        last_message: room.last_message?.text || room.lastMessage?.text,
        last_message_time: room.last_message?.created_at || room.lastMessage?.createdAt,
        last_sender_name: undefined
      }))

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

      const result = await apiClient.getConversations()

      if (loadId !== undefined && latestLoadIdRef.current !== loadId) return

      if (result.success && result.data) {
        // Compute unread counts
        const unreadMap = await computeUnreadCounts(
          result.data.map((c: any) => c.id)
        )

        const personalChatData: PersonalChat[] = result.data.map((conv: any) => ({
          conversation_id: conv.id,
          other_user_name: conv.otherUser?.name || 'Unknown',
          other_user_id: conv.otherUser?.id || '',
          other_user_avatar: conv.otherUser?.image || null,
          last_message: conv.lastMessage?.text || undefined,
          last_message_time: conv.lastMessage?.createdAt || conv.updatedAt,
          unread_count: unreadMap[conv.id] || conv.unreadCount || 0,
        }))

        setPersonalChats(personalChatData)
        Logger.info('chat', `Loaded ${personalChatData.length} personal chats`)
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
                        try {
                          const result = await apiClient.respondToMessageRequest(r.request_id, 'decline')
                          if (result.success) {
                            Logger.info('chat', 'Message request declined', { requestId: r.request_id })
                          } else {
                            Logger.error('chat', 'Failed to decline request', { error: result.error })
                          }
                        } catch (e) {
                          Logger.error('chat', 'Error declining request', { error: e })
                        }
                        loadChats()
                      }}>
                        <Text style={styles.reqBtnText}>Reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.reqBtn, styles.reqBtnSpacing, styles.accept]} onPress={async () => {
                        try {
                          const result = await apiClient.respondToMessageRequest(r.request_id, 'accept')
                          if (result.success) {
                            Logger.info('chat', 'Message request accepted', { requestId: r.request_id, conversationId: result.data?.conversationId })
                            // If a conversation was created, navigate to it
                            if (result.data?.conversationId) {
                              router.push({
                                pathname: '/private-chat/[conversationId]',
                                params: { conversationId: result.data.conversationId } as any,
                              })
                            }
                          } else {
                            Logger.error('chat', 'Failed to accept request', { error: result.error })
                          }
                        } catch (e) {
                          Logger.error('chat', 'Error accepting request', { error: e })
                        }
                        loadChats()
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
              initialNumToRender={8}
              maxToRenderPerBatch={5}
              windowSize={7}
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
              scrollEventThrottle={32}
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

import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import {
    FlatList,
    Image,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppHeader from '../../components/AppHeader'
import { useGradientOverlay } from '../../lib/gradientOverlay'
import { Logger } from '../../lib/logger'
import { callRpc, supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'

interface GroupChat {
  chat_room_id: string
  event_id: string
  event_title: string
  event_venue: string
  participant_count: number
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

type ChatTabType = 'group' | 'personal'

export default function Chat() {
  const { user, loading: authLoading } = useAuth()
  const [activeTab, setActiveTab] = useState<ChatTabType>('personal')
  const [incomingRequests, setIncomingRequests] = useState<any[]>([])
  const [outgoingRequests, setOutgoingRequests] = useState<any[]>([])
  const [groupChats, setGroupChats] = useState<GroupChat[]>([])
  const [personalChats, setPersonalChats] = useState<PersonalChat[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const { setScrollProgress } = useGradientOverlay()

  // Memoized callbacks to prevent re-creation
  const handleGroupChatPress = useCallback((chat: GroupChat) => {
    const query = `?roomName=${encodeURIComponent(chat.event_title)}&eventTitle=${encodeURIComponent(chat.event_title)}`
    router.push(`/chat/${chat.chat_room_id}${query}`)
  }, [])

  const handlePersonalChatPress = useCallback((chat: PersonalChat) => {
    router.push(`/private-chat/${chat.conversation_id}`)
  }, [])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadChats()
    setRefreshing(false)
  }, [])

  const onScroll = useCallback((e: any) => {
    setScrollProgress(e.nativeEvent.contentOffset.y, 320)
  }, [setScrollProgress])

  useEffect(() => {
    if (!authLoading && user) {
      loadChats()
    }
  }, [user, authLoading, activeTab])

  const loadChats = async () => {
    if (!user) return

    try {
      setLoading(true)
      Logger.debug('chat', `Loading chats for tab: ${activeTab}`)
      
      if (activeTab === 'group') {
        await loadGroupChats()
      } else {
        await loadPersonalChats()
      }
      await loadMessageRequests()
      
    } catch (error) {
      Logger.error('chat', 'Error loading chats', { error })
    } finally {
      setLoading(false)
    }
  }

  const loadMessageRequests = async () => {
    try {
      const [inc, out] = await Promise.all([
        callRpc('get_incoming_message_requests', { p_user_id: user.id }),
        callRpc('get_outgoing_message_requests', { p_user_id: user.id }),
      ])
      setIncomingRequests(Array.isArray(inc.data) ? inc.data : [])
      setOutgoingRequests(Array.isArray(out.data) ? out.data : [])
    } catch (e) {
      Logger.error('chat', 'loadMessageRequests failed', { error: e })
    }
  }

  const loadGroupChats = async () => {
    try {
      Logger.debug('chat', 'Fetching group chats...')
      
      // Get user's chat participants first (they can only see their own)
      const { data: userParticipations, error: participantError } = await supabase
        .from('chat_participants')
        .select('chat_room_id')
        .eq('user_id', user.id)

      if (participantError) {
        Logger.error('chat', 'Error fetching user participations', { error: participantError })
        setGroupChats([])
        return
      }

      if (!userParticipations || userParticipations.length === 0) {
        console.log('📭 [CHAT] No group chats found')
        setGroupChats([])
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
             venue_name
           )
         `)
        .in('id', chatRoomIds)

      if (roomError) {
        Logger.error('chat', 'Error fetching chat rooms', { error: roomError })
        setGroupChats([])
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

      // Transform the data to match our GroupChat interface
       const groupChatData: GroupChat[] = chatRooms?.map((room: any) => ({
        chat_room_id: room.id,
        event_id: room.event_id || '',
         event_title: room.events?.title || 'Unknown Event',
        event_venue: room.events?.venue_name || 'Unknown Venue',
        participant_count: countMap.get(String(room.id)) || 0,
        last_message: undefined,
        last_message_time: undefined,
         last_sender_name: undefined
      })) || []

      setGroupChats(groupChatData)
      Logger.info('chat', `Loaded ${groupChatData.length} group chats`)
    } catch (error) {
      Logger.error('chat', 'Error loading group chats', { error })
      setGroupChats([])
    }
  }

  const loadPersonalChats = async () => {
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
        setPersonalChats([])
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

      setPersonalChats(userConversations)
      Logger.info('chat', `Loaded ${userConversations.length} personal chats`)
    } catch (error) {
      Logger.error('chat', 'Error loading personal chats', { error })
      setPersonalChats([])
    }
  }

  

  const renderGroupChatItem = ({ item }: { item: GroupChat }) => (
    <TouchableOpacity 
      style={styles.chatItem} 
      onPress={() => handleGroupChatPress(item)}
    >
      <View style={styles.chatHeader}>
        <Text style={styles.chatTitle}>{item.event_title}</Text>
        <Text style={styles.participantCount}>👥 {item.participant_count}</Text>
      </View>
      <Text style={styles.chatVenue}>📍 {item.event_venue}</Text>
      {item.last_message && (
        <View style={styles.lastMessageContainer}>
          <Text style={styles.lastMessage} numberOfLines={2}>
            {item.last_sender_name}: {item.last_message}
          </Text>
          <Text style={styles.lastMessageTime}>
            {item.last_message_time ? new Date(item.last_message_time).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            }) : ''}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  )

  const renderPersonalChatItem = ({ item }: { item: PersonalChat }) => (
    <TouchableOpacity 
      style={styles.personalItem} 
      onPress={() => handlePersonalChatPress(item)}
    >
      {item.other_user_avatar ? (
        <Image source={{ uri: item.other_user_avatar }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarInitials}>{getInitials(item.other_user_name)}</Text>
        </View>
      )}
      <View style={styles.personalContent}>
        <View style={styles.personalHeader}>
          <Text style={styles.personalName} numberOfLines={1}>{item.other_user_name}</Text>
          <Text style={styles.personalTime}>
            {item.last_message_time ? formatRelativeTime(item.last_message_time) : ''}
          </Text>
        </View>
        <View style={styles.personalFooter}>
          <Text style={styles.personalPreview} numberOfLines={1}>
            {item.last_message || 'Say hi 👋'}
          </Text>
          {item.unread_count > 0 && (
            <View style={styles.unreadDot}>
              <Text style={styles.unreadDotText}>{item.unread_count}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  )

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
    <View style={styles.emptyContainer}>
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

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top', 'bottom']}>
        <Text style={styles.loadingText}>Loading chats...</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header gradient + stories */}
      <View style={styles.headerGradient}>
        <LinearGradient
          colors={["#3a0b2d", "#18041f"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <AppHeader title="The Banter" variant="darkTransparent" showBottomBorder={false} />

        <View style={styles.storiesCard}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.storiesRow}
          >
            {(personalChats.slice(0, 10)).map((c) => (
              <View key={c.conversation_id} style={styles.storyItem}>
                <LinearGradient
                  colors={["#FFD36E", "#FF5BA6"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.storyRing}
                >
                  {c.other_user_avatar ? (
                    <Image source={{ uri: c.other_user_avatar }} style={styles.storyImage} />
                  ) : (
                    <View style={[styles.storyImage, styles.avatarFallback]}>
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
          <TouchableOpacity
            onPress={() => setActiveTab('personal')}
            style={[styles.segmentItem, activeTab === 'personal' && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, activeTab === 'personal' && styles.segmentTextActive]}>Recent Chats</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab('group')}
            style={[styles.segmentItem, activeTab === 'group' && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, activeTab === 'group' && styles.segmentTextActive]}>Go Anonymous</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Chat List */}
      {activeTab === 'group' ? (
        <FlatList
          data={groupChats}
          renderItem={renderGroupChatItem}
          keyExtractor={(item) => item.chat_room_id}
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
      ) : (
        <>
          {incomingRequests.length > 0 && (
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <Text style={{ fontWeight: '700', color: '#333', marginBottom: 8 }}>Requests</Text>
              {incomingRequests.map((r) => (
                <View key={r.request_id} style={styles.requestItem}>
                  <Text style={{ fontWeight: '600', color: '#333' }}>{r.sender_name || 'User'}</Text>
                  {!!r.initial_message && (
                    <Text style={{ color: '#666', marginTop: 2 }} numberOfLines={1}>{r.initial_message}</Text>
                  )}
                  <View style={styles.requestActions}>
                    <TouchableOpacity style={[styles.reqBtn, styles.reject]} onPress={async () => {
                      try { await callRpc('respond_message_request', { p_request_id: r.request_id, p_user_id: user.id, p_action: 'reject' }); loadChats() } catch {}
                    }}>
                      <Text style={styles.reqBtnText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.reqBtn, styles.accept]} onPress={async () => {
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
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  headerGradient: {
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  
  storiesCard: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.04)'
  },
  storiesRow: {
    gap: 18,
    paddingHorizontal: 2,
  },
  storyItem: {
    width: 60,
    alignItems: 'center',
  },
  storyRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
  },
  storyImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#2b2b2b',
  },
  storyLabel: {
    marginTop: 6,
    fontSize: 12,
    color: '#EDEDED',
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
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.20)',
    overflow: 'hidden',
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#CFCFCF',
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
    paddingHorizontal: 4,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 6,
  },
  chatItem: {
    backgroundColor: 'transparent',
    paddingHorizontal: 4,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 6,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
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
  personalName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
    marginRight: 8,
  },
  personalTime: {
    fontSize: 12,
    color: '#B5B5B5',
  },
  personalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  personalPreview: {
    fontSize: 14,
    color: '#C9C9C9',
    flex: 1,
    marginRight: 8,
  },
  unreadDot: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    backgroundColor: '#E94B59',
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: 10,
    marginTop: 10,
  },
  reqBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
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
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
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
}) 
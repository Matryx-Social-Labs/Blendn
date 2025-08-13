import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
    FlatList,
    Image,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useGradientOverlay } from '../../lib/gradientOverlay'
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
  const [activeTab, setActiveTab] = useState<ChatTabType>('group')
  const [incomingRequests, setIncomingRequests] = useState<any[]>([])
  const [outgoingRequests, setOutgoingRequests] = useState<any[]>([])
  const [groupChats, setGroupChats] = useState<GroupChat[]>([])
  const [personalChats, setPersonalChats] = useState<PersonalChat[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const { setScrollProgress } = useGradientOverlay()

  useEffect(() => {
    if (!authLoading && user) {
      loadChats()
    }
  }, [user, authLoading, activeTab])

  const loadChats = async () => {
    if (!user) return

    try {
      setLoading(true)
      console.log('🔍 [CHAT] Loading chats for tab:', activeTab);
      
      if (activeTab === 'group') {
        await loadGroupChats()
      } else {
        await loadPersonalChats()
      }
      await loadMessageRequests()
      
    } catch (error) {
      console.error('💥 [CHAT] Error loading chats:', error)
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
      console.error('[CHAT] loadMessageRequests failed:', e)
    }
  }

  const loadGroupChats = async () => {
    try {
      console.log('🔍 [CHAT] Fetching group chats...')
      
      // Get user's chat participants first (they can only see their own)
      const { data: userParticipations, error: participantError } = await supabase
        .from('chat_participants')
        .select('chat_room_id')
        .eq('user_id', user.id)

      if (participantError) {
        console.error('❌ [CHAT] Error fetching user participations:', participantError)
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
        console.error('❌ [CHAT] Error fetching chat rooms:', roomError)
        setGroupChats([])
        return
      }

      // Compute participant counts in one batch
      const { data: counts, error: countError } = await supabase
        .from('chat_participants')
        .select('chat_room_id')
        .in('chat_room_id', chatRoomIds)
      if (countError) {
        console.warn('⚠️ [CHAT] Could not fetch participant counts:', countError)
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
      console.log(`✅ [CHAT] Loaded ${groupChatData.length} group chats`)
    } catch (error) {
      console.error('💥 [CHAT] Error loading group chats:', error)
      setGroupChats([])
    }
  }

  const loadPersonalChats = async () => {
    try {
      console.log('🔍 [CHAT] Fetching personal chats...')
      
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
        console.error('❌ [CHAT] Error fetching conversations:', conversationError)
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
          console.error('❌ [CHAT] Error fetching user_profiles:', profilesError)
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
          console.error('❌ [CHAT] Error fetching last messages:', msgErr)
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
      console.log(`✅ [CHAT] Loaded ${userConversations.length} personal chats`)
    } catch (error) {
      console.error('💥 [CHAT] Error loading personal chats:', error)
      setPersonalChats([])
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await loadChats()
    setRefreshing(false)
  }

  const handleGroupChatPress = (chat: GroupChat) => {
    const query = `?roomName=${encodeURIComponent(chat.event_title)}&eventTitle=${encodeURIComponent(chat.event_title)}`
    router.push(`/chat/${chat.chat_room_id}${query}`)
  }

  const handlePersonalChatPress = (chat: PersonalChat) => {
    const q = `?otherUserName=${encodeURIComponent(chat.other_user_name || '')}&otherUserId=${encodeURIComponent(chat.other_user_id || '')}`
    router.push(`/private-chat/${chat.conversation_id}${q}`)
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
      {/* Tab Switcher */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'group' && styles.activeTab]}
          onPress={() => setActiveTab('group')}
        >
          <Text style={[styles.tabText, activeTab === 'group' && styles.activeTabText]}>
            Group Chats
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'personal' && styles.activeTab]}
          onPress={() => setActiveTab('personal')}
        >
          <Text style={[styles.tabText, activeTab === 'personal' && styles.activeTabText]}>
            Personal
          </Text>
        </TouchableOpacity>
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
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  activeTabText: {
    color: '#007AFF',
  },
  listContainer: {
    padding: 16,
  },
  emptyListContainer: {
    flex: 1,
  },
  personalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  chatItem: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 12,
    backgroundColor: '#f1f1f1',
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#eee',
  },
  avatarInitials: {
    fontSize: 18,
    fontWeight: '700',
    color: '#555',
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
    color: '#222',
    flex: 1,
    marginRight: 8,
  },
  personalTime: {
    fontSize: 12,
    color: '#999',
  },
  personalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  personalPreview: {
    fontSize: 14,
    color: '#666',
    flex: 1,
    marginRight: 8,
  },
  unreadDot: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    backgroundColor: '#F7B500',
    borderRadius: 10,
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
    color: '#333',
    flex: 1,
  },
  participantCount: {
    fontSize: 14,
    color: '#666',
  },
  unreadBadge: {
    backgroundColor: '#007AFF',
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
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
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
    color: '#666',
    marginBottom: 8,
  },
  lastMessageContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  lastMessage: {
    fontSize: 14,
    color: '#888',
    flex: 1,
    marginRight: 8,
  },
  lastMessageTime: {
    fontSize: 12,
    color: '#999',
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
    color: '#333',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
}) 
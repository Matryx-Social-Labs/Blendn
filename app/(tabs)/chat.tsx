import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
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

  useEffect(() => {
    if (!authLoading && user) {
      loadChats()
    } else if (!authLoading && !user) {
      router.replace('/')
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
        supabase.rpc('get_incoming_message_requests', { p_user_id: user.id }),
        supabase.rpc('get_outgoing_message_requests', { p_user_id: user.id }),
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

      // Transform the data to match our GroupChat interface
       const groupChatData: GroupChat[] = chatRooms?.map((room: any) => ({
        chat_room_id: room.id,
        event_id: room.event_id || '',
         event_title: room.events?.title || 'Unknown Event',
        event_venue: room.events?.venue_name || 'Unknown Venue',
        participant_count: 0, // We'll skip this for now to avoid extra queries
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

      for (const conversation of conversationList) {
        const match = Array.isArray(conversation.matches) ? conversation.matches[0] : conversation.matches
        if (!match) continue

        const isUser1 = match.user1_id === user.id
        const otherUserId = isUser1 ? match.user2_id : match.user1_id
        if (otherUserId) {
          otherUserIdsSet.add(otherUserId)
          otherUserIdByConversationId[conversation.id] = otherUserId
        }
      }

      const otherUserIds = Array.from(otherUserIdsSet)

      let profilesById: Record<string, { id: string, name: string | null }> = {}
      if (otherUserIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', otherUserIds)

        if (profilesError) {
          console.error('❌ [CHAT] Error fetching profiles:', profilesError)
        } else {
          profilesById = (profiles || []).reduce((acc: Record<string, { id: string, name: string | null }>, p: any) => {
            acc[p.id] = { id: p.id, name: p.name ?? null }
            return acc
          }, {})
        }
      }

      const userConversations = conversationList.map((conversation: any) => {
        const otherUserId = otherUserIdByConversationId[conversation.id]
        const otherUserProfile = otherUserId ? profilesById[otherUserId] : undefined

        return {
          conversation_id: conversation.id,
          other_user_id: otherUserId,
          other_user_name: otherUserProfile?.name || 'Unknown User',
          last_message: undefined,
          last_message_time: conversation.last_message_at,
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
    router.push(`/private-chat/${chat.conversation_id}`)
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
      style={styles.chatItem} 
      onPress={() => handlePersonalChatPress(item)}
    >
      <View style={styles.chatHeader}>
        <Text style={styles.chatTitle}>{item.other_user_name}</Text>
        {item.unread_count > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadCount}>{item.unread_count}</Text>
          </View>
        )}
      </View>
      {item.last_message && (
        <View style={styles.lastMessageContainer}>
          <Text style={styles.lastMessage} numberOfLines={2}>
            {item.last_message}
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
                      try { await supabase.rpc('respond_message_request', { p_request_id: r.request_id, p_user_id: user.id, p_action: 'reject' }); loadChats() } catch {}
                    }}>
                      <Text style={styles.reqBtnText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.reqBtn, styles.accept]} onPress={async () => {
                      try {
                        const { data } = await supabase.rpc('respond_message_request', { p_request_id: r.request_id, p_user_id: user.id, p_action: 'accept' })
                        const res = Array.isArray(data) ? data[0] : data
                        loadChats()
                        if (res?.success && res.conversation_id) {
                          router.push(`/private-chat/${res.conversation_id}`)
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
          />
        </>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
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
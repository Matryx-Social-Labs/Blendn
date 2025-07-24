import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import { AuthHelper, supabase } from '../../lib/supabase'

interface GroupChat {
  chat_room_id: string
  room_name: string
  event_title: string
  event_id: string
  last_message: string | null
  last_message_time: string | null
  unread_count: number
  participant_count: number
}

interface PersonalChat {
  conversation_id: string
  other_user_name: string
  other_user_id: string
  last_message: string | null
  last_message_time: string | null
  unread_count: number
}

type ChatTabType = 'group' | 'personal'

export default function Chat() {
  const [activeTab, setActiveTab] = useState<ChatTabType>('group')
  const [groupChats, setGroupChats] = useState<GroupChat[]>([])
  const [personalChats, setPersonalChats] = useState<PersonalChat[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadChats()
  }, [activeTab])

  const loadChats = async () => {
    try {
      console.log('🔍 [CHAT] Starting loadChats...');
      console.log('🔍 [CHAT] Supabase client initialized:', !!supabase);
      
      console.log('🔍 [CHAT] Getting authenticated user...');
      const authStartTime = Date.now();
      
      // Try cached session first, fallback to network call if needed
      let user = AuthHelper.getCurrentUser()
      
      if (user) {
        console.log('✅ [CHAT] Using cached user session:', user.id);
        const authEndTime = Date.now();
        console.log(`🔍 [CHAT] Auth query completed in ${authEndTime - authStartTime}ms (cached)`);
      } else {
        console.log('⚠️ [CHAT] No cached session, falling back to network call...');
        const { data: { user: networkUser }, error } = await AuthHelper.getUserWithFallback(3000)
        const authEndTime = Date.now();
        console.log(`🔍 [CHAT] Auth query completed in ${authEndTime - authStartTime}ms (network)`);
        
        if (error) {
          console.error('❌ [CHAT] Auth error:', error);
          Alert.alert('Error', 'Unable to load chats. Please restart the app.')
          return
        }
        
        user = networkUser
      }
      
      if (!user) {
        console.error('❌ [CHAT] No authenticated user found');
        Alert.alert('Error', 'Please sign in to access chats')
        return
      }

      console.log('✅ [CHAT] Authenticated user found:', user.id);
      console.log('🔍 [CHAT] Loading both group and private chats...');
      
      // Load both types of chats concurrently
      const loadStartTime = Date.now();
      await Promise.all([
        loadGroupChats(user.id),
        loadPersonalChats(user.id)
      ])
      const loadEndTime = Date.now();
      console.log(`🔍 [CHAT] Both chat types loaded in ${loadEndTime - loadStartTime}ms`);
      
    } catch (error) {
      console.error('💥 [CHAT] Unexpected error in loadChats:', error);
      console.error('💥 [CHAT] Error type:', typeof error);
      console.error('💥 [CHAT] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      Alert.alert('Error', 'Failed to load chats')
    } finally {
      console.log('🏁 [CHAT] loadChats completed');
      setLoading(false)
    }
  }

  const loadGroupChats = async (userId: string) => {
    try {
      console.log('🔍 [GROUP_CHAT] Starting loadGroupChats...');
      console.log('🔍 [GROUP_CHAT] User ID:', userId);
      console.log('🔍 [GROUP_CHAT] Supabase client initialized:', !!supabase);
      
      console.log('🔍 [GROUP_CHAT] Calling RPC: get_user_event_chats');
      console.log('🔍 [GROUP_CHAT] Parameters:', { p_user_id: userId });
      
      const rpcStartTime = Date.now();
      
      // Add timeout wrapper to prevent infinite hanging
      const rpcPromise = supabase.rpc('get_user_event_chats', {
        p_user_id: userId
      })
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Group chats RPC timeout after 8000ms')), 8000)
      )
      
      const { data, error } = await Promise.race([rpcPromise, timeoutPromise]) as any

      const rpcEndTime = Date.now();
      console.log(`🔍 [GROUP_CHAT] RPC completed in ${rpcEndTime - rpcStartTime}ms`);

      if (error) {
        console.error('❌ [GROUP_CHAT] RPC error:', error);
        console.error('❌ [GROUP_CHAT] Error code:', error.code);
        console.error('❌ [GROUP_CHAT] Error message:', error.message);
        console.error('❌ [GROUP_CHAT] Error details:', error.details);
        console.log('🔄 [GROUP_CHAT] Setting empty group chats array');
        setGroupChats([]);
        return
      }

      console.log('✅ [GROUP_CHAT] SUCCESS: get_user_event_chats worked!');
      console.log('✅ [GROUP_CHAT] Raw group chats data:', data);
      console.log('✅ [GROUP_CHAT] Data type:', typeof data);
      console.log('✅ [GROUP_CHAT] Group chats count:', data?.length || 0);
      
      if (data && data.length > 0) {
        console.log('✅ [GROUP_CHAT] First group chat sample:', JSON.stringify(data[0], null, 2));
      }

      setGroupChats(data || [])
      console.log(`✅ [GROUP_CHAT] Successfully loaded ${data?.length || 0} group chats from database`);
    } catch (error) {
      console.error('💥 [GROUP_CHAT] Unexpected error:', error);
      console.error('💥 [GROUP_CHAT] Error type:', typeof error);
      console.error('💥 [GROUP_CHAT] Error message:', error instanceof Error ? error.message : 'Unknown error');
      console.log('🔄 [GROUP_CHAT] Setting empty group chats array due to error');
      setGroupChats([]);
    }
  }

  const loadPersonalChats = async (userId: string) => {
    try {
      console.log('🔍 [PRIVATE_CHAT] Starting loadPersonalChats...');
      console.log('🔍 [PRIVATE_CHAT] User ID:', userId);
      console.log('🔍 [PRIVATE_CHAT] Supabase client initialized:', !!supabase);
      
      console.log('🔍 [PRIVATE_CHAT] Calling RPC: get_user_private_conversations');
      console.log('🔍 [PRIVATE_CHAT] Parameters:', { p_user_id: userId });
      
      const rpcStartTime = Date.now();
      
      // Add timeout wrapper to prevent infinite hanging
      const rpcPromise = supabase.rpc('get_user_private_conversations', {
        p_user_id: userId
      })
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Private chats RPC timeout after 8000ms')), 8000)
      )
      
      const { data, error } = await Promise.race([rpcPromise, timeoutPromise]) as any

      const rpcEndTime = Date.now();
      console.log(`🔍 [PRIVATE_CHAT] RPC completed in ${rpcEndTime - rpcStartTime}ms`);

      if (error) {
        console.error('❌ [PRIVATE_CHAT] RPC error:', error);
        console.error('❌ [PRIVATE_CHAT] Error code:', error.code);
        console.error('❌ [PRIVATE_CHAT] Error message:', error.message);
        console.error('❌ [PRIVATE_CHAT] Error details:', error.details);
        console.log('🔄 [PRIVATE_CHAT] Setting empty private chats array');
        setPersonalChats([]);
        return
      }

      console.log('✅ [PRIVATE_CHAT] SUCCESS: get_user_private_conversations worked!');
      console.log('✅ [PRIVATE_CHAT] Raw private chats data:', data);
      console.log('✅ [PRIVATE_CHAT] Data type:', typeof data);
      console.log('✅ [PRIVATE_CHAT] Private chats count:', data?.length || 0);
      
      if (data && data.length > 0) {
        console.log('✅ [PRIVATE_CHAT] First private chat sample:', JSON.stringify(data[0], null, 2));
      }

      setPersonalChats(data || [])
      console.log(`✅ [PRIVATE_CHAT] Successfully loaded ${data?.length || 0} private chats from database`);
    } catch (error) {
      console.error('💥 [PRIVATE_CHAT] Unexpected error:', error);
      console.error('💥 [PRIVATE_CHAT] Error type:', typeof error);
      console.error('💥 [PRIVATE_CHAT] Error message:', error instanceof Error ? error.message : 'Unknown error');
      console.log('🔄 [PRIVATE_CHAT] Setting empty private chats array due to error');
      setPersonalChats([]);
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await loadChats()
    setRefreshing(false)
  }

  const formatTime = (timeString: string | null) => {
    if (!timeString) return ''
    
    const messageTime = new Date(timeString)
    const now = new Date()
    const diffMs = now.getTime() - messageTime.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'now'
    if (diffMins < 60) return `${diffMins}m`
    if (diffHours < 24) return `${diffHours}h`
    if (diffDays < 7) return `${diffDays}d`
    
    return messageTime.toLocaleDateString()
  }

  const renderSegmentedControl = () => (
    <View style={styles.segmentedControl}>
      <TouchableOpacity
        style={[
          styles.segmentButton,
          activeTab === 'group' && styles.activeSegmentButton
        ]}
        onPress={() => setActiveTab('group')}
      >
        <Text style={[
          styles.segmentText,
          activeTab === 'group' && styles.activeSegmentText
        ]}>
          Group
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.segmentButton,
          activeTab === 'personal' && styles.activeSegmentButton
        ]}
        onPress={() => setActiveTab('personal')}
      >
        <Text style={[
          styles.segmentText,
          activeTab === 'personal' && styles.activeSegmentText
        ]}>
          Personal
        </Text>
      </TouchableOpacity>
    </View>
  )

  const renderGroupChatItem = ({ item }: { item: GroupChat }) => (
    <TouchableOpacity
      style={styles.chatItem}
      onPress={() => {
        router.push({
          pathname: '/chat/[id]' as any,
          params: { 
            id: item.chat_room_id,
            roomName: item.room_name,
            eventTitle: item.event_title
          }
        })
      }}
    >
      <View style={styles.chatIcon}>
        <Ionicons name="people" size={24} color="#FF6B6B" />
      </View>
      
      <View style={styles.chatContent}>
        <View style={styles.chatHeader}>
          <Text style={styles.chatTitle} numberOfLines={1}>
            {item.event_title}
          </Text>
          <Text style={styles.chatTime}>
            {formatTime(item.last_message_time)}
          </Text>
        </View>
        
        <View style={styles.chatSubHeader}>
          <Text style={styles.chatSubtitle} numberOfLines={1}>
            {item.participant_count} participants
          </Text>
          {item.unread_count > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>
                {item.unread_count > 99 ? '99+' : item.unread_count}
              </Text>
            </View>
          )}
        </View>
        
        {item.last_message && (
          <Text style={styles.lastMessage} numberOfLines={2}>
            {item.last_message}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  )

  const renderPersonalChatItem = ({ item }: { item: PersonalChat }) => (
    <TouchableOpacity
      style={styles.chatItem}
      onPress={() => {
        router.push({
          pathname: '/private-chat/[conversationId]' as any,
          params: {
            conversationId: item.conversation_id,
            otherUserName: item.other_user_name,
            otherUserId: item.other_user_id
          }
        })
      }}
    >
      <View style={styles.chatIcon}>
        <Ionicons name="person" size={24} color="#FF6B6B" />
      </View>
      
      <View style={styles.chatContent}>
        <View style={styles.chatHeader}>
          <Text style={styles.chatTitle} numberOfLines={1}>
            {item.other_user_name}
          </Text>
          <Text style={styles.chatTime}>
            {formatTime(item.last_message_time)}
          </Text>
        </View>
        
        <View style={styles.chatSubHeader}>
          {item.unread_count > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>
                {item.unread_count > 99 ? '99+' : item.unread_count}
              </Text>
            </View>
          )}
        </View>
        
        {item.last_message && (
          <Text style={styles.lastMessage} numberOfLines={2}>
            {item.last_message}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  )

  const renderEmptyState = () => {
    const isGroupTab = activeTab === 'group'
    return (
      <View style={styles.emptyContainer}>
        <Ionicons 
          name={isGroupTab ? "people-outline" : "person-outline"} 
          size={64} 
          color="#ccc" 
        />
        <Text style={styles.emptyTitle}>
          {isGroupTab ? 'No Group Chats Yet' : 'No Personal Chats Yet'}
        </Text>
        <Text style={styles.emptyText}>
          {isGroupTab 
            ? 'Check in to events to join group chats and meet people!'
            : 'Match with someone to start a private conversation!'
          }
        </Text>
        <TouchableOpacity 
          style={styles.emptyButton}
          onPress={() => {
            if (isGroupTab) {
              router.push('/(tabs)/events' as any)
            } else {
              router.push('/(tabs)/match' as any)
            }
          }}
        >
          <Text style={styles.emptyButtonText}>
            {isGroupTab ? 'Browse Events' : 'Start Matching'}
          </Text>
        </TouchableOpacity>
      </View>
    )
  }

  const renderChatList = () => {
    if (activeTab === 'group') {
      return (
        <FlatList
          data={groupChats}
          keyExtractor={(item) => item.chat_room_id}
          renderItem={renderGroupChatItem}
          style={styles.chatList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
        />
      )
    } else {
      return (
        <FlatList
          data={personalChats}
          keyExtractor={(item) => item.conversation_id}
          renderItem={renderPersonalChatItem}
          style={styles.chatList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
        />
      )
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats 💬</Text>
        <Text style={styles.headerSubtitle}>
          {activeTab === 'group' ? 'Event group conversations' : 'Private messages'}
        </Text>
      </View>

      {renderSegmentedControl()}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B6B" />
          <Text style={styles.loadingText}>Loading chats...</Text>
        </View>
      ) : (
        renderChatList()
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#666',
  },
  segmentedControl: {
    flexDirection: 'row',
    margin: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeSegmentButton: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
  },
  activeSegmentText: {
    color: '#FF6B6B',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  chatList: {
    flex: 1,
  },
  chatItem: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  chatIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#f8f8f8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  chatContent: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    marginRight: 8,
  },
  chatTime: {
    fontSize: 12,
    color: '#999',
  },
  chatSubHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatSubtitle: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  unreadBadge: {
    backgroundColor: '#FF6B6B',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  lastMessage: {
    fontSize: 14,
    color: '#999',
    lineHeight: 18,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  emptyButton: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
}) 
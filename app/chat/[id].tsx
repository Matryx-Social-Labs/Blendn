import { router, useLocalSearchParams } from 'expo-router'
import React, { useEffect, useRef, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native'
import { AuthHelper, supabase } from '../../lib/supabase'

interface Message {
  message_id: string
  sender_id: string
  sender_name: string
  message_text: string
  message_type: string
  reply_to_message_id: string | null
  is_edited: boolean
  created_at: string
}

export default function GroupChat() {
  const { id: chatRoomId, roomName, eventTitle } = useLocalSearchParams()
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const flatListRef = useRef<FlatList>(null)

  useEffect(() => {
    if (chatRoomId) {
      getCurrentUser()
      loadMessages()
      subscribeToMessages()
    }
  }, [chatRoomId])

  const getCurrentUser = async () => {
    try {
      console.log('🔍 [CHAT_USER] Getting current user...');
      
      // Try cached session first
      let user = AuthHelper.getCurrentUser()
      
      if (user) {
        console.log('✅ [CHAT_USER] Using cached user session:', user.id);
      } else {
        console.log('⚠️ [CHAT_USER] No cached session, falling back to network call...');
        const { data: { user: networkUser }, error } = await AuthHelper.getUserWithFallback(3000)
        
        if (error) {
          console.error('❌ [CHAT_USER] Auth error:', error);
          return
        }
        
        user = networkUser
      }
      
      console.log('✅ [CHAT_USER] Current user:', user?.id);
      setCurrentUser(user)
    } catch (error) {
      console.error('❌ [CHAT_USER] Error getting current user:', error);
    }
  }

  const loadMessages = async () => {
    try {
      // Try cached session first, fallback to network call if needed
      let user = AuthHelper.getCurrentUser()
      
      if (user) {
        console.log('✅ [CHAT_MESSAGES] Using cached user session:', user.id);
      } else {
        console.log('⚠️ [CHAT_MESSAGES] No cached session, falling back to network call...');
        const { data: { user: networkUser }, error } = await AuthHelper.getUserWithFallback(3000)
        
        if (error) {
          console.error('❌ [CHAT_MESSAGES] Auth error:', error);
          Alert.alert('Error', 'Unable to load chat. Please restart the app.')
          return
        }
        
        user = networkUser
      }
      
      if (!user) return

      console.log('🔍 [CHAT_MESSAGES] Loading messages for room:', chatRoomId);
      console.log('🔍 [CHAT_MESSAGES] User ID:', user.id);

      // Skip participant check for now due to RLS recursion issue
      // TODO: Fix RLS policy in database
      console.log('⚠️ [CHAT_MESSAGES] Skipping participant check due to RLS policy issue');

      // Load messages directly (bypassing participant check temporarily)
      const { data, error } = await supabase
        .from('chat_messages')
        .select(`
          message_id,
          sender_id,
          message_text,
          message_type,
          reply_to_message_id,
          is_edited,
          created_at,
          profiles!inner(name)
        `)
        .eq('chat_room_id', chatRoomId)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) {
        console.error('❌ [CHAT_MESSAGES] Error loading messages:', error)
        
        // If this is an RLS policy error, show a more helpful message
        if (error.code === '42501' || error.message.includes('policy')) {
          Alert.alert('Chat Temporarily Unavailable', 'Chat access is temporarily restricted. Please try again later.')
        } else {
          Alert.alert('Error', 'Failed to load messages')
        }
      } else {
        console.log('✅ [CHAT_MESSAGES] Successfully loaded', data?.length || 0, 'messages');
        
        // Transform data to match the expected interface
        const messages = (data || []).map(msg => ({
          message_id: msg.message_id,
          sender_id: msg.sender_id,
          sender_name: (msg.profiles && msg.profiles.length > 0) ? msg.profiles[0].name : 'Unknown User',
          message_text: msg.message_text,
          message_type: msg.message_type || 'text',
          reply_to_message_id: msg.reply_to_message_id,
          is_edited: msg.is_edited || false,
          created_at: msg.created_at
        }));

        // Reverse to show oldest first
        setMessages(messages.reverse())
        setTimeout(() => scrollToBottom(), 100)
      }
    } catch (error) {
      console.error('💥 [CHAT_MESSAGES] Unexpected error:', error)
      Alert.alert('Error', 'Unable to load chat. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const subscribeToMessages = () => {
    console.log('🔍 [REALTIME] Setting up real-time subscription for room:', chatRoomId);
    
    // Subscribe to real-time message updates
    const channel = supabase
      .channel('chat_messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `chat_room_id=eq.${chatRoomId}`
        },
        async (payload) => {
          console.log('🔍 [REALTIME] New message received:', payload.new);
          
          // Get sender name for the new message
          const { data: senderProfile } = await supabase
            .from('profiles')
            .select('name')
            .eq('id', payload.new.sender_id)
            .single()

          const newMessage: Message = {
            message_id: payload.new.message_id,
            sender_id: payload.new.sender_id,
            sender_name: senderProfile?.name || 'Unknown User',
            message_text: payload.new.message_text,
            message_type: payload.new.message_type || 'text',
            reply_to_message_id: payload.new.reply_to_message_id,
            is_edited: payload.new.is_edited || false,
            created_at: payload.new.created_at
          }

          console.log('✅ [REALTIME] Processed new message:', newMessage);
          setMessages(prev => [...prev, newMessage])
          setTimeout(() => scrollToBottom(), 100)
        }
      )
      .subscribe((status) => {
        console.log('🔍 [REALTIME] Subscription status:', status);
      })

    return () => {
      console.log('🔍 [REALTIME] Cleaning up subscription');
      supabase.removeChannel(channel)
    }
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || sending || !currentUser) return

    setSending(true)
    try {
      console.log('🔍 [SEND_MESSAGE] Sending message to room:', chatRoomId);
      console.log('🔍 [SEND_MESSAGE] Message text:', newMessage.trim());
      console.log('🔍 [SEND_MESSAGE] Sender ID:', currentUser.id);

      // Insert message directly into chat_messages table
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          chat_room_id: chatRoomId,
          sender_id: currentUser.id,
          message_text: newMessage.trim(),
          message_type: 'text'
        })
        .select(`
          message_id,
          sender_id,
          message_text,
          message_type,
          reply_to_message_id,
          is_edited,
          created_at
        `)
        .single()

      if (error) {
        console.error('❌ [SEND_MESSAGE] Error sending message:', error)
        Alert.alert('Error', 'Failed to send message')
      } else {
        console.log('✅ [SEND_MESSAGE] Message sent successfully:', data);
        setNewMessage('')
        // Note: Real-time subscription will automatically add the message to the UI
      }
    } catch (error) {
      console.error('💥 [SEND_MESSAGE] Unexpected error:', error)
      Alert.alert('Error', 'Something went wrong')
    } finally {
      setSending(false)
    }
  }

  const scrollToBottom = () => {
    flatListRef.current?.scrollToEnd({ animated: true })
  }

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInHours = Math.abs(now.getTime() - date.getTime()) / (1000 * 60 * 60)
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      })
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit', 
        minute: '2-digit' 
      })
    }
  }

  const renderMessage = ({ item }: { item: Message }) => {
    const isMyMessage = item.sender_id === currentUser?.id
    const isSystemMessage = item.sender_id === 'system'

    if (isSystemMessage) {
      return (
        <View style={styles.systemMessageContainer}>
          <Text style={styles.systemMessage}>{item.message_text}</Text>
        </View>
      )
    }

    return (
      <View style={[
        styles.messageContainer,
        isMyMessage ? styles.myMessageContainer : styles.otherMessageContainer
      ]}>
        {!isMyMessage && (
          <Text style={styles.senderName}>{item.sender_name}</Text>
        )}
        <View style={[
          styles.messageBubble,
          isMyMessage ? styles.myMessageBubble : styles.otherMessageBubble
        ]}>
          <Text style={[
            styles.messageText,
            isMyMessage ? styles.myMessageText : styles.otherMessageText
          ]}>
            {item.message_text}
          </Text>
        </View>
        <Text style={[
          styles.messageTime,
          isMyMessage ? styles.myMessageTime : styles.otherMessageTime
        ]}>
          {formatMessageTime(item.created_at)}
        </Text>
      </View>
    )
  }

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <TouchableOpacity 
        style={styles.backButton}
        onPress={() => router.back()}
      >
        <Text style={styles.backButtonText}>←</Text>
      </TouchableOpacity>
      <View style={styles.headerInfo}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {roomName}
        </Text>
        <Text style={styles.headerSubtitle} numberOfLines={1}>
          {eventTitle}
        </Text>
      </View>
    </View>
  )

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B6B" />
        <Text style={styles.loadingText}>Loading chat...</Text>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {renderHeader()}
      
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.message_id}
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContainer}
        onContentSizeChange={scrollToBottom}
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          value={newMessage}
          onChangeText={setNewMessage}
          placeholder="Type a message..."
          multiline
          maxLength={1000}
          onSubmitEditing={sendMessage}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!newMessage.trim() || sending) && styles.sendButtonDisabled
          ]}
          onPress={sendMessage}
          disabled={!newMessage.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendButtonText}>➤</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  backButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  messagesList: {
    flex: 1,
  },
  messagesContainer: {
    padding: 16,
  },
  systemMessageContainer: {
    alignItems: 'center',
    marginVertical: 12,
  },
  systemMessage: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
  },
  messageContainer: {
    marginVertical: 4,
    maxWidth: '80%',
  },
  myMessageContainer: {
    alignSelf: 'flex-end',
  },
  otherMessageContainer: {
    alignSelf: 'flex-start',
  },
  senderName: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    marginLeft: 12,
  },
  messageBubble: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  myMessageBubble: {
    backgroundColor: '#FF6B6B',
    borderBottomRightRadius: 6,
  },
  otherMessageBubble: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 6,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  myMessageText: {
    color: '#fff',
  },
  otherMessageText: {
    color: '#333',
  },
  messageTime: {
    fontSize: 11,
    marginTop: 4,
  },
  myMessageTime: {
    color: '#999',
    textAlign: 'right',
    marginRight: 12,
  },
  otherMessageTime: {
    color: '#999',
    marginLeft: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    alignItems: 'flex-end',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 12,
    maxHeight: 100,
    fontSize: 16,
  },
  sendButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FF6B6B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
}) 
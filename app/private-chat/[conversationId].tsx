import { Ionicons } from '@expo/vector-icons'
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
import { SafeAreaView as SafeAreaViewContext } from 'react-native-safe-area-context'
import { NotificationHelpers } from '../../lib/notifications'
import { showMessageReportOptions, showUserSafetyActions } from '../../lib/safetyUtils'
import { supabase } from '../../lib/supabase'

interface PrivateMessage {
  message_id: string
  sender_id: string
  message_text: string
  created_at: string
  updated_at: string
}

export default function PrivateChat() {
  const { conversationId, otherUserName, otherUserId } = useLocalSearchParams()
  const [messages, setMessages] = useState<PrivateMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const flatListRef = useRef<FlatList>(null)

  useEffect(() => {
    initializeChat()
  }, [conversationId])

  useEffect(() => {
    if (!conversationId) return
    const cleanup = subscribeToMessages()
    return cleanup
  }, [conversationId])

  const initializeChat = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUser(user)

      if (user && conversationId) {
        await loadMessages()
      }
    } catch (error) {
      console.error('Error initializing chat:', error)
      Alert.alert('Error', 'Failed to load conversation')
    } finally {
      setLoading(false)
    }
  }

  const loadMessages = async () => {
    try {
      // Redirect unauthenticated users to login for consistency
      if (!currentUser) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.replace('/')
          return
        }
      }
      const { data, error } = await supabase.rpc('get_private_conversation_messages', {
        p_conversation_id: conversationId,
        p_limit: 50,
        p_offset: 0
      })

      if (error) {
        console.error('Error loading messages:', error)
        return
      }

      // Reverse to show oldest first
      setMessages((data || []).reverse())
      setTimeout(() => scrollToBottom(), 100)
    } catch (error) {
      console.error('Failed to load messages:', error)
    }
  }

  const subscribeToMessages = () => {
    // Subscribe to real-time message updates
    const channel = supabase
      .channel(`private_messages_${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'private_messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          const row: any = payload.new
          const newMessage: PrivateMessage = {
            message_id: row.id,
            sender_id: row.sender_id,
            message_text: row.message_text,
            created_at: row.created_at,
            updated_at: row.updated_at || row.created_at,
          }
          setMessages(prev => {
            const exists = prev.some(m => m.message_id === newMessage.message_id)
            if (exists) return prev
            return [...prev, newMessage]
          })
          setTimeout(() => scrollToBottom(), 100)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  const scrollToBottom = () => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true })
    }
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || sending || !currentUser) return

    setSending(true)
    const messageText = newMessage.trim()
    setNewMessage('')

    // Optimistic UI
    const optimistic: PrivateMessage = {
      message_id: `temp-${Date.now()}`,
      sender_id: currentUser.id,
      message_text: messageText,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimistic])
    setTimeout(() => scrollToBottom(), 50)

    try {
      const { data, error } = await supabase.rpc('send_private_message', {
        p_conversation_id: conversationId,
        p_message_text: messageText
      })

      if (error) {
        console.error('Error sending message:', error)
        Alert.alert('Error', 'Failed to send message')
        // Rollback optimistic
        setMessages(prev => prev.filter(m => m.message_id !== optimistic.message_id))
        setNewMessage(messageText)
        return
      }

      const result = Array.isArray(data) ? data[0] : data
      if (!result?.success) {
        Alert.alert('Error', result?.message || 'Failed to send message')
        // Rollback optimistic
        setMessages(prev => prev.filter(m => m.message_id !== optimistic.message_id))
        setNewMessage(messageText)
        return
      }

      // Notification (best-effort)
      try {
        const { data: senderProfile } = await supabase
          .from('user_profiles')
          .select('display_name')
          .eq('user_id', currentUser.id)
          .single()
        const senderName = senderProfile?.display_name || 'Someone'
        await NotificationHelpers.messageNotification(
          senderName,
          messageText,
          otherUserId as string,
          conversationId as string
        )
      } catch (notificationError) {
        console.error('Failed to send message notification:', notificationError)
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      // Rollback optimistic
      setMessages(prev => prev.filter(m => m.message_id !== optimistic.message_id))
      setNewMessage(messageText)
    } finally {
      setSending(false)
    }
  }

  const formatTime = (timeString: string) => {
    const messageTime = new Date(timeString)
    const now = new Date()
    const diffMs = now.getTime() - messageTime.getTime()
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / 60000)
      return diffMins < 1 ? 'now' : `${diffMins}m ago`
    }
    if (diffHours < 24) {
      return `${diffHours}h ago`
    }
    if (diffDays < 7) {
      return `${diffDays}d ago`
    }
    
    return messageTime.toLocaleDateString()
  }

  const renderMessage = ({ item }: { item: PrivateMessage }) => {
    const isCurrentUser = item.sender_id === currentUser?.id
    
    const handleMessageLongPress = () => {
      if (!isCurrentUser) {
        Alert.alert(
          'Message Options',
          'What would you like to do with this message?',
          [
            {
              text: 'Report Message',
              onPress: () => {
                showMessageReportOptions(item.message_id, 'private')
              }
            },
            {
              text: 'Cancel',
              style: 'cancel'
            }
          ]
        )
      }
    }
    
    return (
      <TouchableOpacity
        style={[
          styles.messageContainer,
          isCurrentUser ? styles.currentUserMessage : styles.otherUserMessage
        ]}
        onLongPress={handleMessageLongPress}
        delayLongPress={500}
      >
        <Text style={[
          styles.messageText,
          isCurrentUser ? styles.currentUserText : styles.otherUserText
        ]}>
          {item.message_text}
        </Text>
        <Text style={[
          styles.messageTime,
          isCurrentUser ? styles.currentUserTime : styles.otherUserTime
        ]}>
          {formatTime(item.created_at)}
        </Text>
      </TouchableOpacity>
    )
  }

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>💬</Text>
      <Text style={styles.emptyTitle}>Start the conversation!</Text>
      <Text style={styles.emptyText}>
        You matched with {otherUserName}. Say hi and break the ice!
      </Text>
    </View>
  )

  if (loading) {
    return (
      <SafeAreaViewContext style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B6B" />
          <Text style={styles.loadingText}>Loading conversation...</Text>
        </View>
      </SafeAreaViewContext>
    )
  }

  return (
    <SafeAreaViewContext style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{otherUserName || 'Chat'}</Text>
          <TouchableOpacity 
            style={styles.infoButton}
            onPress={() => {
              if (otherUserId) {
                showUserSafetyActions(
                  otherUserName as string || 'User',
                  otherUserId as string,
                  () => {
                    // On block, go back to chat list
                    router.back()
                  }
                )
              } else {
                Alert.alert('Coming Soon!', 'User profile view will be available soon!')
              }
            }}
          >
            <Ionicons name="shield-outline" size={24} color="#333" />
          </TouchableOpacity>
        </View>

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.message_id}
          renderItem={renderMessage}
          style={styles.messagesList}
          contentContainerStyle={messages.length === 0 ? styles.emptyListContainer : undefined}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollToBottom()}
        />

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder="Type a message..."
            placeholderTextColor="#999"
            multiline
            maxLength={1000}
            editable={!sending}
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
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaViewContext>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  infoButton: {
    padding: 8,
  },
  messagesList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  messageContainer: {
    marginVertical: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    maxWidth: '80%',
  },
  currentUserMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#FF6B6B',
  },
  otherUserMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0f0f0',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  currentUserText: {
    color: '#fff',
  },
  otherUserText: {
    color: '#333',
  },
  messageTime: {
    fontSize: 12,
    marginTop: 4,
  },
  currentUserTime: {
    color: 'rgba(255,255,255,0.8)',
  },
  otherUserTime: {
    color: '#999',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    maxHeight: 100,
    marginRight: 12,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF6B6B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
}) 
import { Ionicons } from '@expo/vector-icons'
import { Audio } from 'expo-av'  // Keep for VoiceNote component
import { LinearGradient } from 'expo-linear-gradient'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useEffect, useRef, useState, useCallback } from 'react'
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import AppHeader from '../../components/AppHeader'
import OptimizedImage from '../../components/OptimizedImage'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { showMessageReportOptions, showUserSafetyActions } from '../../lib/safetyUtils'
import { subscribeToConversation, startPrivateTyping, stopPrivateTyping, markPrivateMessagesRead, PrivateMessageCallback, PrivateTypingCallback, PrivateReadCallback } from '../../lib/socketClient'
import { useAuth } from '../../lib/useAuth'
import { setConversationLastRead } from '../../lib/unread'

interface PrivateMessage {
  id: string
  conversationId: string
  senderId: string
  sender: { id: string; name: string | null; image: string | null }
  text: string | null
  mediaUrl: string | null
  mediaType: string | null
  isRead: boolean
  createdAt: string
}

type ChatListItem =
  | ({ kind: 'message' } & PrivateMessage)
  | { kind: 'separator'; id: string; label: string }

// Helper to map API response to local message format
const mapMessage = (msg: any): PrivateMessage => ({
  id: msg.id,
  conversationId: msg.conversationId,
  senderId: msg.senderId,
  sender: msg.sender,
  text: msg.text,
  mediaUrl: msg.mediaUrl,
  mediaType: msg.mediaType,
  isRead: msg.isRead,
  createdAt: msg.createdAt,
})

export default function PrivateChat() {
  const { conversationId, otherUserName, otherUserId } = useLocalSearchParams()
  const { user: authUser } = useAuth()
  const [messages, setMessages] = useState<PrivateMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [isOtherTyping, setIsOtherTyping] = useState(false)
  const flatListRef = useRef<FlatList>(null)
  const insets = useSafeAreaInsets()
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const otherTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const getInitials = (name: string) => {
    if (!name) return '?'
    const trimmed = String(name).trim()
    if (!trimmed) return '?'
    const parts = trimmed.split(/\s+/)
    const first = parts[0]?.charAt(0) || ''
    const last = parts.length > 1 ? parts[parts.length - 1]?.charAt(0) : ''
    const combined = (first + last).toUpperCase()
    return combined || '?'
  }

  useEffect(() => {
    initializeChat()
  }, [conversationId, authUser])

  useEffect(() => {
    if (!conversationId) return
    const cleanup = subscribeToMessages()
    return cleanup
  }, [conversationId, subscribeToMessages])

  // Mark messages as read when viewing
  useEffect(() => {
    if (!authUser?.id || !conversationId || messages.length === 0) return

    const unreadIds = messages
      .filter(m => !m.isRead && m.senderId !== authUser.id)
      .map(m => m.id)

    if (unreadIds.length > 0) {
      markPrivateMessagesRead(String(conversationId), unreadIds)
    }
  }, [messages, authUser?.id, conversationId])

  const initializeChat = async () => {
    try {
      if (authUser && conversationId) {
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
      Logger.info('private-chat', 'Loading messages', { conversationId })
      const result = await apiClient.getConversationMessages(String(conversationId))

      if (result.success && result.data) {
        // Messages come in reverse order (newest first), reverse for display
        const msgs = result.data.messages.map(mapMessage).reverse()
        setMessages(msgs)
        Logger.info('private-chat', `Loaded ${msgs.length} messages`)
      } else {
        Logger.error('private-chat', 'Failed to load messages', { error: result.error })
      }

      // Mark as read when viewing
      if (conversationId) {
        setConversationLastRead(String(conversationId)).catch(() => {})
      }
    } catch (error) {
      Logger.error('private-chat', 'Failed to load messages', { error })
    }
  }

  const subscribeToMessages = useCallback(() => {
    if (!conversationId) return () => {}

    Logger.info('private-chat', `Subscribing to conversation: ${conversationId}`)

    const handleNewMessage: PrivateMessageCallback = (data) => {
      Logger.debug('private-chat', 'Received new message via socket', { messageId: data.message.id })

      // Add new message to the list
      setMessages(prev => {
        // Check if message already exists
        if (prev.some(m => m.id === data.message.id)) {
          return prev
        }
        return [...prev, mapMessage(data.message)]
      })

      // Clear typing indicator when message is received
      setIsOtherTyping(false)
      if (otherTypingTimeoutRef.current) {
        clearTimeout(otherTypingTimeoutRef.current)
        otherTypingTimeoutRef.current = null
      }

      // Scroll to bottom
      setTimeout(scrollToBottom, 100)
    }

    // Handle typing indicators
    const handleTyping: PrivateTypingCallback = (data) => {
      if (data.userId === authUser?.id) return // Ignore our own typing

      setIsOtherTyping(data.isTyping)

      // Auto-clear typing after 3 seconds (in case stopTyping is missed)
      if (data.isTyping) {
        if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current)
        otherTypingTimeoutRef.current = setTimeout(() => {
          setIsOtherTyping(false)
        }, 3000)
      } else {
        if (otherTypingTimeoutRef.current) {
          clearTimeout(otherTypingTimeoutRef.current)
          otherTypingTimeoutRef.current = null
        }
      }
    }

    // Handle read receipts
    const handleRead: PrivateReadCallback = (data) => {
      if (data.readBy === authUser?.id) return // Ignore our own read receipts

      setMessages(prev => prev.map(m =>
        data.messageIds.includes(m.id) ? { ...m, isRead: true } : m
      ))
    }

    const unsubMessage = subscribeToConversation(String(conversationId), handleNewMessage)
    const unsubTyping = subscribeToConversation(String(conversationId), handleTyping)
    const unsubRead = subscribeToConversation(String(conversationId), handleRead)

    return () => {
      Logger.debug('private-chat', `Unsubscribing from conversation: ${conversationId}`)
      unsubMessage()
      unsubTyping()
      unsubRead()
      if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current)
    }
  }, [conversationId, authUser?.id])

  const scrollToBottom = () => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true })
    }
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || sending || !authUser || !conversationId) return

    // Stop typing indicator when sending
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    stopPrivateTyping(String(conversationId))

    const messageText = newMessage.trim()
    setNewMessage('')
    setSending(true)

    try {
      Logger.info('private-chat', 'Sending message')
      const result = await apiClient.sendPrivateMessage(String(conversationId), { text: messageText })

      if (result.success && result.data) {
        Logger.info('private-chat', 'Message sent successfully', { messageId: result.data.id })
        // Add to local messages (socket might also deliver it, handled by dedup)
        setMessages(prev => {
          if (prev.some(m => m.id === result.data!.id)) {
            return prev
          }
          return [...prev, mapMessage(result.data)]
        })
        setTimeout(scrollToBottom, 100)
      } else {
        Logger.error('private-chat', 'Failed to send message', { error: result.error })
        Alert.alert('Error', 'Failed to send message. Please try again.')
        setNewMessage(messageText) // Restore message
      }
    } catch (error) {
      Logger.error('private-chat', 'Failed to send message', { error })
      Alert.alert('Error', 'Failed to send message. Please try again.')
      setNewMessage(messageText) // Restore message
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
    const isCurrentUser = item.senderId === authUser?.id

    const handleMessageLongPress = () => {
      if (!isCurrentUser) {
        Alert.alert(
          'Message Options',
          'What would you like to do with this message?',
          [
            {
              text: 'Report Message',
              onPress: () => {
                showMessageReportOptions(item.id, 'private')
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

    // Check for media
    const hasImage = item.mediaType === 'image' && item.mediaUrl
    const hasVideo = item.mediaType === 'video' && item.mediaUrl
    // Check for audio in text (legacy support)
    const lower = String(item.text || '').toLowerCase()
    const isAudio = lower.startsWith('http') && /(\.m4a|\.mp3|\.aac|\.wav|\.ogg)$/i.test(lower)

    return (
      <TouchableOpacity
        style={[styles.messageRow, isCurrentUser ? styles.myRow : styles.otherRow]}
        onLongPress={handleMessageLongPress}
        delayLongPress={500}
        activeOpacity={0.7}
      >
        {!isCurrentUser && (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(String(item.sender?.name || otherUserName || 'User'))}</Text>
          </View>
        )}
        <View style={[styles.messageContainer, isCurrentUser ? styles.myMessageContainer : styles.otherMessageContainer]}>
          <View style={[
            styles.messageBubble,
            isCurrentUser ? styles.myMessageBubble : styles.otherMessageBubble
          ]}>
            {hasImage ? (
              <OptimizedImage
                source={item.mediaUrl!}
                style={{ width: 220, height: 160, borderRadius: 14 }}
                contentFit="cover"
              />
            ) : isAudio ? (
              <VoiceNote uri={item.text!} />
            ) : (
              <Text style={[
                styles.messageText,
                isCurrentUser ? styles.myMessageText : styles.otherMessageText
              ]}>
                {item.text || ''}
              </Text>
            )}
          </View>
          <Text style={[
            styles.messageTime,
            isCurrentUser ? styles.myMessageTime : styles.otherMessageTime
          ]}>
            {formatTime(item.createdAt)}
          </Text>
        </View>
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

  const toDayKey = (iso: string) => {
    const d = new Date(iso)
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
  }

  const formatDayLabel = (iso: string) => {
    const d = new Date(iso)
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(today.getDate() - 1)
    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
    if (sameDay(d, today)) return 'Today'
    if (sameDay(d, yesterday)) return 'Yesterday'
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined })
  }

  const chatItems: ChatListItem[] = React.useMemo(() => {
    const items: ChatListItem[] = []
    let lastDayKey: string | null = null
    for (const m of messages) {
      const dayKey = toDayKey(m.createdAt)
      if (dayKey !== lastDayKey) {
        items.push({ kind: 'separator', id: `sep-${dayKey}`, label: formatDayLabel(m.createdAt) })
        lastDayKey = dayKey
      }
      items.push({ kind: 'message', ...m })
    }
    return items
  }, [messages])

  const renderSeparator = (label: string) => (
    <View style={styles.dateSeparatorContainer}>
      <View style={styles.dateSeparatorLine} />
      <Text style={styles.dateSeparatorText}>{label}</Text>
    </View>
  )

  const renderChatItem = ({ item }: { item: ChatListItem }) => {
    if (item.kind === 'separator') return renderSeparator(item.label)
    return renderMessage({ item })
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar style="light" backgroundColor="transparent" translucent />
        <LinearGradient
          colors={["#480D37", "#000000"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Gradient top inset to fill the status bar area on iOS */}
        <LinearGradient
          colors={["#480D37", "#000000"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ height: insets.top, position: 'absolute', top: 0, left: 0, right: 0 }}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B6B" />
          <Text style={styles.loadingText}>Loading conversation...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" backgroundColor="transparent" translucent />
      <LinearGradient
        colors={["#480D37", "#000000"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Gradient top inset to fill the status bar area on iOS */}
      <LinearGradient
        colors={["#480D37", "#000000"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ height: insets.top, position: 'absolute', top: 0, left: 0, right: 0 }}
      />
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <AppHeader
          title={(otherUserName as string) || 'Chat'}
          onBack={() => router.back()}
          rightIconButton={{
            name: 'settings-outline',
            onPress: () => {
              if (otherUserId) {
                showUserSafetyActions(
                  (otherUserName as string) || 'User',
                  otherUserId as string,
                  () => router.back()
                )
              } else {
                Alert.alert('Coming Soon!', 'User profile view will be available soon!')
              }
            },
            accessibilityLabel: 'Safety options',
          }}
        />

        {/* Messages */}
        {messages.length === 0 ? (
          <View style={[styles.messagesContainer, styles.emptyListContainer]}>
            {renderEmptyState()}
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={chatItems}
            keyExtractor={(item) => item.kind === 'separator' ? item.id : item.id}
            renderItem={renderChatItem}
            style={styles.messagesList}
            contentContainerStyle={styles.messagesContainer}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollToBottom()}
          />
        )}

        {/* Typing indicator */}
        {isOtherTyping && (
          <View style={styles.typingContainer}>
            <Text style={styles.typingText}>
              {otherUserName || 'User'} is typing...
            </Text>
          </View>
        )}

        {/* Input */}
        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.inputIcon} onPress={() => {
            Alert.alert('Coming Soon', 'File attachments will be available soon.')
          }}>
            <Ionicons name="attach" size={22} color="#CFCFCF" />
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            value={newMessage}
            onChangeText={(text) => {
              setNewMessage(text)
              // Emit typing indicator with debounce
              if (text.length > 0 && conversationId) {
                startPrivateTyping(String(conversationId))
                // Clear previous timeout and set new one to stop typing
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
                typingTimeoutRef.current = setTimeout(() => {
                  stopPrivateTyping(String(conversationId))
                }, 2000)
              } else if (text.length === 0 && conversationId) {
                // Immediately stop typing when input is cleared
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
                stopPrivateTyping(String(conversationId))
              }
            }}
            placeholder="Type a message..."
            placeholderTextColor="rgba(255,255,255,0.4)"
            multiline
            maxLength={1000}
            editable={!sending}
          />
          <TouchableOpacity style={styles.inputIcon} onPress={() => {
            Alert.alert('Coming Soon', 'Photo sharing will be available soon.')
          }}>
            <Ionicons name="camera" size={22} color="#CFCFCF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.inputIcon} onPress={() => {
            Alert.alert('Coming Soon', 'Voice notes will be available soon.')
          }}>
            <Ionicons name="mic" size={22} color="#CFCFCF" />
          </TouchableOpacity>
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
    </SafeAreaView>
  )
}

// Simple inline voice note player
const VoiceNote = ({ uri }: { uri: string }) => {
  const [sound, setSound] = React.useState<Audio.Sound | null>(null)
  const [playing, setPlaying] = React.useState(false)
  const [duration, setDuration] = React.useState<number | null>(null)
  const [position, setPosition] = React.useState(0)

  React.useEffect(() => {
    let isMounted = true
    const load = async () => {
      try {
        const { sound: s } = await Audio.Sound.createAsync({ uri }, { shouldPlay: false })
        if (!isMounted) return
        setSound(s)
        s.setOnPlaybackStatusUpdate((status: any) => {
          if (!status) return
          if ('durationMillis' in status && status.durationMillis != null) setDuration(status.durationMillis)
          if ('positionMillis' in status && status.positionMillis != null) setPosition(status.positionMillis)
          if ('didJustFinish' in status && status.didJustFinish) setPlaying(false)
        })
      } catch {}
    }
    load()
    return () => {
      isMounted = false
      try { sound?.unloadAsync() } catch {}
    }
  }, [uri])

  const toggle = async () => {
    try {
      if (!sound) return
      const status = await sound.getStatusAsync()
      if ((status as any).isPlaying) {
        await sound.pauseAsync()
        setPlaying(false)
      } else {
        await sound.playAsync()
        setPlaying(true)
      }
    } catch {}
  }

  const seconds = Math.floor((duration || 0) / 1000)
  const posSeconds = Math.floor(position / 1000)

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <TouchableOpacity onPress={toggle} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#7B2DFA', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
        <Ionicons name={playing ? 'pause' : 'play'} size={18} color="#fff" />
      </TouchableOpacity>
      <Text style={{ color: '#FFFFFF' }}>{posSeconds}s / {seconds || 0}s</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
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
  
  messagesList: {
    flex: 1,
  },
  messagesContainer: {
    padding: 16,
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
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: 6,
  },
  myRow: {
    justifyContent: 'flex-end',
  },
  otherRow: {
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avatarText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
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
  messageBubble: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  myMessageBubble: {
    backgroundColor: '#7B2DFA',
    borderBottomRightRadius: 6,
  },
  otherMessageBubble: {
    backgroundColor: '#1F2B24',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderBottomLeftRadius: 6,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  myMessageText: {
    color: '#FFFFFF',
  },
  otherMessageText: {
    color: '#FFFFFF',
  },
  messageTime: {
    fontSize: 11,
    marginTop: 4,
  },
  myMessageTime: {
    color: '#B5B5B5',
    textAlign: 'right',
    marginRight: 12,
  },
  otherMessageTime: {
    color: '#B5B5B5',
    marginLeft: 12,
  },
  dateSeparatorContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  dateSeparatorLine: {
    position: 'absolute',
    top: '50%',
    left: 16,
    right: 16,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dateSeparatorText: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  inputIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    maxHeight: 100,
    marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#FFFFFF',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#7B2DFA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#555',
  },

  // Typing indicator styles
  typingContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  typingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontStyle: 'italic',
  },
}) 
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Clipboard,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import AppHeader from '../../components/AppHeader'
import { SkeletonBlock, SkeletonCircle, SkeletonLine } from '../../components/Skeleton'
import { AuthHelper, callRpc, supabase } from '../../lib/supabase'

interface Message {
  message_id: string
  sender_id: string
  sender_name: string
  message_text: string
  message_type: string
  reply_to_message_id: string | null
  is_edited: boolean
  created_at: string
  replyTo?: Message
}

type ChatListItem =
  | ({ kind: 'message' } & Message)
  | { kind: 'separator'; id: string; label: string }

export default function GroupChat() {
  const { id: chatRoomId, roomName, eventTitle } = useLocalSearchParams()
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const flatListRef = useRef<FlatList>(null)
  const [participantAliases, setParticipantAliases] = useState<Record<string, string>>({})
  const insets = useSafeAreaInsets()

  // Message interaction states
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)
  const [showMessageMenu, setShowMessageMenu] = useState(false)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)

  useEffect(() => {
    if (chatRoomId) {
      getCurrentUser()
      loadParticipantAliases()
      loadMessages()
      subscribeToMessages()
    }
  }, [chatRoomId])

  // Ensure current user alias is set to "You" after currentUser resolves
  useEffect(() => {
    if (currentUser?.id) {
      setParticipantAliases(prev => (
        prev[currentUser.id] === 'You' ? prev : { ...prev, [currentUser.id]: 'You' }
      ))
    }
  }, [currentUser?.id])

  // Re-apply aliases to existing messages whenever alias map changes
  useEffect(() => {
    if (!participantAliases || Object.keys(participantAliases).length === 0) return
    setMessages(prev => prev.map(m => {
      if (m.sender_id === 'system') return { ...m, sender_name: 'System' }
      if (m.sender_id === currentUser?.id) return { ...m, sender_name: 'You' }
      const alias = participantAliases[m.sender_id] || 'Attendee'
      return { ...m, sender_name: alias }
    }))
  }, [participantAliases, currentUser?.id])

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
      const dayKey = toDayKey(m.created_at)
      if (dayKey !== lastDayKey) {
        items.push({ kind: 'separator', id: `sep-${dayKey}`, label: formatDayLabel(m.created_at) })
        lastDayKey = dayKey
      }
      items.push({ kind: 'message', ...m })
    }
    return items
  }, [messages])

  const loadParticipantAliases = async () => {
    try {
      // Load participants for deterministic anonymous aliases
      const { data, error } = await supabase
        .from('chat_participants')
        .select('user_id, joined_at')
        .eq('chat_room_id', chatRoomId)
        .order('joined_at', { ascending: true })

      if (error) {
        console.error('❌ [CHAT_ALIASES] Error loading participants:', error)
        return
      }

      const mapping: Record<string, string> = {}
      ;(data || []).forEach((p: any, idx: number) => {
        mapping[p.user_id] = `Attendee #${idx + 1}`
      })

      // Preserve a special alias for current user if we already know it
      if (currentUser?.id && mapping[currentUser.id]) {
        mapping[currentUser.id] = 'You'
      }

      setParticipantAliases(mapping)
      console.log('✅ [CHAT_ALIASES] Loaded aliases for', Object.keys(mapping).length, 'participants')
    } catch (error) {
      console.error('💥 [CHAT_ALIASES] Unexpected error:', error)
    }
  }

  const getCurrentUser = async () => {
    try {
      console.log('🔍 [CHAT_USER] Getting current user...');
      
      // Get authenticated user with fallback
      const { data: { user }, error } = await AuthHelper.getUserWithFallback(3000)
      
      if (error) {
        console.error('❌ [CHAT_USER] Auth error:', error);
        return
      }
      
      if (!user) {
        console.log('⚠️ [CHAT_USER] No authenticated user found');
        return
      }
      
      console.log('✅ [CHAT_USER] Current user:', user?.id);
      setCurrentUser(user)
    } catch (error) {
      console.error('❌ [CHAT_USER] Error getting current user:', error);
    }
  }

  const loadMessages = async () => {
    try {
      // Get authenticated user with fallback
      const { data: { user }, error } = await AuthHelper.getUserWithFallback(3000)
      
      if (error) {
        console.error('❌ [CHAT_MESSAGES] Auth error:', error);
        return
      }
      
      if (!user) {
        console.log('⚠️ [CHAT_MESSAGES] No authenticated user found');
        return
      }

      console.log('🔍 [CHAT_MESSAGES] Loading messages for room:', chatRoomId);
      console.log('🔍 [CHAT_MESSAGES] User ID:', user.id);

      // Load messages
      const { data, error: messagesError } = await supabase
        .from('chat_messages')
        .select(`
          id,
          sender_id,
          sender_name,
          message_text,
          message_type,
          reply_to_message_id,
          is_edited,
          created_at
        `)
        .eq('chat_room_id', chatRoomId)
        .order('created_at', { ascending: false })
        .limit(100)

      if (messagesError) {
        console.error('❌ [CHAT_MESSAGES] Error loading messages:', messagesError)
        
        // If this is an RLS policy error, show a more helpful message
        if (messagesError.code === '42501' || messagesError.message.includes('policy')) {
          Alert.alert('Chat Temporarily Unavailable', 'Chat access is temporarily restricted. Please try again later.')
        } else {
          Alert.alert('Error', 'Failed to load messages')
        }
      } else {
        console.log('✅ [CHAT_MESSAGES] Successfully loaded', data?.length || 0, 'messages');
        
        // Transform data and apply anonymous aliases
        const transformedMessages = (data || []).map(msg => {
          const alias = msg.sender_id === 'system'
            ? 'System'
            : (participantAliases[msg.sender_id] || 'Attendee')
          return {
            message_id: msg.id,
            sender_id: msg.sender_id,
            sender_name: alias,
            message_text: msg.message_text,
            message_type: msg.message_type || 'text',
            reply_to_message_id: msg.reply_to_message_id,
            is_edited: msg.is_edited || false,
            created_at: msg.created_at,
            replyTo: undefined as Message | undefined
          }
        });

        // Link reply messages
        const messages = transformedMessages.map(msg => ({
          ...msg,
          replyTo: msg.reply_to_message_id ? transformedMessages.find(m => m.message_id === msg.reply_to_message_id) : undefined
        }));

        // Reverse to show oldest first
        setMessages(messages.reverse())
        setTimeout(() => scrollToBottom(), 100)
      }
    } catch (error) {
      console.error('💥 [CHAT_MESSAGES] Unexpected error:', error)
    } finally {
      setLoading(false)
    }
  }

  const subscribeToMessages = () => {
    console.log('🔍 [REALTIME] Setting up real-time subscription for room:', chatRoomId);
    
    // Subscribe to real-time message updates
    const channel = supabase
      .channel(`chat_messages_${chatRoomId}`)
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
          
          const alias = payload.new.sender_id === 'system'
            ? 'System'
            : (participantAliases[payload.new.sender_id] || 'Attendee')
          const newMessage: Message = {
            message_id: payload.new.id,
            sender_id: payload.new.sender_id,
            sender_name: alias,
            message_text: payload.new.message_text,
            message_type: payload.new.message_type || 'text',
            reply_to_message_id: payload.new.reply_to_message_id,
            is_edited: payload.new.is_edited || false,
            created_at: payload.new.created_at,
            replyTo: payload.new.reply_to_message_id ? messages.find(m => m.message_id === payload.new.reply_to_message_id) : undefined
          }

          console.log('✅ [REALTIME] Processed new message:', newMessage);
          
          // Check if this message is already in our state (to avoid duplicates)
          setMessages(prev => {
            // Don't add if message already exists (by ID or by content + timestamp for optimistic updates)
            const exists = prev.some(msg => 
              msg.message_id === newMessage.message_id ||
              (msg.message_text === newMessage.message_text && 
               msg.sender_id === newMessage.sender_id &&
               Math.abs(new Date(msg.created_at).getTime() - new Date(newMessage.created_at).getTime()) < 5000) // Within 5 seconds
            )
            
            if (exists) {
              console.log('🔍 [REALTIME] Message already exists, skipping duplicate');
              // If it's an optimistic message (temp ID), replace it with the real one
              return prev.map(msg => 
                msg.message_id.toString().startsWith('temp-') && 
                msg.message_text === newMessage.message_text && 
                msg.sender_id === newMessage.sender_id
                  ? newMessage // Replace optimistic message with real one
                  : msg
              )
            }
            
            // Add new message
            return [...prev, newMessage]
          })
          
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

  // Message interaction handlers
  const handleMessageLongPress = (message: Message) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setSelectedMessage(message)
    setShowMessageMenu(true)
  }

  const handleReply = () => {
    if (selectedMessage) {
      setReplyingTo(selectedMessage)
      setShowMessageMenu(false)
      setSelectedMessage(null)
    }
  }

  const handleCopyMessage = async () => {
    if (selectedMessage) {
      await Clipboard.setString(selectedMessage.message_text)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setShowMessageMenu(false)
      setSelectedMessage(null)
      // You could show a toast notification here
    }
  }

  const handleReportMessage = () => {
    Alert.alert(
      'Report Message',
      'Are you sure you want to report this message?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: () => {
            // Handle report logic here
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
            setShowMessageMenu(false)
            setSelectedMessage(null)
          }
        }
      ]
    )
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || !currentUser) return

    setSending(true)
    const messageText = newMessage.trim()
    let optimisticMessage: Message | null = null
    
    try {
      console.log('🔍 [SEND_MESSAGE] Sending message to room:', chatRoomId);
      console.log('🔍 [SEND_MESSAGE] Message text:', messageText);
      console.log('🔍 [SEND_MESSAGE] Sender ID:', currentUser.id);

      // Create optimistic message to show immediately
      optimisticMessage = {
        message_id: 'temp-' + Date.now(), // Temporary ID
        sender_id: currentUser.id,
        sender_name: 'You',
        message_text: messageText,
        message_type: 'text',
        reply_to_message_id: replyingTo ? replyingTo.message_id : null,
        is_edited: false,
        created_at: new Date().toISOString(),
        replyTo: replyingTo || undefined
      }

      // Add message immediately to UI and clear input
      setMessages(prev => [...prev, optimisticMessage!])
      setNewMessage('')
      setReplyingTo(null) // Clear reply state after sending
      setTimeout(() => scrollToBottom(), 100)

      // Use the database function to send message
      const { data, error } = await callRpc('send_chat_message', {
          room_id: chatRoomId,
          message_text: messageText,
          message_type: 'text'
        })

      if (error) {
        console.error('❌ [SEND_MESSAGE] Error sending message:', error)
        Alert.alert('Error', 'Failed to send message')
        throw error // Will be caught by outer catch
      } else if (data?.success) {
        console.log('✅ [SEND_MESSAGE] Message sent successfully:', data);
        
        // Update the optimistic message with real ID from server
        setMessages(prev => prev.map(msg => 
          msg.message_id === optimisticMessage!.message_id 
            ? { ...msg, message_id: data.message_id }
            : msg
        ))
      } else {
        console.error('❌ [SEND_MESSAGE] Message sending failed:', data?.message)
        Alert.alert('Error', data?.message || 'Failed to send message')
        throw new Error(data?.message || 'Failed to send message')
      }
    } catch (error) {
      console.error('💥 [SEND_MESSAGE] Unexpected error:', error)
      
      // Remove optimistic message if it was created
      if (optimisticMessage) {
        setMessages(prev => prev.filter(msg => msg.message_id !== optimisticMessage!.message_id))
      }
      
      // Restore the message text
      setNewMessage(messageText)
      
      // Show error if not already shown
      if (!(error instanceof Error) || !error.message?.includes('Failed to send message')) {
        Alert.alert('Error', 'Something went wrong')
      }
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
      <TouchableOpacity
        style={[styles.messageRow, isMyMessage ? styles.myRow : styles.otherRow]}
        onLongPress={() => handleMessageLongPress(item)}
        delayLongPress={500}
        activeOpacity={0.7}
      >
        {!isMyMessage && (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(item.sender_name)}</Text>
          </View>
        )}
        <View style={[
          styles.messageContainer,
          isMyMessage ? styles.myMessageContainer : styles.otherMessageContainer
        ]}>
          {!isMyMessage && (
            <Text style={styles.senderName}>{item.sender_name}</Text>
          )}

          {/* Reply indicator */}
          {item.replyTo && (
            <View style={styles.replyContainer}>
              <View style={styles.replyLine} />
              <Text style={styles.replyText}>
                Replying to {item.replyTo.sender_name}: {item.replyTo.message_text.length > 50
                  ? `${item.replyTo.message_text.substring(0, 50)}...`
                  : item.replyTo.message_text}
              </Text>
            </View>
          )}

          <View style={[
            styles.messageBubble,
            isMyMessage ? styles.myMessageBubble : styles.otherMessageBubble
          ]}>
            {item.message_type === 'text' ? (
              <Text style={[
                styles.messageText,
                isMyMessage ? styles.myMessageText : styles.otherMessageText
              ]}>
                {item.message_text}
              </Text>
            ) : (
              <Text style={[
                styles.messageText,
                isMyMessage ? styles.myMessageText : styles.otherMessageText
              ]}>
                Message type not supported
              </Text>
            )}
          </View>
          <Text style={[
            styles.messageTime,
            isMyMessage ? styles.myMessageTime : styles.otherMessageTime
          ]}>
            {formatMessageTime(item.created_at)}
          </Text>
        </View>
      </TouchableOpacity>
    )
  }

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

  const renderHeader = () => (
    <AppHeader
      title={(roomName as string) || 'Event Chat'}
      subtitle={(eventTitle as string) || undefined}
      onBack={() => router.back()}
    />
  )

  const isLoading = loading

  const renderLoadingSkeleton = () => (
    <View style={styles.messagesContainer}>
      {[...Array(8)].map((_, idx) => {
        const isMine = idx % 3 === 0
        return (
          <View key={`sk-${idx}`} style={[styles.messageRow, isMine ? styles.myRow : styles.otherRow]}>
            {!isMine && (
              <SkeletonCircle width={32} style={styles.avatar} />
            )}
            <View style={[styles.messageContainer, isMine ? styles.myMessageContainer : styles.otherMessageContainer]}> 
              {!isMine && <SkeletonLine width={80} style={{ marginLeft: 12, marginBottom: 6 }} />}
              <SkeletonBlock width={isMine ? '78%' : '86%'} height={isMine ? 44 : 64} borderRadius={20} />
              <SkeletonLine width={60} style={{ marginTop: 6, alignSelf: isMine ? 'flex-end' : 'flex-start', marginHorizontal: 12 }} />
            </View>
          </View>
        )
      })}
    </View>
  )

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
        {renderHeader()}

        {isLoading ? (
          renderLoadingSkeleton()
        ) : (
          <FlatList
            ref={flatListRef}
            data={chatItems}
            renderItem={renderChatItem}
            keyExtractor={(item) => item.kind === 'separator' ? item.id : item.message_id}
            style={styles.messagesList}
            contentContainerStyle={styles.messagesContainer}
            onContentSizeChange={scrollToBottom}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Reply indicator above input */}
        {replyingTo && (
          <View style={styles.replyInputContainer}>
            <View style={styles.replyInputContent}>
              <View style={styles.replyInputLine} />
              <View style={styles.replyInputText}>
                <Text style={styles.replyInputLabel}>Replying to {replyingTo.sender_name}</Text>
                <Text style={styles.replyInputMessage} numberOfLines={1}>
                  {replyingTo.message_text}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setReplyingTo(null)}
                style={styles.replyInputClose}
              >
                <Text style={styles.replyInputCloseText}>×</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder=""
            placeholderTextColor="rgba(255,255,255,0.6)"
            multiline
            maxLength={1000}
            onSubmitEditing={sendMessage}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              ((!newMessage.trim() || sending || isLoading) && styles.sendButtonDisabled)
            ]}
            onPress={sendMessage}
            disabled={!newMessage.trim() || sending || isLoading}
          >
            {sending ? (
              <Text style={styles.sendButtonText}>…</Text>
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Message Menu Modal */}
      <Modal
        visible={showMessageMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMessageMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMessageMenu(false)}
        >
          <View style={styles.messageMenu}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleReply}
            >
              <Text style={[styles.menuItemText, styles.menuItemIcon]}>↩️</Text>
              <Text style={styles.menuItemText}>Reply</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleCopyMessage}
            >
              <Text style={[styles.menuItemText, styles.menuItemIcon]}>📋</Text>
              <Text style={styles.menuItemText}>Copy</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemDestructive]}
              onPress={handleReportMessage}
            >
              <Text style={[styles.menuItemText, styles.menuItemIcon]}>🚩</Text>
              <Text style={[styles.menuItemText, styles.menuItemTextDestructive]}>Report</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#FFFFFF',
  },
  
  messagesList: {
    flex: 1,
  },
  messagesContainer: {
    padding: 16,
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
  systemMessageContainer: {
    alignItems: 'center',
    marginVertical: 12,
  },
  systemMessage: {
    fontSize: 14,
    color: '#FFFFFF',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
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
    color: '#FFFFFF',
    marginBottom: 4,
    marginLeft: 12,
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
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
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
    marginRight: 12,
    maxHeight: 100,
    fontSize: 16,
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
  sendButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },

  // Reply functionality styles
  replyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingLeft: 12,
  },
  replyLine: {
    width: 2,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 1,
    marginRight: 8,
  },
  replyText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    flex: 1,
    fontStyle: 'italic',
  },

  // Reply input styles
  replyInputContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  replyInputContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#FF6B6B',
  },
  replyInputLine: {
    width: 2,
    height: 20,
    backgroundColor: '#FF6B6B',
    borderRadius: 1,
    marginRight: 8,
  },
  replyInputText: {
    flex: 1,
  },
  replyInputLabel: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  replyInputMessage: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  replyInputClose: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  replyInputCloseText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Message menu modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageMenu: {
    backgroundColor: 'rgba(30,30,30,0.95)',
    borderRadius: 12,
    padding: 8,
    minWidth: 200,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
  },
  menuItemText: {
    fontSize: 16,
    color: '#FFFFFF',
    marginLeft: 12,
    fontWeight: '500',
  },
  menuItemIcon: {
    marginLeft: 0,
    marginRight: 8,
    fontSize: 18,
  },
  menuItemDestructive: {
    // Destructive styling handled in the TouchableOpacity style array
  },
  menuItemTextDestructive: {
    color: '#FF6B6B',
  },
}) 
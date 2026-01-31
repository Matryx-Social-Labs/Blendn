import { Ionicons } from '@expo/vector-icons'
import { Audio } from 'expo-av'
import * as FileSystem from 'expo-file-system'
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
import OptimizedImage from '../../components/OptimizedImage'
import { SkeletonBlock, SkeletonCircle, SkeletonLine } from '../../components/Skeleton'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { pickImage, uploadPhoto } from '../../lib/photoUtils'
import { useAuth } from '../../lib/useAuth'

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
  const { user: authUser, loading: authLoading } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const flatListRef = useRef<FlatList>(null)
  const [participantAliases, setParticipantAliases] = useState<Record<string, string>>({})
  const insets = useSafeAreaInsets()
  const [isRecording, setIsRecording] = useState(false)
  const [recording, setRecording] = useState<Audio.Recording | null>(null)

  // Message interaction states
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)
  const [showMessageMenu, setShowMessageMenu] = useState(false)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)

  useEffect(() => {
    if (chatRoomId && authUser && !authLoading) {
      setCurrentUser(authUser)
      loadParticipantAliases()
      loadMessages()
      subscribeToMessages()
    }
  }, [chatRoomId, authUser, authLoading])

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
      // TODO: Add API endpoint to get chat participants
      // For now, use a simple mapping based on current user
      const mapping: Record<string, string> = {}

      // Mark current user as "You"
      if (authUser?.id) {
        mapping[authUser.id] = 'You'
      }

      setParticipantAliases(mapping)
      Logger.info('chat', 'Participant aliases initialized')
    } catch (error) {
      Logger.error('chat', 'Error loading participant aliases', { error })
    }
  }

  // getCurrentUser is now handled by useAuth hook - user is set from authUser in useEffect

  const loadMessages = async () => {
    try {
      if (!authUser) {
        Logger.warn('chat', 'No authenticated user found')
        return
      }

      Logger.info('chat', `Loading messages for room: ${chatRoomId}`)

      // Use API to get chat messages
      const result = await apiClient.getChatMessages(chatRoomId as string, { limit: 100 })

      if (!result.success || !result.data) {
        Logger.error('chat', 'Error loading messages', { error: result.error })
        Alert.alert('Error', 'Failed to load messages')
        return
      }

      Logger.info('chat', `Successfully loaded ${result.data.length || 0} messages`)

      // Transform data and apply anonymous aliases
      const transformedMessages = (result.data || []).map((msg: any) => {
        const senderId = msg.sender_id || msg.senderId || msg.user_id || msg.userId
        const alias = senderId === 'system'
          ? 'System'
          : senderId === authUser?.id
            ? 'You'
            : (participantAliases[senderId] || msg.sender_name || msg.senderName || 'Attendee')
        return {
          message_id: msg.id || msg.message_id,
          sender_id: senderId,
          sender_name: alias,
          message_text: msg.message_text || msg.content || msg.text || '',
          message_type: msg.message_type || msg.type || 'text',
          reply_to_message_id: msg.reply_to_message_id || msg.replyToMessageId || null,
          is_edited: msg.is_edited || msg.isEdited || false,
          created_at: msg.created_at || msg.createdAt,
          replyTo: undefined as Message | undefined
        }
      })

      // Link reply messages
      const messagesWithReplies = transformedMessages.map(msg => ({
        ...msg,
        replyTo: msg.reply_to_message_id ? transformedMessages.find(m => m.message_id === msg.reply_to_message_id) : undefined
      }))

      // Messages should be in chronological order (oldest first)
      setMessages(messagesWithReplies)
      setTimeout(() => scrollToBottom(), 100)
    } catch (error) {
      Logger.error('chat', 'Unexpected error loading messages', { error })
    } finally {
      setLoading(false)
    }
  }

  const subscribeToMessages = () => {
    // TODO: Real-time subscriptions will use Socket.io instead of Supabase
    // For now, messages are loaded on mount and after sending
    Logger.info('chat', `Real-time subscription placeholder for room: ${chatRoomId}`)

    return () => {
      Logger.info('chat', 'Cleaning up subscription placeholder')
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
      Logger.info('chat', `Sending message to room: ${chatRoomId}`)

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

      // Use API to send message
      const result = await apiClient.sendChatMessage(chatRoomId as string, messageText, 'text')

      if (!result.success) {
        Logger.error('chat', 'Error sending message', { error: result.error })
        Alert.alert('Error', 'Failed to send message')
        throw new Error(result.error || 'Failed to send message')
      }

      Logger.info('chat', 'Message sent successfully')

      // Update the optimistic message with real ID from server if available
      if (result.data?.id) {
        setMessages(prev => prev.map(msg =>
          msg.message_id === optimisticMessage!.message_id
            ? { ...msg, message_id: result.data.id }
            : msg
        ))
      }
    } catch (error) {
      Logger.error('chat', 'Unexpected error sending message', { error })

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
            {item.message_type === 'text' && (
              <Text style={[
                styles.messageText,
                isMyMessage ? styles.myMessageText : styles.otherMessageText
              ]}>
                {item.message_text}
              </Text>
            )}
            {item.message_type === 'image' && (
              <OptimizedImage
                source={item.message_text}
                style={{ width: 220, height: 160, borderRadius: 14 }}
                contentFit="cover"
              />
            )}
            {item.message_type === 'audio' && (
              <VoiceNote uri={item.message_text} />
            )}
            {item.message_type !== 'text' && item.message_type !== 'image' && item.message_type !== 'audio' && (
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
          <TouchableOpacity
            style={styles.inputIcon}
            onPress={async () => {
              if (!currentUser || sending || isLoading) return
              try {
                const picked = await pickImage('library')
                if (!picked || !picked.assets || picked.assets.length === 0) return
                const asset = picked.assets[0]
                const result = await uploadPhoto(asset.uri, currentUser.id, `gc_${chatRoomId}_${Date.now()}.jpg`, 'chat-media')
                if (result.success && (result.url || result.path)) {
                  await apiClient.sendChatMessage(chatRoomId as string, result.url || result.path, 'image')
                } else {
                  Alert.alert('Upload failed', result.error || 'Could not upload image')
                }
              } catch (e: any) {
                Alert.alert('Error', e?.message || 'Failed to send image')
              }
            }}
          >
            <Ionicons name="attach" size={22} color="#CFCFCF" />
          </TouchableOpacity>
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
            style={styles.inputIcon}
            onPress={async () => {
              if (!currentUser || sending || isLoading) return
              try {
                const picked = await pickImage('camera')
                if (!picked || !picked.assets || picked.assets.length === 0) return
                const asset = picked.assets[0]
                const result = await uploadPhoto(asset.uri, currentUser.id, `gc_${chatRoomId}_${Date.now()}.jpg`, 'chat-media')
                if (result.success && (result.url || result.path)) {
                  await apiClient.sendChatMessage(chatRoomId as string, result.url || result.path, 'image')
                } else {
                  Alert.alert('Upload failed', result.error || 'Could not upload image')
                }
              } catch (e: any) {
                Alert.alert('Error', e?.message || 'Failed to send image')
              }
            }}
          >
            <Ionicons name="camera" size={22} color="#CFCFCF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.inputIcon}
            onPress={async () => {
              if (!currentUser || isLoading) return
              if (isRecording) {
                try {
                  await recording?.stopAndUnloadAsync()
                  const uri = recording ? recording.getURI() : null
                  setIsRecording(false)
                  setRecording(null)
                  if (uri && currentUser) {
                    // TODO: Voice note upload needs storage API implementation
                    // For now, show a message that this feature is coming soon
                    Alert.alert('Coming Soon', 'Voice note upload will be available soon')
                  }
                } catch (e: any) {
                  setIsRecording(false)
                  setRecording(null)
                }
              } else {
                try {
                  const { status } = await Audio.requestPermissionsAsync()
                  if (status !== 'granted') {
                    Alert.alert('Permission required', 'Microphone access is needed to record voice notes')
                    return
                  }
                  await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true })
                  const rec = new Audio.Recording()
                  await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
                  await rec.startAsync()
                  setRecording(rec)
                  setIsRecording(true)
                } catch (e: any) {
                  Alert.alert('Error', e?.message || 'Failed to start recording')
                }
              }
            }}
          >
            <Ionicons name={isRecording ? 'stop' : 'mic'} size={22} color="#CFCFCF" />
          </TouchableOpacity>
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

// Simple inline voice note player (mirrors private chat)
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
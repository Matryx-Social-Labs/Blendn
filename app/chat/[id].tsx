import { Ionicons } from '@expo/vector-icons'
import * as FileSystem from 'expo-file-system'
import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Clipboard,
  Easing,
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
import ActionTray, { type ActionTrayButton } from '../../components/ActionTray'
import AppHeader from '../../components/AppHeader'
import ScalePress from '../../components/motion/ScalePress'
import OptimizedImage from '../../components/OptimizedImage'
import { SkeletonBlock, SkeletonCircle, SkeletonLine } from '../../components/Skeleton'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { pickImage, uploadPhoto } from '../../lib/photoUtils'
import queryCache from '../../lib/queryCache'
import { emitChatListUpdate } from '../../lib/chatListUpdates'
import { markDomainsDirty } from '../../lib/liveSyncState'
import { subscribeToChat, startTyping, stopTyping, ChatMessageCallback, ChatTypingCallback } from '../../lib/socketClient'
import { APP_COLORS } from '../../lib/theme'
import { useMinimumVisible } from '../../lib/useMinimumVisible'
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

const MESSAGES_CACHE_TTL = 60 * 1000
const MESSAGES_BACKGROUND_REFRESH_THROTTLE_MS = 15 * 1000

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
  const insets = useSafeAreaInsets()

  // Message interaction states
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)
  const [showMessageMenu, setShowMessageMenu] = useState(false)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [trayVisible, setTrayVisible] = useState(false)
  const [trayTitle, setTrayTitle] = useState('')
  const [trayMessage, setTrayMessage] = useState('')
  const [trayButtons, setTrayButtons] = useState<ActionTrayButton[]>([])
  const [composerExpanded, setComposerExpanded] = useState(false)
  const [composerHeight, setComposerHeight] = useState(64)
  const [typingBarHeight, setTypingBarHeight] = useState(34)
  const [replyBarHeight, setReplyBarHeight] = useState(56)

  // Typing indicator states
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map())
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const typingCleanupRefs = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const lastMessagesFetchRef = useRef(0)
  const contentOpacity = useRef(new Animated.Value(0)).current
  const contentTranslate = useRef(new Animated.Value(8)).current
  const typingIndicatorAnim = useRef(new Animated.Value(0)).current
  const composerAnim = useRef(new Animated.Value(0)).current
  const sendPulseAnim = useRef(new Animated.Value(0)).current
  const messagesCacheKey = React.useMemo(
    () => (chatRoomId ? `chat_messages_${chatRoomId}` : null),
    [chatRoomId]
  )

  const closeTray = () => setTrayVisible(false)

  const showTray = (title: string, message: string, buttons?: ActionTrayButton[]) => {
    setTrayTitle(title)
    setTrayMessage(message)
    setTrayButtons(buttons && buttons.length > 0 ? buttons : [{ label: 'Done', variant: 'primary', onPress: closeTray }])
    setTrayVisible(true)
  }

  useEffect(() => {
    if (chatRoomId && authUser && !authLoading) {
      setCurrentUser(authUser)
      loadMessages(false, true)
    }
  }, [chatRoomId, authUser, authLoading])

  // Socket subscription in separate effect for proper cleanup
  useEffect(() => {
    if (!chatRoomId || !currentUser) return
    const cleanup = subscribeToMessages()
    return cleanup
  }, [chatRoomId, currentUser])

  useEffect(() => {
    if (loading) return
    contentOpacity.setValue(0)
    contentTranslate.setValue(6)
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(contentTranslate, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()
  }, [loading, contentOpacity, contentTranslate])

  useEffect(() => {
    Animated.timing(typingIndicatorAnim, {
      toValue: typingUsers.size > 0 ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start()
  }, [typingUsers.size, typingIndicatorAnim])

  useEffect(() => {
    Animated.timing(composerAnim, {
      toValue: composerExpanded ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start()
  }, [composerExpanded, composerAnim])

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

  const loadMessages = async (force = false, refreshEvenIfCached = false) => {
    try {
      if (!authUser) {
        Logger.warn('chat', 'No authenticated user found')
        return
      }

      const now = Date.now()
      if (!force && messagesCacheKey) {
        const cached = queryCache.get<Message[]>(messagesCacheKey)
        if (cached) {
          setMessages(cached)
          setLoading(false)
          setTimeout(() => scrollToBottom(), 100)
          if (!refreshEvenIfCached || now - lastMessagesFetchRef.current <= MESSAGES_BACKGROUND_REFRESH_THROTTLE_MS) {
            return
          }
        }
      }

      Logger.info('chat', `Loading messages for room: ${chatRoomId}`)
      lastMessagesFetchRef.current = now

      // Use API to get chat messages
      const result = await apiClient.getChatMessages(chatRoomId as string, { limit: 100 })

      if (!result.success || !result.data) {
        Logger.error('chat', 'Error loading messages', { error: result.error })
        showTray('Error', 'Failed to load messages.')
        return
      }

      const rawMessages = Array.isArray(result.data)
        ? result.data
        : (result.data as any)?.messages || (result.data as any)?.data || []

      if (!Array.isArray(rawMessages)) {
        Logger.warn('chat', 'Unexpected chat messages payload shape', { data: result.data })
      }

      Logger.info('chat', `Successfully loaded ${Array.isArray(rawMessages) ? rawMessages.length : 0} messages`)

      // Transform data — server now returns anonymous names, only override for current user
      const transformedMessages = (Array.isArray(rawMessages) ? rawMessages : []).map((msg: any) => {
        const senderId = msg.sender_id || msg.senderId || msg.user_id || msg.userId
        const serverName = msg.user?.name || msg.sender_name || msg.senderName || 'Attendee'
        const displayName = senderId === 'system'
          ? 'System'
          : senderId === authUser?.id
            ? 'You'
            : serverName
        return {
          message_id: msg.id || msg.message_id,
          sender_id: senderId,
          sender_name: displayName,
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
      if (messagesCacheKey) {
        queryCache.set(messagesCacheKey, messagesWithReplies, MESSAGES_CACHE_TTL)
      }
      setTimeout(() => scrollToBottom(), 100)
    } catch (error) {
      Logger.error('chat', 'Unexpected error loading messages', { error })
    } finally {
      setLoading(false)
    }
  }

  // Keep cache warm as messages update in real time
  useEffect(() => {
    if (messagesCacheKey) {
      queryCache.set(messagesCacheKey, messages, MESSAGES_CACHE_TTL)
    }
  }, [messages, messagesCacheKey])

  const subscribeToMessages = () => {
    if (!chatRoomId) return () => {}

    Logger.info('chat', `Subscribing to chat room: ${chatRoomId}`)

    // Subscribe to real-time chat messages via Socket.io
    const handleNewMessage: ChatMessageCallback = (data) => {
      Logger.debug('chat', 'Received new message via socket', { messageId: data.message.id })

      const newMsg: Message = {
        message_id: data.message.id,
        sender_id: data.message.userId,
        sender_name: data.message.userId === currentUser?.id ? 'You' : (data.message.userName || 'Attendee'),
        message_text: data.message.content,
        message_type: data.message.type || 'text',
        reply_to_message_id: data.message.parentId || null,
        is_edited: false,
        created_at: data.message.createdAt,
      }

      setMessages(prev => {
        // Avoid duplicates
        if (prev.some(m => m.message_id === newMsg.message_id)) return prev
        return [...prev, newMsg]
      })

      // Clear typing indicator for sender when they send a message
      setTypingUsers(prev => {
        if (!prev.has(data.message.userId)) return prev
        const next = new Map(prev)
        next.delete(data.message.userId)
        return next
      })

      setTimeout(() => scrollToBottom(), 100)
    }

    // Subscribe to typing indicators
    const handleTyping: ChatTypingCallback = (data) => {
      if (data.userId === currentUser?.id) return // Ignore our own typing

      setTypingUsers(prev => {
        const next = new Map(prev)
        if (data.isTyping) {
          next.set(data.userId, data.userName)
          // Auto-clear typing after 3 seconds (in case stopTyping is missed)
          const existingTimeout = typingCleanupRefs.current.get(data.userId)
          if (existingTimeout) clearTimeout(existingTimeout)
          const timeout = setTimeout(() => {
            setTypingUsers(p => {
              const n = new Map(p)
              n.delete(data.userId)
              return n
            })
            typingCleanupRefs.current.delete(data.userId)
          }, 3000)
          typingCleanupRefs.current.set(data.userId, timeout)
        } else {
          next.delete(data.userId)
          const existingTimeout = typingCleanupRefs.current.get(data.userId)
          if (existingTimeout) {
            clearTimeout(existingTimeout)
            typingCleanupRefs.current.delete(data.userId)
          }
        }
        return next
      })
    }

    const unsubMessage = subscribeToChat(String(chatRoomId), handleNewMessage)
    const unsubTyping = subscribeToChat(String(chatRoomId), handleTyping)

    return () => {
      Logger.info('chat', 'Cleaning up chat subscription')
      unsubMessage()
      unsubTyping()
      // Clear all typing cleanup timeouts
      typingCleanupRefs.current.forEach(timeout => clearTimeout(timeout))
      typingCleanupRefs.current.clear()
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
    showTray(
      'Report message',
      'Are you sure you want to report this message?',
      [
        {
          label: 'Cancel',
          onPress: closeTray,
        },
        {
          label: 'Report',
          variant: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
            setShowMessageMenu(false)
            setSelectedMessage(null)
            closeTray()
          },
        },
      ]
    )
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || !currentUser) return

    // Stop typing indicator when sending
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    if (chatRoomId) stopTyping(String(chatRoomId))

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

      // Instantly update the chat tab list so swiping back shows the message
      emitChatListUpdate({
        type: 'group',
        chatGroupId: String(chatRoomId),
        lastMessage: messageText,
        lastMessageTime: optimisticMessage.created_at,
        senderName: 'You',
      })

      // Use API to send message
      const result = await apiClient.sendChatMessage(chatRoomId as string, messageText, 'text')

      if (!result.success) {
        Logger.error('chat', 'Error sending message', { error: result.error })
        showTray('Error', 'Failed to send message.')
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

      // Mark chat domain dirty so the chat tab refreshes when the user navigates back
      markDomainsDirty(['chat'])

      sendPulseAnim.setValue(0)
      Animated.sequence([
        Animated.timing(sendPulseAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(sendPulseAnim, { toValue: 0, duration: 140, useNativeDriver: true }),
      ]).start()
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
        showTray('Error', 'Something went wrong.')
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

    // Announcement messages — centered banner, amber
    if (item.message_type === 'announcement') {
      return (
        <View style={styles.announcementContainer}>
          <View style={styles.announcementBubble}>
            <Text style={styles.announcementLabel}>📢 Announcement</Text>
            <Text style={styles.announcementText}>{item.message_text}</Text>
            <Text style={styles.announcementTime}>{formatMessageTime(item.created_at)}</Text>
          </View>
        </View>
      )
    }

    // Sponsored messages — centered banner, blue
    if (item.message_type === 'sponsored') {
      return (
        <View style={styles.announcementContainer}>
          <View style={styles.sponsoredBubble}>
            <Text style={styles.announcementLabel}>📣 Sponsored</Text>
            <Text style={styles.announcementText}>{item.message_text}</Text>
            <Text style={styles.announcementTime}>{formatMessageTime(item.created_at)}</Text>
          </View>
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
                width={220}
                height={160}
              />
            )}
            {item.message_type !== 'text' && item.message_type !== 'image' && (
              <Text style={[
                styles.messageText,
                isMyMessage ? styles.myMessageText : styles.otherMessageText
              ]}>
                {item.message_text}
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
  const showLoadingSkeleton = useMinimumVisible(isLoading, 650)
  const typingHeight = typingIndicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 34],
  })
  const typingOpacity = typingIndicatorAnim
  const typingTranslate = typingIndicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [6, 0],
  })
  const attachmentOpacity = composerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.74, 1],
  })
  const attachmentLift = composerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -2],
  })
  const sendScale = sendPulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  })
  const messageListBottomInset = composerHeight
    + (typingUsers.size > 0 ? typingBarHeight : 0)
    + (replyingTo ? replyBarHeight : 0)
    + insets.bottom
    + 8

  const renderConversationEmpty = () => (
    <Animated.View style={[styles.emptyNarrative, { opacity: contentOpacity, transform: [{ translateY: contentTranslate }] }]}>
      <Text style={styles.emptyNarrativeTitle}>Start the room conversation</Text>
      <Text style={styles.emptyNarrativeText}>
        Be the first to post a message so everyone checked in can join.
      </Text>
      <ScalePress
        style={styles.emptyNarrativeCta}
        onPress={() => {
          setNewMessage('Hey everyone 👋')
          setComposerExpanded(true)
        }}
        pressedScale={0.98}
      >
        <Text style={styles.emptyNarrativeCtaText}>Send a starter message</Text>
      </ScalePress>
    </Animated.View>
  )

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
      <StatusBar style="light" backgroundColor={APP_COLORS.backgroundBase} />
      <LinearGradient
        colors={['#111214', APP_COLORS.backgroundBase]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Gradient top inset to fill the status bar area on iOS */}
      <LinearGradient
        colors={['#111214', APP_COLORS.backgroundBase]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ height: insets.top, position: 'absolute', top: 0, left: 0, right: 0 }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {renderHeader()}

        {showLoadingSkeleton ? (
          renderLoadingSkeleton()
        ) : (
          <Animated.View style={{ flex: 1, opacity: contentOpacity, transform: [{ translateY: contentTranslate }] }}>
            <FlatList
              ref={flatListRef}
              data={chatItems}
              renderItem={renderChatItem}
              keyExtractor={(item) => item.kind === 'separator' ? item.id : item.message_id}
              style={styles.messagesList}
              contentContainerStyle={[
                styles.messagesContainer,
                { paddingBottom: messageListBottomInset },
                messages.length === 0 && styles.emptyNarrativeContainer,
              ]}
              onContentSizeChange={scrollToBottom}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={renderConversationEmpty}
            />
          </Animated.View>
        )}

        {/* Typing indicator */}
        <Animated.View style={{ height: typingHeight, opacity: typingOpacity, transform: [{ translateY: typingTranslate }], overflow: 'hidden' }}>
          <View
            style={styles.typingContainer}
            onLayout={(e) => {
              const h = Math.round(e.nativeEvent.layout.height)
              if (h > 0 && h !== typingBarHeight) setTypingBarHeight(h)
            }}
          >
            <Text style={styles.typingText}>
              {Array.from(typingUsers.values()).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
            </Text>
          </View>
        </Animated.View>

        {/* Reply indicator above input */}
        {replyingTo && (
          <View
            style={styles.replyInputContainer}
            onLayout={(e) => {
              const h = Math.round(e.nativeEvent.layout.height)
              if (h > 0 && h !== replyBarHeight) setReplyBarHeight(h)
            }}
          >
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

        <View
          style={styles.inputContainer}
          onLayout={(e) => {
            const h = Math.round(e.nativeEvent.layout.height)
            if (h > 0 && h !== composerHeight) setComposerHeight(h)
          }}
        >
          <View style={styles.composerShell}>
            <Animated.View style={{ opacity: attachmentOpacity, transform: [{ translateY: attachmentLift }] }}>
              <ScalePress
                style={styles.inputIcon}
                onPress={async () => {
                  if (!currentUser || sending || isLoading) return
                  try {
                    const picked = await pickImage('library')
                    if (!picked || !picked.assets || picked.assets.length === 0) return
                    const asset = picked.assets[0]
                    const result = await uploadPhoto(asset.uri, currentUser.id, `gc_${chatRoomId}_${Date.now()}.jpg`, 'chat')
                    if (result.success && (result.url || result.path)) {
                      await apiClient.sendChatMessage(chatRoomId as string, (result.url || result.path)!, 'image')
                    } else {
                      showTray('Upload failed', result.error || 'Could not upload image.')
                    }
                  } catch (e: any) {
                    showTray('Error', e?.message || 'Failed to send image.')
                  }
                }}
                pressedScale={0.93}
              >
                <Ionicons name="attach" size={20} color="#CFCFCF" />
              </ScalePress>
            </Animated.View>
            <TextInput
              style={styles.textInput}
              value={newMessage}
              onChangeText={(text) => {
                setNewMessage(text)
                setComposerExpanded(text.length > 0)
                if (text.length > 0 && chatRoomId) {
                  startTyping(String(chatRoomId))
                  if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
                  typingTimeoutRef.current = setTimeout(() => {
                    stopTyping(String(chatRoomId))
                  }, 2000)
                } else if (text.length === 0 && chatRoomId) {
                  if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
                  stopTyping(String(chatRoomId))
                }
              }}
              placeholder="Message..."
              placeholderTextColor="rgba(255,255,255,0.52)"
              multiline
              maxLength={1000}
              onSubmitEditing={sendMessage}
              blurOnSubmit={false}
              onFocus={() => {
                setComposerExpanded(true)
                setTimeout(scrollToBottom, 90)
              }}
              onBlur={() => setComposerExpanded(newMessage.trim().length > 0)}
            />
            <Animated.View style={{ opacity: attachmentOpacity, transform: [{ translateY: attachmentLift }] }}>
              <ScalePress
                style={styles.inputIcon}
                onPress={async () => {
                  if (!currentUser || sending || isLoading) return
                  try {
                    const picked = await pickImage('camera')
                    if (!picked || !picked.assets || picked.assets.length === 0) return
                    const asset = picked.assets[0]
                    const result = await uploadPhoto(asset.uri, currentUser.id, `gc_${chatRoomId}_${Date.now()}.jpg`, 'chat')
                    if (result.success && (result.url || result.path)) {
                      await apiClient.sendChatMessage(chatRoomId as string, (result.url || result.path)!, 'image')
                    } else {
                      showTray('Upload failed', result.error || 'Could not upload image.')
                    }
                  } catch (e: any) {
                    showTray('Error', e?.message || 'Failed to send image.')
                  }
                }}
                pressedScale={0.93}
              >
                <Ionicons name="camera" size={20} color="#CFCFCF" />
              </ScalePress>
            </Animated.View>
          </View>
          <Animated.View style={{ transform: [{ scale: sendScale }] }}>
          <ScalePress
            style={[
              styles.sendButton,
              ((!newMessage.trim() || sending || isLoading) && styles.sendButtonDisabled)
            ]}
            onPress={sendMessage}
            disabled={!newMessage.trim() || sending || isLoading}
            pressedScale={0.96}
          >
            {sending ? (
              <Text style={styles.sendButtonText}>…</Text>
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </ScalePress>
          </Animated.View>
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
      <ActionTray
        visible={trayVisible}
        title={trayTitle}
        message={trayMessage}
        buttons={trayButtons}
        onClose={closeTray}
      />
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
  emptyNarrativeContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyNarrative: {
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyNarrativeTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyNarrativeText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyNarrativeCta: {
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  emptyNarrativeCtaText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
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
  // Announcement / Sponsored banner styles
  announcementContainer: {
    alignItems: 'center',
    marginVertical: 6,
    paddingHorizontal: 16,
  },
  announcementBubble: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: '100%',
  },
  sponsoredBubble: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: '100%',
  },
  announcementLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F59E0B',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  announcementText: {
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 20,
  },
  announcementTime: {
    fontSize: 11,
    color: '#B5B5B5',
    marginTop: 4,
    textAlign: 'right',
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
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(10,10,12,0.78)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.16)',
    gap: 8,
  },
  composerShell: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  inputIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
  },
  textInput: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    maxHeight: 100,
    fontSize: 15,
    color: '#FFFFFF',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: APP_COLORS.accent,
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

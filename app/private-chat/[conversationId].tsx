import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
    ActivityIndicator,
    Animated,
    Easing,
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
import ActionTray, { type ActionTrayButton } from '../../components/ActionTray'
import AppHeader from '../../components/AppHeader'
import ScalePress from '../../components/motion/ScalePress'
import OptimizedImage from '../../components/OptimizedImage'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { showMessageReportOptions, showUserSafetyActions } from '../../lib/safetyUtils'
import { emitChatListUpdate } from '../../lib/chatListUpdates'
import { markDomainsDirty } from '../../lib/liveSyncState'
import { subscribeToConversation, startPrivateTyping, stopPrivateTyping, markPrivateMessagesRead, PrivateMessageCallback, PrivateTypingCallback, PrivateReadCallback } from '../../lib/socketClient'
import { APP_COLORS } from '../../lib/theme'
import { useMinimumVisible } from '../../lib/useMinimumVisible'
import { useLiveSync } from '../../lib/useLiveSync'
import RealtimeStatusBanner from '../../components/RealtimeStatusBanner'
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
  const typingActiveSentRef = useRef(false)
  const otherTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isAtBottomRef = useRef(true)
  const [hasMore, setHasMore] = useState(false)
  const [oldestCursor, setOldestCursor] = useState<string | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const [trayVisible, setTrayVisible] = useState(false)
  const [trayTitle, setTrayTitle] = useState('')
  const [trayMessage, setTrayMessage] = useState('')
  const [trayButtons, setTrayButtons] = useState<ActionTrayButton[]>([])
  const [composerExpanded, setComposerExpanded] = useState(false)
  const [composerHeight, setComposerHeight] = useState(62)
  const [typingBarHeight, setTypingBarHeight] = useState(32)
  const contentOpacity = useRef(new Animated.Value(0)).current
  const contentTranslate = useRef(new Animated.Value(8)).current
  const typingAnim = useRef(new Animated.Value(0)).current
  const composerAnim = useRef(new Animated.Value(0)).current
  const sendPulseAnim = useRef(new Animated.Value(0)).current
  const showLoadingSkeleton = useMinimumVisible(loading, 650)

  const closeTray = () => setTrayVisible(false)
  const showTray = (title: string, message: string, buttons?: ActionTrayButton[]) => {
    setTrayTitle(title)
    setTrayMessage(message)
    setTrayButtons(buttons && buttons.length > 0 ? buttons : [{ label: 'Done', variant: 'primary', onPress: closeTray }])
    setTrayVisible(true)
  }

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
    Animated.timing(typingAnim, {
      toValue: isOtherTyping ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start()
  }, [isOtherTyping, typingAnim])

  useEffect(() => {
    Animated.timing(composerAnim, {
      toValue: composerExpanded ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start()
  }, [composerExpanded, composerAnim])

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
      showTray('Error', 'Failed to load conversation.')
    } finally {
      setLoading(false)
    }
  }

  const loadMessages = async (cursor?: string) => {
    try {
      Logger.info('private-chat', 'Loading messages', { conversationId, cursor })
      const result = await apiClient.getConversationMessages(String(conversationId), { limit: 50, before: cursor })

      if (result.success && result.data) {
        // Messages come in reverse order (newest first), reverse for display
        const msgs = result.data.messages.map(mapMessage).reverse()
        if (cursor) {
          // Prepend older messages, preserving scroll position
          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id))
            const newOnes = msgs.filter(m => !existingIds.has(m.id))
            return [...newOnes, ...prev]
          })
        } else {
          setMessages(msgs)
          if (isAtBottomRef.current) setTimeout(scrollToBottom, 100)
        }
        setHasMore(result.data.hasMore)
        setOldestCursor(result.data.nextCursor)
        Logger.info('private-chat', `Loaded ${msgs.length} messages, hasMore=${result.data.hasMore}`)
      } else {
        Logger.error('private-chat', 'Failed to load messages', { error: result.error })
      }

      // Mark as read on initial load only
      if (conversationId && !cursor) {
        setConversationLastRead(String(conversationId)).catch(() => {})
      }
    } catch (error) {
      Logger.error('private-chat', 'Failed to load messages', { error })
    }
  }

  const loadOlderMessages = async () => {
    if (loadingOlder || !hasMore || !oldestCursor) return
    setLoadingOlder(true)
    try {
      await loadMessages(oldestCursor)
    } finally {
      setLoadingOlder(false)
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

      if (isAtBottomRef.current) setTimeout(scrollToBottom, 100)
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

  useEffect(() => {
    if (!conversationId) return
    const cleanup = subscribeToMessages()
    return cleanup
  }, [conversationId, subscribeToMessages])

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

    // Instantly update the chat tab list (before API call) so swiping back shows the message
    emitChatListUpdate({
      type: 'personal',
      conversationId: String(conversationId),
      lastMessage: messageText,
      lastMessageTime: new Date().toISOString(),
    })

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
        // Mark chat domain dirty so the chat tab refreshes when the user navigates back
        markDomainsDirty(['chat'])
        setTimeout(scrollToBottom, 100)
        sendPulseAnim.setValue(0)
        Animated.sequence([
          Animated.timing(sendPulseAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
          Animated.timing(sendPulseAnim, { toValue: 0, duration: 140, useNativeDriver: true }),
        ]).start()
      } else {
        Logger.error('private-chat', 'Failed to send message', { error: result.error })
        showTray('Error', 'Failed to send message. Please try again.')
        setNewMessage(messageText) // Restore message
      }
    } catch (error) {
      Logger.error('private-chat', 'Failed to send message', { error })
      showTray('Error', 'Failed to send message. Please try again.')
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
        showTray(
          'Message options',
          'What would you like to do with this message?',
          [
            {
              label: 'Cancel',
              onPress: closeTray,
            },
            {
              label: 'Report Message',
              variant: 'destructive',
              onPress: () => {
                closeTray()
                showMessageReportOptions(item.id, 'private')
              }
            }
          ]
        )
      }
    }

    // Check for media
    const hasImage = item.mediaType === 'image' && item.mediaUrl
    const hasVideo = item.mediaType === 'video' && item.mediaUrl

    return (
      <TouchableOpacity
        style={[styles.messageRow, isCurrentUser ? styles.myRow : styles.otherRow]}
        onLongPress={handleMessageLongPress}
        delayLongPress={500}
        activeOpacity={0.7}
      >
        {!isCurrentUser && (
          item.sender?.image ? (
            <OptimizedImage
              source={item.sender.image}
              style={styles.avatar as any}
              width={32}
              height={32}
              contentFit="cover"
            />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials(String(item.sender?.name || otherUserName || 'User'))}</Text>
            </View>
          )
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
                width={220}
                height={160}
              />
            ) : hasVideo ? (
              <Text style={[
                styles.messageText,
                isCurrentUser ? styles.myMessageText : styles.otherMessageText
              ]}>
                Video message
              </Text>
            ) : (
              <Text style={[
                styles.messageText,
                isCurrentUser ? styles.myMessageText : styles.otherMessageText
              ]}>
                {item.text || ''}
              </Text>
            )}
          </View>
          <View style={styles.messageFooter}>
            <Text style={[
              styles.messageTime,
              isCurrentUser ? styles.myMessageTime : styles.otherMessageTime
            ]}>
              {formatTime(item.createdAt)}
            </Text>
            {isCurrentUser && (
              <Text style={[styles.readTick, item.isRead && styles.readTickSeen]}>
                {item.isRead ? ' ✓✓' : ' ✓'}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  const renderEmptyState = () => (
    <Animated.View style={[styles.emptyContainer, { opacity: contentOpacity, transform: [{ translateY: contentTranslate }] }]}>
      <Text style={styles.emptyIcon}>Message</Text>
      <Text style={styles.emptyTitle}>Start the conversation!</Text>
      <Text style={styles.emptyText}>
        You matched with {otherUserName}. Say hi and break the ice!
      </Text>
      <ScalePress
        style={styles.emptyCta}
        onPress={() => {
          setNewMessage('Hey 👋')
          setComposerExpanded(true)
        }}
        pressedScale={0.98}
      >
        <Text style={styles.emptyCtaText}>Send a wave</Text>
      </ScalePress>
    </Animated.View>
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

  const socketStatus = useLiveSync({
    enabled: !!authUser && !!conversationId,
    onSync: () => loadMessages(),
    domains: ['chat'],
    syncOnReconnect: true,
    disconnectedIntervalMs: 15000,
  })

  if (showLoadingSkeleton) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
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
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B6B" />
          <Text style={styles.loadingText}>Loading conversation...</Text>
        </View>
      </SafeAreaView>
    )
  }

  const typingHeight = typingAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 32],
  })
  const typingOpacity = typingAnim
  const typingTranslate = typingAnim.interpolate({
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
  const messageListBottomInset = composerHeight + (isOtherTyping ? typingBarHeight : 0) + insets.bottom + 8

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
                showTray('Coming soon', 'User profile view will be available soon.')
              }
            },
            accessibilityLabel: 'Safety options',
          }}
        />
        <RealtimeStatusBanner status={socketStatus} style={styles.realtimeBanner} />

        {/* Messages */}
        {messages.length === 0 ? (
          <Animated.View style={[styles.messagesContainer, styles.emptyListContainer, { opacity: contentOpacity, transform: [{ translateY: contentTranslate }] }]}>
            {renderEmptyState()}
          </Animated.View>
        ) : (
          <Animated.View style={{ flex: 1, opacity: contentOpacity, transform: [{ translateY: contentTranslate }] }}>
            <FlatList
              ref={flatListRef}
              data={chatItems}
              keyExtractor={(item) => item.kind === 'separator' ? item.id : item.id}
              renderItem={renderChatItem}
              style={styles.messagesList}
              contentContainerStyle={[styles.messagesContainer, { paddingBottom: messageListBottomInset }]}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => { if (isAtBottomRef.current) scrollToBottom() }}
              keyboardShouldPersistTaps="handled"
              maxToRenderPerBatch={10}
              updateCellsBatchingPeriod={50}
              removeClippedSubviews={Platform.OS === 'android'}
              windowSize={10}
              initialNumToRender={20}
              onScroll={(e) => {
                const offsetFromBottom =
                  e.nativeEvent.contentSize.height -
                  e.nativeEvent.contentOffset.y -
                  e.nativeEvent.layoutMeasurement.height
                const atBottom = offsetFromBottom < 100
                isAtBottomRef.current = atBottom
                setShowScrollToBottom(!atBottom)
              }}
              scrollEventThrottle={100}
              ListHeaderComponent={hasMore ? (
                <TouchableOpacity
                  style={styles.loadMoreButton}
                  onPress={loadOlderMessages}
                  disabled={loadingOlder}
                >
                  {loadingOlder
                    ? <Text style={styles.loadMoreText}>Loading...</Text>
                    : <Text style={styles.loadMoreText}>↑ Load older messages</Text>
                  }
                </TouchableOpacity>
              ) : null}
            />
          </Animated.View>
        )}

        {showScrollToBottom && (
          <TouchableOpacity
            style={[styles.scrollToBottomBtn, { bottom: messageListBottomInset + 8 }]}
            onPress={scrollToBottom}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-down" size={20} color="#fff" />
          </TouchableOpacity>
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
              {otherUserName || 'User'} is typing...
            </Text>
          </View>
        </Animated.View>

        {/* Input */}
        <View
          style={styles.inputContainer}
          onLayout={(e) => {
            const h = Math.round(e.nativeEvent.layout.height)
            if (h > 0 && h !== composerHeight) setComposerHeight(h)
          }}
        >
          <View style={styles.composerShell}>
            <Animated.View style={{ opacity: attachmentOpacity, transform: [{ translateY: attachmentLift }] }}>
              <ScalePress style={styles.inputIcon} onPress={() => {
                showTray('Coming soon', 'File attachments will be available soon.')
              }} pressedScale={0.93}>
                <Ionicons name="attach" size={20} color="#CFCFCF" />
              </ScalePress>
            </Animated.View>
            <TextInput
              style={styles.textInput}
              value={newMessage}
              onChangeText={(text) => {
                setNewMessage(text)
                setComposerExpanded(text.length > 0)
                if (text.length > 0 && conversationId) {
                  if (!typingActiveSentRef.current) {
                    startPrivateTyping(String(conversationId))
                    typingActiveSentRef.current = true
                  }
                  if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
                  typingTimeoutRef.current = setTimeout(() => {
                    stopPrivateTyping(String(conversationId))
                    typingActiveSentRef.current = false
                  }, 2000)
                } else if (text.length === 0 && conversationId) {
                  if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
                  stopPrivateTyping(String(conversationId))
                  typingActiveSentRef.current = false
                }
              }}
              placeholder="Message..."
              placeholderTextColor="rgba(255,255,255,0.52)"
              multiline
              maxLength={1000}
              editable={!sending}
              onFocus={() => {
                setComposerExpanded(true)
                setTimeout(scrollToBottom, 90)
              }}
              onBlur={() => setComposerExpanded(newMessage.trim().length > 0)}
            />
            <Animated.View style={{ opacity: attachmentOpacity, transform: [{ translateY: attachmentLift }] }}>
              <ScalePress style={styles.inputIcon} onPress={() => {
                showTray('Coming soon', 'Photo sharing will be available soon.')
              }} pressedScale={0.93}>
                <Ionicons name="camera" size={20} color="#CFCFCF" />
              </ScalePress>
            </Animated.View>
          </View>
          <Animated.View style={{ transform: [{ scale: sendScale }] }}>
          <ScalePress
            style={[
              styles.sendButton,
              (!newMessage.trim() || sending) && styles.sendButtonDisabled
            ]}
            onPress={sendMessage}
            disabled={!newMessage.trim() || sending}
            pressedScale={0.96}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </ScalePress>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
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
    fontSize: 28,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.72)',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    lineHeight: 24,
  },
  emptyCta: {
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  emptyCtaText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
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
  },
  otherMessageTime: {
    color: '#B5B5B5',
    marginLeft: 12,
    marginTop: 4,
    fontSize: 11,
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
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(10,10,12,0.78)',
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
    fontSize: 15,
    maxHeight: 100,
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

  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    marginRight: 12,
  },
  readTick: {
    fontSize: 11,
    color: '#B5B5B5',
  },
  readTickSeen: {
    color: APP_COLORS.accent,
  },
  realtimeBanner: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 2,
  },
  loadMoreButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  loadMoreText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
  },
  scrollToBottomBtn: {
    position: 'absolute',
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: APP_COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
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

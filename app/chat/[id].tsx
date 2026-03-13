import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Clipboard,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ActionTray, { type ActionTrayButton } from '../../components/ActionTray'
import OptimizedImage from '../../components/OptimizedImage'
import ScalePress from '../../components/motion/ScalePress'
import queryCache from '../../lib/queryCache'
import { emitChatListUpdate } from '../../lib/chatListUpdates'
import { markDomainsDirty } from '../../lib/liveSyncState'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { subscribeToChatMessage, subscribeToChatTyping, subscribeToChatReaction, subscribeToChatModeration, startTyping, stopTyping, ChatMessageCallback, ChatTypingCallback, ChatReactionCallback, ChatMessageDeletedCallback, ChatMemberBannedCallback } from '../../lib/socketClient'
import { APP_COLORS } from '../../lib/theme'
import { useLiveSync } from '../../lib/useLiveSync'
import RealtimeStatusBanner from '../../components/RealtimeStatusBanner'
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
  reactions?: Record<string, string[]>
}

type ChatListItem =
  | ({ kind: 'message' } & Message)
  | { kind: 'separator'; id: string; label: string }

let _tempIdCounter = 0
const MESSAGES_CACHE_TTL = 60 * 1000

const toDayKey = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

const formatDayLabel = (iso: string) => {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (same(d, today)) return 'Today'
  if (same(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined })
}

const formatTime = (iso: string) => {
  const d = new Date(iso)
  const now = new Date()
  if (now.getTime() - d.getTime() < 86400000) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const getInitials = (name: string) => {
  const parts = String(name || '?').trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] || '') : '')).toUpperCase() || '?'
}

function GroupChatHeader({ name, imageUrl, subtitle, typingCount, onBack }: {
  name: string
  imageUrl: string | null
  subtitle?: string
  typingCount: number
  onBack: () => void
}) {
  return (
    <View style={headerStyles.container}>
      <Pressable onPress={onBack} style={({ pressed }) => [headerStyles.iconBtn, pressed && headerStyles.pressed]}>
        <Ionicons name="chevron-back" size={24} color="#fff" />
      </Pressable>

      <View style={headerStyles.avatarWrap}>
        {imageUrl ? (
          <OptimizedImage source={imageUrl} style={headerStyles.avatar as any} width={38} height={38} contentFit="cover" />
        ) : (
          <View style={[headerStyles.avatar, headerStyles.avatarGroupFallback]}>
            <Ionicons name="people" size={18} color="#fff" />
          </View>
        )}
      </View>

      <View style={headerStyles.titleArea}>
        <Text style={headerStyles.name} numberOfLines={1}>{name}</Text>
        {typingCount > 0 ? (
          <Text style={headerStyles.typing}>{typingCount === 1 ? 'someone is typing…' : `${typingCount} people typing…`}</Text>
        ) : subtitle ? (
          <Text style={headerStyles.subtitle} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>
    </View>
  )
}

const headerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    gap: 8,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.5 },
  avatarWrap: {},
  avatar: { width: 38, height: 38, borderRadius: 19 },
  avatarGroupFallback: { backgroundColor: '#1A3A5C', alignItems: 'center', justifyContent: 'center' },
  titleArea: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#fff' },
  typing: { fontSize: 12, color: '#4CAF91', marginTop: 1 },
  subtitle: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
})

export default function GroupChat() {
  const { id: chatRoomId, roomName, eventTitle, eventImage } = useLocalSearchParams()
  const { user: authUser, loading: authLoading } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map())
  const [hasMore, setHasMore] = useState(false)
  const [oldestCursor, setOldestCursor] = useState<string | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)
  const [showMessageMenu, setShowMessageMenu] = useState(false)
  const [trayVisible, setTrayVisible] = useState(false)
  const [trayTitle, setTrayTitle] = useState('')
  const [trayMessage, setTrayMessage] = useState('')
  const [trayButtons, setTrayButtons] = useState<ActionTrayButton[]>([])

  const flatListRef = useRef<FlatList>(null)
  const isAtBottomRef = useRef(true)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingActiveSentRef = useRef(false)
  const typingCleanupRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const cacheWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messagesCacheKey = chatRoomId ? `chat_messages_${chatRoomId}` : null

  const closeTray = () => setTrayVisible(false)
  const showTray = (title: string, message: string, buttons?: ActionTrayButton[]) => {
    setTrayTitle(title); setTrayMessage(message)
    setTrayButtons(buttons?.length ? buttons : [{ label: 'Done', variant: 'primary', onPress: closeTray }])
    setTrayVisible(true)
  }

  const scrollToBottom = (animated = true) => {
    flatListRef.current?.scrollToEnd({ animated })
  }

  const transformRawMessages = (raw: any[], userId?: string): Message[] => {
    const list = raw.map((msg: any) => {
      const senderId = msg.sender_id || msg.senderId || msg.user_id || msg.userId
      const serverName = msg.user?.name || msg.sender_name || msg.senderName || 'Attendee'
      return {
        message_id: msg.id || msg.message_id,
        sender_id: senderId,
        sender_name: senderId === 'system' ? 'System' : senderId === userId ? 'You' : serverName,
        message_text: msg.message_text || msg.content || msg.text || '',
        message_type: msg.message_type || msg.type || 'text',
        reply_to_message_id: msg.reply_to_message_id || msg.replyToMessageId || null,
        is_edited: msg.is_edited || msg.isEdited || false,
        created_at: msg.created_at || msg.createdAt,
        replyTo: undefined as Message | undefined,
        reactions: undefined as Record<string, string[]> | undefined,
      }
    })
    return list.map(msg => ({
      ...msg,
      replyTo: msg.reply_to_message_id ? list.find(m => m.message_id === msg.reply_to_message_id) : undefined,
    }))
  }

  const loadMessages = async (force = false, refreshEvenIfCached = false) => {
    try {
      if (!authUser) return

      if (!force && messagesCacheKey) {
        const cached = queryCache.get<Message[]>(messagesCacheKey)
        if (cached) {
          setMessages(cached)
          setLoading(false)
          // Instant jump to bottom when restoring from cache
          setTimeout(() => scrollToBottom(false), 50)
          if (!refreshEvenIfCached) return
        }
      }

      const result = await apiClient.getChatMessages(chatRoomId as string, { limit: 50 })
      if (!result.success || !result.data) { setLoading(false); return }

      const raw = Array.isArray(result.data)
        ? result.data
        : (result.data as any)?.messages || (result.data as any)?.data || []

      const pagination = (result.data as any)?.pagination
      setHasMore(pagination?.hasMore || false)
      setOldestCursor(pagination?.nextCursor || null)

      const msgs = transformRawMessages(Array.isArray(raw) ? raw : [], authUser.id)
      setMessages(msgs)
      if (messagesCacheKey) queryCache.set(messagesCacheKey, msgs, MESSAGES_CACHE_TTL)
      // Scroll to bottom instantly on initial load
      setTimeout(() => scrollToBottom(false), 50)
    } catch (err) {
      Logger.error('chat', 'Error loading messages', { error: err })
    } finally {
      setLoading(false)
    }
  }

  const loadOlderMessages = async () => {
    if (loadingOlder || !hasMore || !oldestCursor || !authUser) return
    setLoadingOlder(true)
    try {
      const result = await apiClient.getChatMessages(chatRoomId as string, { limit: 50, before: oldestCursor })
      if (!result.success || !result.data) return
      const raw = Array.isArray(result.data) ? result.data : (result.data as any)?.messages || []
      const pagination = (result.data as any)?.pagination
      setHasMore(pagination?.hasMore || false)
      setOldestCursor(pagination?.nextCursor || null)
      const older = transformRawMessages(Array.isArray(raw) ? raw : [], authUser.id)
      setMessages(prev => {
        const ids = new Set(prev.map(m => m.message_id))
        return [...older.filter(m => !ids.has(m.message_id)), ...prev]
      })
    } catch (err) {
      Logger.error('chat', 'Error loading older messages', { error: err })
    } finally {
      setLoadingOlder(false)
    }
  }

  // Keep cache warm as messages update
  useEffect(() => {
    if (!messagesCacheKey) return
    if (cacheWriteTimerRef.current) clearTimeout(cacheWriteTimerRef.current)
    cacheWriteTimerRef.current = setTimeout(() => {
      queryCache.set(messagesCacheKey, messages, MESSAGES_CACHE_TTL)
    }, 500)
    return () => { if (cacheWriteTimerRef.current) clearTimeout(cacheWriteTimerRef.current) }
  }, [messages, messagesCacheKey])

  useEffect(() => {
    if (chatRoomId && authUser && !authLoading) {
      setCurrentUser(authUser)
      loadMessages(false, true)
    }
  }, [chatRoomId, authUser, authLoading])

  const subscribeToMessages = () => {
    if (!chatRoomId) return () => {}

    const handleNewMessage: ChatMessageCallback = (data) => {
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
      setMessages(prev => prev.some(m => m.message_id === newMsg.message_id) ? prev : [...prev, newMsg])
      setTypingUsers(prev => {
        if (!prev.has(data.message.userId)) return prev
        const next = new Map(prev); next.delete(data.message.userId); return next
      })
      if (isAtBottomRef.current) setTimeout(() => scrollToBottom(true), 80)
    }

    const handleTyping: ChatTypingCallback = (data) => {
      if (data.userId === currentUser?.id) return
      setTypingUsers(prev => {
        const next = new Map(prev)
        if (data.isTyping) {
          next.set(data.userId, data.userName)
          const ex = typingCleanupRefs.current.get(data.userId)
          if (ex) clearTimeout(ex)
          typingCleanupRefs.current.set(data.userId, setTimeout(() => {
            setTypingUsers(p => { const n = new Map(p); n.delete(data.userId); return n })
            typingCleanupRefs.current.delete(data.userId)
          }, 3000))
        } else {
          next.delete(data.userId)
          const ex = typingCleanupRefs.current.get(data.userId)
          if (ex) { clearTimeout(ex); typingCleanupRefs.current.delete(data.userId) }
        }
        return next
      })
    }

    const handleDeleted: ChatMessageDeletedCallback = (data) => {
      setMessages(prev => prev.filter(m => m.message_id !== data.messageId))
    }

    const handleBanned: ChatMemberBannedCallback = (data) => {
      if (data.userId === currentUser?.id && data.banned) {
        showTray('Removed', 'You have been removed from this chat by the organiser.', [{
          label: 'OK', variant: 'primary',
          onPress: () => { closeTray(); router.back() },
        }])
      }
    }

    const handleReaction: ChatReactionCallback = (data) => {
      setMessages(prev => prev.map(msg => {
        if (msg.message_id !== data.messageId) return msg
        const reactions = { ...(msg.reactions || {}) }
        if (data.action === 'add') {
          reactions[data.emoji] = [...new Set([...(reactions[data.emoji] || []), data.userId])]
        } else {
          const users = (reactions[data.emoji] || []).filter(uid => uid !== data.userId)
          if (users.length === 0) delete reactions[data.emoji]; else reactions[data.emoji] = users
        }
        return { ...msg, reactions }
      }))
    }

    const u1 = subscribeToChatMessage(String(chatRoomId), handleNewMessage)
    const u2 = subscribeToChatTyping(String(chatRoomId), handleTyping)
    const u3 = subscribeToChatReaction(String(chatRoomId), handleReaction)
    const u4 = subscribeToChatModeration(String(chatRoomId), handleDeleted)
    const u5 = subscribeToChatModeration(String(chatRoomId), handleBanned)
    return () => {
      u1(); u2(); u3(); u4(); u5()
      typingCleanupRefs.current.forEach(t => clearTimeout(t))
      typingCleanupRefs.current.clear()
    }
  }

  useEffect(() => {
    if (!chatRoomId || !currentUser) return
    return subscribeToMessages()
  }, [chatRoomId, currentUser])

  const sendMessage = async () => {
    if (!newMessage.trim() || !currentUser) return
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    if (chatRoomId) stopTyping(String(chatRoomId))

    setSending(true)
    const messageText = newMessage.trim()
    let optimistic: Message | null = null

    try {
      optimistic = {
        message_id: 'temp-' + (++_tempIdCounter),
        sender_id: currentUser.id,
        sender_name: 'You',
        message_text: messageText,
        message_type: 'text',
        reply_to_message_id: replyingTo ? replyingTo.message_id : null,
        is_edited: false,
        created_at: new Date().toISOString(),
        replyTo: replyingTo || undefined,
      }
      setMessages(prev => [...prev, optimistic!])
      setNewMessage('')
      setReplyingTo(null)
      setTimeout(() => scrollToBottom(true), 80)

      if (authUser?.id) queryCache.invalidate(`group_chats_${authUser.id}`)
      emitChatListUpdate({ type: 'group', chatGroupId: String(chatRoomId), lastMessage: messageText, lastMessageTime: optimistic.created_at, senderName: 'You' })

      const result = await apiClient.sendChatMessage(chatRoomId as string, messageText, 'text')
      if (!result.success) throw new Error(result.error || 'Failed to send')

      const newId = result.data?.id
      if (newId) setMessages(prev => prev.map(m => m.message_id === optimistic!.message_id ? { ...m, message_id: newId } : m))
      markDomainsDirty(['chat'])
    } catch {
      if (optimistic) setMessages(prev => prev.filter(m => m.message_id !== optimistic!.message_id))
      setNewMessage(messageText)
      showTray('Error', 'Failed to send message.')
    } finally {
      setSending(false)
    }
  }

  const chatItems: ChatListItem[] = React.useMemo(() => {
    const items: ChatListItem[] = []
    let lastDay: string | null = null
    for (const m of messages) {
      const day = toDayKey(m.created_at)
      if (day !== lastDay) { items.push({ kind: 'separator', id: `sep-${day}`, label: formatDayLabel(m.created_at) }); lastDay = day }
      items.push({ kind: 'message', ...m })
    }
    return items
  }, [messages])

  const socketStatus = useLiveSync({
    enabled: !!chatRoomId && !!currentUser,
    onSync: () => loadMessages(false, true),
    domains: ['chat'],
    syncOnReconnect: true,
    disconnectedIntervalMs: 15000,
  })

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === currentUser?.id
    const isSystem = item.sender_id === 'system'

    if (isSystem) {
      return (
        <View style={styles.systemRow}>
          <Text style={styles.systemText}>{item.message_text}</Text>
        </View>
      )
    }

    if (item.message_type === 'announcement' || item.message_type === 'sponsored') {
      const isSponsored = item.message_type === 'sponsored'
      return (
        <View style={styles.bannerRow}>
          <View style={[styles.bannerBubble, isSponsored && styles.bannerBubbleBlue]}>
            <Text style={[styles.bannerLabel, isSponsored && styles.bannerLabelBlue]}>
              {isSponsored ? '📣 Sponsored' : '📢 Announcement'}
            </Text>
            <Text style={styles.bannerText}>{item.message_text}</Text>
            <Text style={styles.bannerTime}>{formatTime(item.created_at)}</Text>
          </View>
        </View>
      )
    }

    return (
      <TouchableOpacity
        style={[styles.messageRow, isMe ? styles.myRow : styles.otherRow]}
        onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setSelectedMessage(item); setShowMessageMenu(true) }}
        delayLongPress={400}
        activeOpacity={0.85}
      >
        {!isMe && (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(item.sender_name)}</Text>
          </View>
        )}
        <View style={[styles.msgContainer, isMe ? styles.myMsgContainer : styles.otherMsgContainer]}>
          {!isMe && <Text style={styles.senderName}>{item.sender_name}</Text>}

          {item.replyTo && (
            <View style={styles.replyPreview}>
              <View style={styles.replyLine} />
              <Text style={styles.replyPreviewText} numberOfLines={2}>
                {item.replyTo.sender_name}: {item.replyTo.message_text}
              </Text>
            </View>
          )}

          <View style={[styles.bubble, isMe ? styles.myBubble : styles.otherBubble]}>
            <Text style={styles.bubbleText}>{item.message_text}</Text>
            <View style={styles.bubbleMeta}>
              <Text style={styles.bubbleTime}>{formatTime(item.created_at)}{item.is_edited ? ' · edited' : ''}</Text>
            </View>
          </View>

          {item.reactions && Object.keys(item.reactions).length > 0 && (
            <View style={[styles.reactionsRow, isMe ? styles.reactionsRowMe : styles.reactionsRowOther]}>
              {Object.entries(item.reactions).map(([emoji, users]) => (
                <View key={emoji} style={styles.reactionPill}>
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                  {users.length > 1 && <Text style={styles.reactionCount}>{users.length}</Text>}
                </View>
              ))}
            </View>
          )}
        </View>
      </TouchableOpacity>
    )
  }

  const renderChatItem = ({ item }: { item: ChatListItem }) => {
    if (item.kind === 'separator') {
      return (
        <View style={styles.daySep}>
          <Text style={styles.daySepText}>{item.label}</Text>
        </View>
      )
    }
    return renderMessage({ item })
  }

  const ListHeader = loading ? (
    <ActivityIndicator style={styles.loadingIndicator} color={APP_COLORS.accent} />
  ) : hasMore ? (
    <TouchableOpacity style={styles.loadMoreBtn} onPress={loadOlderMessages} disabled={loadingOlder}>
      <Text style={styles.loadMoreText}>{loadingOlder ? 'Loading…' : '↑ Load older messages'}</Text>
    </TouchableOpacity>
  ) : null

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" backgroundColor={APP_COLORS.backgroundBase} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <GroupChatHeader
          name={(roomName as string) || 'Event Chat'}
          imageUrl={(eventImage as string) || null}
          subtitle={(eventTitle as string) || undefined}
          typingCount={typingUsers.size}
          onBack={() => router.back()}
        />
        <RealtimeStatusBanner status={socketStatus} style={styles.banner} />

        <FlatList
          ref={flatListRef}
          data={chatItems}
          renderItem={renderChatItem}
          keyExtractor={(item) => item.kind === 'separator' ? item.id : item.message_id}
          style={styles.flex}
          contentContainerStyle={[styles.listContent, messages.length === 0 && !loading && styles.emptyContent]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          maxToRenderPerBatch={12}
          windowSize={10}
          initialNumToRender={25}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={!loading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>Start the room conversation</Text>
              <Text style={styles.emptyText}>Be the first to post so everyone can join.</Text>
              <ScalePress style={styles.emptyCta} onPress={() => { setNewMessage('Hey everyone 👋') }} pressedScale={0.97}>
                <Text style={styles.emptyCtaText}>Send a starter message</Text>
              </ScalePress>
            </View>
          ) : null}
          onScroll={(e) => {
            const offsetFromBottom = e.nativeEvent.contentSize.height - e.nativeEvent.contentOffset.y - e.nativeEvent.layoutMeasurement.height
            const atBottom = offsetFromBottom < 80
            isAtBottomRef.current = atBottom
            setShowScrollToBottom(!atBottom)
          }}
          scrollEventThrottle={80}
        />

        {showScrollToBottom && (
          <TouchableOpacity style={styles.scrollToBottomBtn} onPress={() => scrollToBottom(true)} activeOpacity={0.8}>
            <Ionicons name="chevron-down" size={20} color="#fff" />
          </TouchableOpacity>
        )}

        {typingUsers.size > 0 && (
          <View style={styles.typingRow}>
            <Text style={styles.typingText}>
              {Array.from(typingUsers.values()).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing…
            </Text>
          </View>
        )}

        {replyingTo && (
          <View style={styles.replyBar}>
            <View style={styles.replyBarLine} />
            <View style={styles.replyBarContent}>
              <Text style={styles.replyBarLabel}>Replying to {replyingTo.sender_name}</Text>
              <Text style={styles.replyBarMessage} numberOfLines={1}>{replyingTo.message_text}</Text>
            </View>
            <TouchableOpacity style={styles.replyBarClose} onPress={() => setReplyingTo(null)}>
              <Ionicons name="close" size={16} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>
        )}

        {/* Input bar */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={newMessage}
            onChangeText={(text) => {
              setNewMessage(text)
              if (text.length > 0 && chatRoomId) {
                if (!typingActiveSentRef.current) { startTyping(String(chatRoomId)); typingActiveSentRef.current = true }
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
                typingTimeoutRef.current = setTimeout(() => { stopTyping(String(chatRoomId)); typingActiveSentRef.current = false }, 2000)
              } else if (text.length === 0 && chatRoomId) {
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
                stopTyping(String(chatRoomId))
                typingActiveSentRef.current = false
              }
            }}
            placeholder="Message"
            placeholderTextColor="rgba(255,255,255,0.4)"
            multiline
            maxLength={1000}
            onFocus={() => setTimeout(() => scrollToBottom(false), 120)}
          />
          <ScalePress
            style={[styles.sendBtn, (!newMessage.trim() || sending) && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!newMessage.trim() || sending}
            pressedScale={0.94}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="send" size={18} color="#fff" />
            }
          </ScalePress>
        </View>
      </KeyboardAvoidingView>

      {/* Message menu */}
      <Modal visible={showMessageMenu} transparent animationType="fade" onRequestClose={() => setShowMessageMenu(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowMessageMenu(false)}>
          <View style={styles.messageMenu}>
            <TouchableOpacity style={styles.menuItem} onPress={() => {
              if (selectedMessage) { setReplyingTo(selectedMessage); setShowMessageMenu(false); setSelectedMessage(null) }
            }}>
              <Text style={styles.menuIcon}>↩️</Text>
              <Text style={styles.menuText}>Reply</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={async () => {
              if (selectedMessage) {
                await Clipboard.setString(selectedMessage.message_text)
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
                setShowMessageMenu(false); setSelectedMessage(null)
              }
            }}>
              <Text style={styles.menuIcon}>📋</Text>
              <Text style={styles.menuText}>Copy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => {
              setShowMessageMenu(false); setSelectedMessage(null)
              showTray('Report message', 'Are you sure you want to report this message?', [
                { label: 'Cancel', onPress: closeTray },
                { label: 'Report', variant: 'destructive', onPress: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); closeTray() } },
              ])
            }}>
              <Text style={styles.menuIcon}>🚩</Text>
              <Text style={[styles.menuText, styles.menuTextDestructive]}>Report</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <ActionTray visible={trayVisible} title={trayTitle} message={trayMessage} buttons={trayButtons} onClose={closeTray} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: APP_COLORS.backgroundBase },
  flex: { flex: 1 },
  banner: { marginHorizontal: 16, marginTop: 4, marginBottom: 2 },

  listContent: { paddingHorizontal: 12, paddingVertical: 8 },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },

  loadingIndicator: { marginVertical: 24 },
  loadMoreBtn: { alignItems: 'center', paddingVertical: 12 },
  loadMoreText: { color: 'rgba(255,255,255,0.45)', fontSize: 13 },

  // System / announcement messages
  systemRow: { alignItems: 'center', marginVertical: 8 },
  systemText: {
    fontSize: 13, color: 'rgba(255,255,255,0.6)', fontStyle: 'italic',
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6, textAlign: 'center',
  },
  bannerRow: { alignItems: 'center', marginVertical: 6, paddingHorizontal: 8 },
  bannerBubble: {
    width: '100%', borderRadius: 12,
    backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)',
    paddingHorizontal: 14, paddingVertical: 10,
  },
  bannerBubbleBlue: { backgroundColor: 'rgba(59,130,246,0.12)', borderColor: 'rgba(59,130,246,0.35)' },
  bannerLabel: { fontSize: 11, fontWeight: '600', color: '#F59E0B', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  bannerLabelBlue: { color: '#60A5FA' },
  bannerText: { fontSize: 14, color: '#FFFFFF', lineHeight: 20 },
  bannerTime: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4, textAlign: 'right' },

  // Messages
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 2 },
  myRow: { justifyContent: 'flex-end' },
  otherRow: { justifyContent: 'flex-start' },
  avatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 6, marginBottom: 2,
  },
  avatarText: { fontSize: 11, color: '#FFFFFF', fontWeight: '600' },
  msgContainer: { maxWidth: '78%' },
  myMsgContainer: { alignItems: 'flex-end' },
  otherMsgContainer: { alignItems: 'flex-start' },
  senderName: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 3, marginLeft: 4 },

  replyPreview: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 5, marginBottom: 4,
  },
  replyLine: { width: 2, height: 26, backgroundColor: APP_COLORS.accent, borderRadius: 1, marginRight: 8 },
  replyPreviewText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', flex: 1, fontStyle: 'italic' },

  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6,
  },
  myBubble: { backgroundColor: '#005C4B', borderBottomRightRadius: 4 },
  otherBubble: { backgroundColor: '#1F2937', borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 21, color: '#FFFFFF' },
  bubbleMeta: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 3 },
  bubbleTime: { fontSize: 11, color: 'rgba(255,255,255,0.45)' },

  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 },
  reactionsRowMe: { justifyContent: 'flex-end' },
  reactionsRowOther: { justifyContent: 'flex-start' },
  reactionPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2, gap: 3,
  },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '600' },

  // Day separator
  daySep: { alignItems: 'center', marginVertical: 12 },
  daySepText: {
    fontSize: 12, color: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10,
  },

  // Typing
  typingRow: { paddingHorizontal: 16, paddingVertical: 6 },
  typingText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontStyle: 'italic' },

  // Reply bar above input
  replyBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 10,
  },
  replyBarLine: { width: 3, height: 32, backgroundColor: APP_COLORS.accent, borderRadius: 2 },
  replyBarContent: { flex: 1 },
  replyBarLabel: { fontSize: 12, fontWeight: '600', color: APP_COLORS.accent },
  replyBarMessage: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  replyBarClose: { padding: 4 },

  // Input bar
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#111214', gap: 8,
  },
  input: {
    flex: 1, minHeight: 44, maxHeight: 120,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: '#FFFFFF',
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: APP_COLORS.accent, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#2C2C2E' },

  // Scroll to bottom
  scrollToBottomBtn: {
    position: 'absolute', right: 16, bottom: 80,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: APP_COLORS.accent, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5,
  },

  // Empty
  emptyContainer: { alignItems: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: '#FFFFFF', marginBottom: 8 },
  emptyText: { fontSize: 15, color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 22 },
  emptyCta: {
    marginTop: 16, backgroundColor: APP_COLORS.accent,
    borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10,
  },
  emptyCtaText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },

  // Message menu modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  messageMenu: {
    backgroundColor: '#1C1C1E', borderRadius: 14, padding: 8, minWidth: 200,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)',
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 8 },
  menuIcon: { fontSize: 18, marginRight: 12 },
  menuText: { fontSize: 16, color: '#FFFFFF', fontWeight: '500' },
  menuTextDestructive: { color: '#FF453A' },
})

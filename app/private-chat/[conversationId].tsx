import { Ionicons } from '@expo/vector-icons'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { LinearGradient } from 'expo-linear-gradient'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
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
import ScalePress from '../../components/motion/ScalePress'
import Avatar from '../../components/ui/Avatar'
import GlassSurface from '../../components/ui/GlassSurface'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { showMessageReportOptions, showUserSafetyActions } from '../../lib/safetyUtils'
import queryCache from '../../lib/queryCache'
import { emitChatListUpdate } from '../../lib/chatListUpdates'
import { markDomainsDirty } from '../../lib/liveSyncState'
import { subscribeToConversation, startPrivateTyping, stopPrivateTyping, markPrivateMessagesRead, PrivateMessageCallback, PrivateTypingCallback, PrivateReadCallback } from '../../lib/socketClient'
import { APP_COLORS, APP_CTA, APP_RADIUS, APP_SPACING } from '../../lib/theme'
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
  isRead: boolean
  createdAt: string
}

type ChatListItem =
  | ({ kind: 'message' } & PrivateMessage)
  | { kind: 'separator'; id: string; label: string }

const mapMessage = (msg: any): PrivateMessage => ({
  id: msg.id,
  conversationId: msg.conversationId,
  senderId: msg.senderId,
  sender: msg.sender,
  text: msg.text,
  isRead: msg.isRead,
  createdAt: msg.createdAt,
})

const formatTime = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

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

const getInitials = (name: string) => {
  const parts = String(name || '?').trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : '')).toUpperCase() || '?'
}

function ChatHeader({ name, avatarUrl, isTyping, isOnline, onBack, onOptions }: {
  name: string
  avatarUrl: string | null
  isTyping: boolean
  // TODO(figma-redesign): mocked until a real online-presence system exists (see
  // docs/FIGMA_REDESIGN_BACKLOG.md — "Chat presence / online status"). Currently just
  // reflects the typing signal so the dot/label never lies about a user being "active".
  isOnline: boolean
  onBack: () => void
  onOptions: () => void
}) {
  return (
    <GlassSurface intensity={20} tint="rgba(15,14,14,0.8)" borderRadius={0} bordered={false} style={headerStyles.glassWrap}>
      <View style={headerStyles.container}>
        <Pressable onPress={onBack} style={({ pressed }) => [headerStyles.iconBtn, pressed && headerStyles.pressed]}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>

        {avatarUrl ? (
          <Avatar source={avatarUrl} size={40} ringColor={APP_COLORS.accent} statusDot={isOnline} />
        ) : (
          <View style={[headerStyles.avatar, headerStyles.avatarFallback]}>
            <Text style={headerStyles.avatarText}>{getInitials(name)}</Text>
          </View>
        )}

        <View style={headerStyles.titleArea}>
          <Text style={headerStyles.name} numberOfLines={1}>{name}</Text>
          {isTyping ? (
            <Text style={headerStyles.typing}>typing…</Text>
          ) : isOnline ? (
            <Text style={headerStyles.activeNow}>ACTIVE NOW</Text>
          ) : null}
        </View>

        <Pressable onPress={onOptions} style={({ pressed }) => [headerStyles.iconBtn, pressed && headerStyles.pressed]}>
          <Ionicons name="ellipsis-vertical" size={22} color="#fff" />
        </Pressable>
      </View>
    </GlassSurface>
  )
}

const headerStyles = StyleSheet.create({
  glassWrap: {
    paddingTop: 0,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
    gap: APP_SPACING.sm,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.5 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: { backgroundColor: APP_COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  titleArea: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: '#fff' },
  typing: { fontSize: 12, color: APP_COLORS.accent, marginTop: 1 },
  activeNow: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: APP_COLORS.accent, marginTop: 1, textTransform: 'uppercase' },
})

export default function PrivateChat() {
  const { conversationId, otherUserName, otherUserId, otherUserAvatar } = useLocalSearchParams()
  const { user: authUser } = useAuth()
  const [messages, setMessages] = useState<PrivateMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [isOtherTyping, setIsOtherTyping] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [oldestCursor, setOldestCursor] = useState<string | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const [trayVisible, setTrayVisible] = useState(false)
  const [trayTitle, setTrayTitle] = useState('')
  const [trayMessage, setTrayMessage] = useState('')
  const [trayButtons, setTrayButtons] = useState<ActionTrayButton[]>([])

  const flatListRef = useRef<FlatList>(null)
  const isAtBottomRef = useRef(true)
  const initialLoadDoneRef = useRef(false)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingActiveSentRef = useRef(false)
  const otherTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const closeTray = () => setTrayVisible(false)
  const showTray = (title: string, message: string, buttons?: ActionTrayButton[]) => {
    setTrayTitle(title); setTrayMessage(message)
    setTrayButtons(buttons?.length ? buttons : [{ label: 'Done', variant: 'primary', onPress: closeTray }])
    setTrayVisible(true)
  }

  const scrollToBottom = (animated = true) => {
    flatListRef.current?.scrollToEnd({ animated })
  }

  const loadMessages = async (cursor?: string) => {
    try {
      const result = await apiClient.getConversationMessages(String(conversationId), { limit: 50, before: cursor })
      if (result.success && result.data) {
        const msgs = result.data.messages.map(mapMessage).reverse()
        if (cursor) {
          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id))
            return [...msgs.filter(m => !existingIds.has(m.id)), ...prev]
          })
        } else {
          setMessages(msgs)
          // Scroll to bottom instantly on initial load — no animation so there's no visible jump
          setTimeout(() => scrollToBottom(false), 50)
          initialLoadDoneRef.current = true
        }
        setHasMore(result.data.hasMore)
        setOldestCursor(result.data.nextCursor)
        if (conversationId && !cursor) {
          setConversationLastRead(String(conversationId)).catch(() => {})
        }
      }
    } catch (err) {
      Logger.error('private-chat', 'Failed to load messages', { error: err })
    } finally {
      setLoading(false)
    }
  }

  const loadOlderMessages = async () => {
    if (loadingOlder || !hasMore || !oldestCursor) return
    setLoadingOlder(true)
    try { await loadMessages(oldestCursor) } finally { setLoadingOlder(false) }
  }

  useEffect(() => {
    if (authUser && conversationId) loadMessages()
  }, [conversationId, authUser])

  // Mark messages read when viewing
  useEffect(() => {
    if (!authUser?.id || !conversationId || messages.length === 0) return
    const unreadIds = messages.filter(m => !m.isRead && m.senderId !== authUser.id).map(m => m.id)
    if (unreadIds.length > 0) markPrivateMessagesRead(String(conversationId), unreadIds)
  }, [messages, authUser?.id, conversationId])

  const subscribeToMessages = useCallback(() => {
    if (!conversationId) return () => {}

    const handleNewMessage: PrivateMessageCallback = (data) => {
      setMessages(prev => {
        if (prev.some(m => m.id === data.message.id)) return prev
        return [...prev, mapMessage(data.message)]
      })
      setIsOtherTyping(false)
      if (otherTypingTimeoutRef.current) { clearTimeout(otherTypingTimeoutRef.current); otherTypingTimeoutRef.current = null }
      if (isAtBottomRef.current) setTimeout(() => scrollToBottom(true), 80)
    }

    const handleTyping: PrivateTypingCallback = (data) => {
      if (data.userId === authUser?.id) return
      setIsOtherTyping(data.isTyping)
      if (data.isTyping) {
        if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current)
        otherTypingTimeoutRef.current = setTimeout(() => setIsOtherTyping(false), 3000)
      } else {
        if (otherTypingTimeoutRef.current) { clearTimeout(otherTypingTimeoutRef.current); otherTypingTimeoutRef.current = null }
      }
    }

    const handleRead: PrivateReadCallback = (data) => {
      if (data.readBy === authUser?.id) return
      setMessages(prev => prev.map(m => data.messageIds.includes(m.id) ? { ...m, isRead: true } : m))
    }

    const u1 = subscribeToConversation(String(conversationId), handleNewMessage)
    const u2 = subscribeToConversation(String(conversationId), handleTyping)
    const u3 = subscribeToConversation(String(conversationId), handleRead)
    return () => { u1(); u2(); u3(); if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current) }
  }, [conversationId, authUser?.id])

  useEffect(() => {
    if (!conversationId) return
    return subscribeToMessages()
  }, [conversationId, subscribeToMessages])

  const sendMessage = async () => {
    if (!newMessage.trim() || sending || !authUser || !conversationId) return
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    stopPrivateTyping(String(conversationId))

    const messageText = newMessage.trim()
    setNewMessage('')
    setSending(true)

    if (authUser?.id) queryCache.invalidate(`personal_chats_${authUser.id}`)
    emitChatListUpdate({ type: 'personal', conversationId: String(conversationId), lastMessage: messageText, lastMessageTime: new Date().toISOString() })

    try {
      const result = await apiClient.sendPrivateMessage(String(conversationId), { text: messageText })
      if (result.success && result.data) {
        setMessages(prev => prev.some(m => m.id === result.data!.id) ? prev : [...prev, mapMessage(result.data)])
        markDomainsDirty(['chat'])
        setTimeout(() => scrollToBottom(true), 80)
      } else {
        showTray('Error', 'Failed to send message. Please try again.')
        setNewMessage(messageText)
      }
    } catch {
      showTray('Error', 'Failed to send message. Please try again.')
      setNewMessage(messageText)
    } finally {
      setSending(false)
    }
  }

  const chatItems: ChatListItem[] = React.useMemo(() => {
    const items: ChatListItem[] = []
    let lastDay: string | null = null
    for (const m of messages) {
      const day = toDayKey(m.createdAt)
      if (day !== lastDay) { items.push({ kind: 'separator', id: `sep-${day}`, label: formatDayLabel(m.createdAt) }); lastDay = day }
      items.push({ kind: 'message', ...m })
    }
    return items
  }, [messages])

  const renderMessage = ({ item }: { item: PrivateMessage }) => {
    const isMe = item.senderId === authUser?.id
    return (
      <TouchableOpacity
        style={[styles.messageRow, isMe ? styles.myRow : styles.otherRow]}
        onLongPress={() => {
          if (!isMe) {
            showTray('Message options', 'What would you like to do?', [
              { label: 'Cancel', onPress: closeTray },
              { label: 'Report', variant: 'destructive', onPress: () => { closeTray(); showMessageReportOptions(item.id, 'private') } },
            ])
          }
        }}
        delayLongPress={400}
        activeOpacity={0.85}
      >
        {isMe ? (
          <LinearGradient
            colors={APP_CTA.primary.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.bubble, styles.myBubble]}
          >
            <Text style={[styles.bubbleText, styles.myBubbleText]}>{item.text || ''}</Text>
            <View style={styles.bubbleMeta}>
              <Text style={[styles.bubbleTime, styles.myBubbleTime]}>{formatTime(item.createdAt)}</Text>
              <Text style={[styles.tick, styles.myBubbleTime, item.isRead && styles.tickSeen]}>{item.isRead ? ' ✓✓' : ' ✓'}</Text>
            </View>
          </LinearGradient>
        ) : (
          <View style={[styles.bubble, styles.otherBubble]}>
            <Text style={styles.bubbleText}>{item.text || ''}</Text>
            <View style={styles.bubbleMeta}>
              <Text style={styles.bubbleTime}>{formatTime(item.createdAt)}</Text>
            </View>
          </View>
        )}
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

  const socketStatus = useLiveSync({
    enabled: !!authUser && !!conversationId,
    onSync: () => loadMessages(),
    domains: ['chat'],
    syncOnReconnect: true,
    disconnectedIntervalMs: 15000,
  })

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
        <ChatHeader
          name={(otherUserName as string) || 'Chat'}
          avatarUrl={(otherUserAvatar as string) || null}
          isTyping={isOtherTyping}
          isOnline={isOtherTyping}
          onBack={() => router.back()}
          onOptions={() => {
            if (otherUserId) {
              showUserSafetyActions((otherUserName as string) || 'User', otherUserId as string, () => router.back())
            } else {
              showTray('Coming soon', 'Safety options will be available soon.')
            }
          }}
        />
        <RealtimeStatusBanner status={socketStatus} style={styles.banner} />

        <FlatList
          ref={flatListRef}
          data={chatItems}
          keyExtractor={(item) => item.kind === 'separator' ? item.id : item.id}
          renderItem={renderChatItem}
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
              <View style={styles.emptyGlyph}>
                <Ionicons name="chatbubble-ellipses-outline" size={36} color={APP_COLORS.textTertiary} />
              </View>
              <Text style={styles.emptyTitle}>Start the conversation!</Text>
              <Text style={styles.emptyText}>You matched with {otherUserName}. Say hi!</Text>
              <ScalePress style={styles.emptyCta} onPress={() => setNewMessage('Hey 👋')} pressedScale={0.97}>
                <Text style={styles.emptyCtaText}>Send a wave 👋</Text>
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

        {isOtherTyping && (
          <View style={styles.typingRow}>
            <Text style={styles.typingText}>{otherUserName || 'User'} is typing…</Text>
          </View>
        )}

        {/* Input bar */}
        <GlassSurface intensity={20} tint="rgba(27,25,25,0.9)" borderRadius={0} bordered={false} style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={newMessage}
            onChangeText={(text) => {
              setNewMessage(text)
              if (text.length > 0 && conversationId) {
                if (!typingActiveSentRef.current) { startPrivateTyping(String(conversationId)); typingActiveSentRef.current = true }
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
                typingTimeoutRef.current = setTimeout(() => { stopPrivateTyping(String(conversationId)); typingActiveSentRef.current = false }, 2000)
              } else if (text.length === 0 && conversationId) {
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
                stopPrivateTyping(String(conversationId))
                typingActiveSentRef.current = false
              }
            }}
            placeholder="Message"
            placeholderTextColor="rgba(174,170,170,0.5)"
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
            {(!newMessage.trim() || sending) ? (
              sending
                ? <ActivityIndicator size="small" color={APP_COLORS.textSecondary} />
                : <Ionicons name="send" size={18} color={APP_COLORS.textSecondary} />
            ) : (
              <LinearGradient
                colors={APP_CTA.primary.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.sendBtnGradient}
              >
                <Ionicons name="send" size={18} color={APP_COLORS.onAccent} />
              </LinearGradient>
            )}
          </ScalePress>
        </GlassSurface>
      </KeyboardAvoidingView>

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

  // Messages
  messageRow: { flexDirection: 'row', marginVertical: 2 },
  myRow: { justifyContent: 'flex-end' },
  otherRow: { justifyContent: 'flex-start' },

  bubble: {
    maxWidth: '78%',
    paddingHorizontal: APP_SPACING.md,
    paddingTop: APP_SPACING.sm,
    paddingBottom: APP_SPACING.xs,
  },
  myBubble: {
    borderTopLeftRadius: APP_RADIUS['2xl'],
    borderTopRightRadius: APP_RADIUS['2xl'],
    borderBottomLeftRadius: APP_RADIUS['2xl'],
    borderBottomRightRadius: 0,
  },
  otherBubble: {
    backgroundColor: APP_COLORS.backgroundCard,
    borderTopLeftRadius: APP_RADIUS['2xl'],
    borderTopRightRadius: APP_RADIUS['2xl'],
    borderBottomRightRadius: APP_RADIUS['2xl'],
    borderBottomLeftRadius: 0,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
    color: APP_COLORS.textPrimary,
  },
  myBubbleText: {
    color: APP_CTA.primary.text,
  },
  bubbleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 3,
    gap: 2,
  },
  bubbleTime: { fontSize: 11, color: APP_COLORS.textSecondary },
  myBubbleTime: { color: 'rgba(91,22,0,0.7)' },
  tick: { fontSize: 11, color: APP_COLORS.textSecondary },
  tickSeen: { color: APP_COLORS.onAccent },

  // Day separator
  daySep: { alignItems: 'center', marginVertical: 12 },
  daySepText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: APP_COLORS.textSecondary,
    backgroundColor: APP_COLORS.backgroundCard,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: APP_RADIUS.pill,
  },

  // Typing
  typingRow: { paddingHorizontal: 16, paddingVertical: 6 },
  typingText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontStyle: 'italic' },

  // Input bar — blurred "Liquid Glass" footer with pill composer + gradient send button
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: APP_SPACING.md,
    paddingVertical: APP_SPACING.sm,
    gap: APP_SPACING.sm,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: APP_RADIUS.pill,
    backgroundColor: APP_COLORS.backgroundInput,
    paddingHorizontal: APP_SPACING.md,
    paddingVertical: 10,
    fontSize: 15,
    color: APP_COLORS.textPrimary,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: APP_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sendBtnGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: APP_COLORS.backgroundInput },

  // Scroll to bottom
  scrollToBottomBtn: {
    position: 'absolute',
    right: 16,
    bottom: 80,
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

  // Empty state
  emptyContainer: { alignItems: 'center', paddingHorizontal: 40, paddingTop: 40 },
  emptyGlyph: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: APP_COLORS.backgroundElevated,
    borderWidth: 1,
    borderColor: APP_COLORS.separator,
    marginBottom: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: '#FFFFFF', marginBottom: 8 },
  emptyText: { fontSize: 15, color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 22 },
  emptyCta: {
    marginTop: 16,
    backgroundColor: APP_COLORS.accent,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  emptyCtaText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
})

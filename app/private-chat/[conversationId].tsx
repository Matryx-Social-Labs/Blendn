import { Ionicons } from '@expo/vector-icons'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import {
  revealAction,
  revealConfirmation,
  revealSubtitle,
  type ConversationRevealState,
  type RevealAction,
} from '../../lib/conversationReveal'
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
import OptimizedImage from '../../components/OptimizedImage'
import ScalePress from '../../components/motion/ScalePress'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { showLeaveConversationActions, showMessageReportOptions, showUserSafetyActions } from '../../lib/safetyUtils'
import queryCache from '../../lib/queryCache'
import { emitChatListUpdate } from '../../lib/chatListUpdates'
import { markDomainsDirty } from '../../lib/liveSyncState'
import { subscribeToConversation, startPrivateTyping, stopPrivateTyping, markPrivateMessagesRead, PrivateMessageCallback, PrivateTypingCallback, PrivateReadCallback } from '../../lib/socketClient'
import { APP_COLORS } from '../../lib/theme'
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

function ChatHeader({ name, avatarUrl, isTyping, subtitle, onBack, onOptions }: {
  name: string
  subtitle?: string | null
  avatarUrl: string | null
  isTyping: boolean
  onBack: () => void
  onOptions: () => void
}) {
  return (
    <View style={headerStyles.container}>
      <Pressable onPress={onBack} style={({ pressed }) => [headerStyles.iconBtn, pressed && headerStyles.pressed]}>
        <Ionicons name="chevron-back" size={24} color="#fff" />
      </Pressable>

      <View style={headerStyles.avatarWrap}>
        {avatarUrl ? (
          <OptimizedImage source={avatarUrl} recyclingKey={avatarUrl} style={headerStyles.avatar as any} width={38} height={38} contentFit="cover" />
        ) : (
          <View style={[headerStyles.avatar, headerStyles.avatarFallback]}>
            <Text style={headerStyles.avatarText}>{getInitials(name)}</Text>
          </View>
        )}
      </View>

      <View style={headerStyles.titleArea}>
        <Text style={headerStyles.name} numberOfLines={1}>{name}</Text>
        {/*
          * Whether they know who you are, at a glance.
          *
          * Not knowing is the state that makes people close the app. Suppressed
          * once both sides are visible -- at that point there is nothing left to
          * say and a permanent banner would just be noise.
          */}
        {!!subtitle && (
          <Text style={headerStyles.subtitle} numberOfLines={1}>{subtitle}</Text>
        )}
        {isTyping && <Text style={headerStyles.typing}>typing…</Text>}
      </View>

      <Pressable onPress={onOptions} style={({ pressed }) => [headerStyles.iconBtn, pressed && headerStyles.pressed]}>
        <Ionicons name="ellipsis-vertical" size={22} color="#fff" />
      </Pressable>
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
  avatarWrap: { position: 'relative' },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  avatarFallback: { backgroundColor: '#2C4A3E', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  titleArea: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#fff' },
  subtitle: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  typing: { fontSize: 12, color: '#4CAF91', marginTop: 1 },
})

/**
 * The one control that says what you can do about identity right now.
 *
 * One, not two: `revealAction` collapses the four combinations into a single
 * affordance, because a screen offering both "Reveal" and "Ask them to reveal"
 * makes the person work out which applies to them.
 */
function RevealBar({
  state,
  busy,
  onPress,
}: {
  state: ConversationRevealState
  busy: boolean
  onPress: (action: RevealAction) => void
}) {
  const action = revealAction(state)
  if (action.kind === 'none' || action.kind === 'done') return null

  return (
    <View style={revealStyles.bar}>
      {action.kind === 'reveal' && !!action.nudge && (
        <Text style={revealStyles.nudge} numberOfLines={2}>{action.nudge}</Text>
      )}
      <TouchableOpacity
        style={revealStyles.button}
        onPress={() => onPress(action)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={action.label}
      >
        <Ionicons
          name={action.kind === 'reveal' ? 'eye-outline' : 'hand-left-outline'}
          size={16}
          color={APP_COLORS.textPrimary}
        />
        <Text style={revealStyles.buttonText}>{action.label}</Text>
      </TouchableOpacity>
    </View>
  )
}

const revealStyles = StyleSheet.create({
  bar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    gap: 8,
  },
  nudge: { fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  buttonText: { color: APP_COLORS.textPrimary, fontSize: 14, fontWeight: '600' },
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
  /*
   * The identity of this conversation, from the server rather than the route.
   *
   * The header rendered `otherUserName` straight off the navigation params, so
   * it showed whatever the screen that pushed it happened to know. Under the
   * pseudonymous model that is the wrong source: only the server can say
   * whether this person has revealed to you, and it already resolves the name
   * and the photo before returning them.
   */
  const [reveal, setReveal] = useState<ConversationRevealState | null>(null)
  const [revealBusy, setRevealBusy] = useState(false)

  const loadReveal = useCallback(async () => {
    if (!conversationId) return
    const r = await apiClient.getConversation(conversationId as string)
    if (!r.success || !r.data) return
    setReveal({
      displayName: r.data.otherUser?.name || 'Someone',
      youRevealed: r.data.youRevealed ?? false,
      theyRevealed: r.data.theyRevealed ?? false,
      revealRequested: r.data.revealRequested ?? false,
      // A conversation with no reveal fields at all is one from an accepted
      // message request: real names throughout, nothing to reveal.
      pseudonymous: r.data.youRevealed !== undefined,
    })
  }, [conversationId])

  useEffect(() => {
    void loadReveal()
  }, [loadReveal])

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

  /**
   * Revealing, or asking them to.
   *
   * The confirmation is not ceremony. The server has no path back to `false`,
   * so this is the only moment the person can be told that -- a control that
   * reads like a toggle implies it can be toggled back, and nothing can unsee a
   * name and a face.
   */
  const onRevealPress = useCallback(
    (action: RevealAction) => {
      if (!reveal || !conversationId) return

      if (action.kind === 'ask') {
        setRevealBusy(true)
        void apiClient
          .requestReveal(conversationId as string)
          .then((r) => {
            if (r.success) {
              setReveal((prev) => (prev ? { ...prev, revealRequested: prev.revealRequested } : prev))
              showTray('Asked', `We let ${reveal.displayName} know. They'll decide in their own time.`)
            } else {
              showTray('Could not ask', r.error || 'Try again in a moment.')
            }
          })
          .finally(() => setRevealBusy(false))
        return
      }

      const copy = revealConfirmation(reveal.displayName)
      setTrayTitle(copy.title)
      setTrayMessage(copy.body)
      setTrayButtons([
        {
          label: copy.confirm,
          onPress: () => {
            setTrayVisible(false)
            setRevealBusy(true)
            void apiClient
              .revealInConversation(conversationId as string)
              .then((r) => {
                if (r.success) {
                  setReveal((prev) => (prev ? { ...prev, youRevealed: true } : prev))
                } else {
                  /*
                   * `reveal_incomplete` is the photo gate, and its message is
                   * already the copy -- "Add a photo to your profile first".
                   * Surfaced verbatim rather than translated, so the one
                   * missing input is named at the moment it is reached for.
                   */
                  showTray('Not yet', r.error || 'Could not reveal. Try again.')
                }
              })
              .finally(() => setRevealBusy(false))
          },
        },
        { label: 'Not now', variant: 'secondary', onPress: () => setTrayVisible(false) },
      ])
      setTrayVisible(true)
    },
    [reveal, conversationId, showTray]
  )


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
        <View style={[styles.bubble, isMe ? styles.myBubble : styles.otherBubble]}>
          <Text style={styles.bubbleText}>{item.text || ''}</Text>
          <View style={styles.bubbleMeta}>
            <Text style={styles.bubbleTime}>{formatTime(item.createdAt)}</Text>
            {isMe && <Text style={[styles.tick, item.isRead && styles.tickSeen]}>{item.isRead ? ' ✓✓' : ' ✓'}</Text>}
          </View>
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
          // Server-resolved. A pseudonym until they reveal, and the route param
          // only as a first paint before the fetch lands.
          name={reveal?.displayName || (otherUserName as string) || 'Chat'}
          avatarUrl={(otherUserAvatar as string) || null}
          isTyping={isOtherTyping}
          subtitle={reveal ? revealSubtitle(reveal) : null}
          onBack={() => router.back()}
          onOptions={() => {
            /*
             * The conversation sheet, not the profile one.
             *
             * `showUserSafetyActions` blocks and reports a person; it cannot
             * close this conversation, so from here it left the thread sitting
             * in both inboxes. `showLeaveConversationActions` is about *this*
             * conversation and bundles the report into the same request.
             */
            if (conversationId) {
              showLeaveConversationActions(
                conversationId as string,
                reveal?.displayName || (otherUserName as string) || 'them',
                reveal?.youRevealed ?? false,
                () => router.back()
              )
            } else if (otherUserId) {
              showUserSafetyActions((otherUserName as string) || 'User', otherUserId as string, () => router.back())
            } else {
              showTray('Coming soon', 'Safety options will be available soon.')
            }
          }}
        />
        {reveal && <RevealBar state={reveal} busy={revealBusy} onPress={onRevealPress} />}
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
        <View style={styles.inputRow}>
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
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 6,
  },
  myBubble: {
    backgroundColor: '#005C4B',
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: '#1F2937',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
    color: '#FFFFFF',
  },
  bubbleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 3,
    gap: 2,
  },
  bubbleTime: { fontSize: 11, color: 'rgba(255,255,255,0.55)' },
  tick: { fontSize: 11, color: 'rgba(255,255,255,0.55)' },
  tickSeen: { color: '#53BDEB' },

  // Day separator
  daySep: { alignItems: 'center', marginVertical: 12 },
  daySepText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
  },

  // Typing
  typingRow: { paddingHorizontal: 16, paddingVertical: 6 },
  typingText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontStyle: 'italic' },

  // Input bar — WhatsApp style: simple, no icons
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#111214',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#FFFFFF',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: APP_COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#2C2C2E' },

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

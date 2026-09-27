import { ScreenProfiler } from '../../lib/perf'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Clipboard,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ActionTray, { type ActionTrayButton } from '../../components/ActionTray'
import { BroadcastNotice } from '../../components/chat/BroadcastNotice'
import { ChatBubble } from '../../components/chat/ChatBubble'
import { ChatComposer } from '../../components/chat/ChatComposer'
import { SystemNotice } from '../../components/chat/SystemNotice'
import { TypingIndicator } from '../../components/chat/TypingIndicator'
import { OptimizedImage } from '../../components/OptimizedImage'
import ScalePress from '../../components/motion/ScalePress'
import { queryCache } from '../../lib/queryCache'
import { emitChatListUpdate } from '../../lib/chatListUpdates'
import { markDomainsDirty } from '../../lib/liveSyncState'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { subscribeToChatMessage, subscribeToChatTyping, subscribeToChatReaction, subscribeToChatMessageDeleted, subscribeToChatMemberBanned, startTyping, stopTyping, ChatMessageCallback, ChatTypingCallback, ChatReactionCallback, ChatMessageDeletedCallback, ChatMemberBannedCallback } from '../../lib/socketClient'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE } from '../../lib/theme'
import { useLiveSync } from '../../lib/useLiveSync'
import RealtimeStatusBanner from '../../components/RealtimeStatusBanner'
import { useAuth } from '../../lib/useAuth'
import { showMessageReportOptions } from '../../lib/safetyUtils'
import { KEYBOARD_BEHAVIOR } from '../../lib/keyboard'
import Animated from 'react-native-reanimated'
import { fadeInFast, fadeOutFast, popIn, popOut } from '../../components/motion/presence'

interface Message {
  message_id: string
  sender_id: string
  sender_name: string
  message_text: string
  message_type: string
  reply_to_message_id: string | null
  is_edited: boolean
  created_at: string
  /** Hidden by moderation. Only ever true on the sender's own messages. */
  removed?: boolean
  replyTo?: Message
  reactions?: { emoji: string; count: number; mine?: boolean }[]
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
        <Ionicons name="chevron-back" size={ICON.lg} color={EMBER.textPrimary} />
      </Pressable>

      <View style={headerStyles.avatarWrap}>
        {imageUrl ? (
          <OptimizedImage source={imageUrl} recyclingKey={imageUrl} style={headerStyles.avatar as any} width={38} height={38} contentFit="cover" />
        ) : (
          <View style={[headerStyles.avatar, headerStyles.avatarGroupFallback]}>
            <Ionicons name="people" size={ICON.md} color={EMBER.textPrimary} />
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
    // 12 + (48 − 24) / 2 puts the back chevron's glyph on GUTTER.
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: EMBER.separator,
    gap: SPACE.sm,
  },
  iconBtn: { width: CONTROL.md, height: CONTROL.md, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.5 },
  avatarWrap: {},
  avatar: { width: 38, height: 38, borderRadius: EMBER_RADIUS.pill },
  avatarGroupFallback: { backgroundColor: EMBER.surface, alignItems: 'center', justifyContent: 'center' },
  titleArea: { flex: 1 },
  name: TYPE.bodyStrong,
  // Primary, so a live "typing…" never reads as the secondary subtitle.
  typing: { ...TYPE.meta, color: EMBER.textPrimary },
  subtitle: { ...TYPE.meta, color: EMBER.textSecondary },
})

/**
 * The event room chat.
 *
 * Reached two ways, which is why it takes props at all. As a route it reads the
 * chat room id from the URL, the way it always has. As a **segment of The Room**
 * it is handed one, because there the id comes from whichever event you are
 * checked into rather than from navigation.
 *
 * `embedded` drops the header and the back button: The Room already draws both
 * above the `Grid | Chat` toggle, and a second header inside the segment would
 * stack two titles and two ways back out of one screen.
 *
 * Props are optional so the route keeps working untouched — expo-router passes
 * none, so every default is the old behaviour.
 */
function GroupChatInner(props?: {
  chatRoomId?: string
  roomName?: string
  eventTitle?: string
  eventImage?: string
  embedded?: boolean
}) {
  const params = useLocalSearchParams()
  const chatRoomId = props?.chatRoomId ?? params.id
  const roomName = props?.roomName ?? params.roomName
  const eventTitle = props?.eventTitle ?? params.eventTitle
  const eventImage = props?.eventImage ?? params.eventImage
  const embedded = props?.embedded === true
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
  /*
   * Whether the list should keep following its end as content lays out.
   * Distinct from `isAtBottomRef`: that one is derived from scroll geometry,
   * and during the first layout a programmatic scrollToEnd is followed by the
   * content growing again, so the geometry read "not at the bottom" and the
   * next size change was ignored -- the room opened one message short, the
   * newest bubble under the composer. This flips only on a real drag.
   */
  const followEndRef = useRef(true)
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
        // The server nulls the text and says why; an empty bubble said nothing.
        removed: Boolean(msg.moderation_hidden),
        // An ad's `type` is its media kind; the marker is in metadata. Without
        // this it scrolled back as a peer's bubble from "Attendee" (K3.2).
        message_type: msg.metadata?.sponsored_message_id
          ? 'sponsored'
          : msg.message_type || msg.type || 'text',
        // The server's field is `parent_id`; the two names before it belong to
        // nothing this app has ever received, so a reply lost its quote on reload.
        reply_to_message_id: msg.parent_id || msg.reply_to_message_id || msg.replyToMessageId || null,
        is_edited: msg.is_edited || msg.isEdited || false,
        created_at: msg.created_at || msg.createdAt,
        // `parent_message` rides along on history, so a quote survives the
        // parent scrolling out of the loaded page.
        replyTo: (msg.parent_message
          ? {
              message_id: msg.parent_message.id,
              sender_id: msg.parent_message.user?.id ?? '',
              sender_name: msg.parent_message.user?.id === userId ? 'You' : msg.parent_message.user?.name || 'Attendee',
              message_text: msg.parent_message.content ?? '',
              message_type: 'text',
              reply_to_message_id: null,
              is_edited: false,
              created_at: msg.parent_message.created_at ?? '',
            }
          : undefined) as Message | undefined,
        reactions: undefined as { emoji: string; count: number; mine?: boolean }[] | undefined,
      }
    })
    return list.map(msg => ({
      ...msg,
      replyTo: msg.reply_to_message_id ? list.find(m => m.message_id === msg.reply_to_message_id) ?? msg.replyTo : undefined,
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
    // loadMessages is redefined every render; only the listed values should
    // trigger a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatRoomId, authUser, authLoading])

  const subscribeToMessages = () => {
    if (!chatRoomId) return () => {}

    const handleNewMessage: ChatMessageCallback = (data) => {
      const newMsg: Message = {
        message_id: data.message.id,
        sender_id: data.message.userId,
        sender_name: data.message.userId === currentUser?.id ? 'You' : (data.message.userName || 'Attendee'),
        message_text: data.message.content,
        message_type: data.message.kind === 'sponsored' ? 'sponsored' : data.message.type || 'text',
        reply_to_message_id: data.message.parentId || null,
        is_edited: false,
        created_at: data.message.createdAt,
      }
      setMessages(prev =>
        prev.some(m => m.message_id === newMsg.message_id)
          ? prev
          // Resolve the quote here, not in render: the parent is already in
          // the list, and a live reply used to arrive without it.
          : [...prev, { ...newMsg, replyTo: newMsg.reply_to_message_id ? prev.find(m => m.message_id === newMsg.reply_to_message_id) : undefined }]
      )
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
      /*
       * A moderation removal of your own message becomes a placeholder rather
       * than a disappearance — the same thing the history shows you on the
       * next load, and the only way you learn it happened. Everyone else's
       * copy simply goes.
       */
      const ownRemoval = data.moderation && data.userId && data.userId === currentUser?.id
      setMessages(prev =>
        ownRemoval
          ? prev.map(m => (m.message_id === data.messageId ? { ...m, removed: true, message_text: '' } : m))
          : prev.filter(m => m.message_id !== data.messageId)
      )
    }

    const handleBanned: ChatMemberBannedCallback = (data) => {
      if (data.userId === currentUser?.id && data.banned) {
        showTray('Removed', 'You have been removed from this chat by the organiser.', [{
          label: 'OK', variant: 'primary',
          onPress: () => { closeTray(); router.back() },
        }])
      }
    }

    /*
     * The server sends the whole tally, so this replaces rather than merges.
     *
     * It used to accumulate `data.userId` into a per-emoji array — building
     * client-side the very map of who-reacted that the room forbids. Those
     * fields are gone, so the old handler matched neither branch and merely
     * re-rendered every message on every reaction, showing nothing.
     */
    const handleReaction: ChatReactionCallback = (data) => {
      setMessages(prev => prev.map(msg =>
        msg.message_id === data.messageId ? { ...msg, reactions: data.tally } : msg
      ))
    }

    const u1 = subscribeToChatMessage(String(chatRoomId), handleNewMessage)
    const u2 = subscribeToChatTyping(String(chatRoomId), handleTyping)
    const u3 = subscribeToChatReaction(String(chatRoomId), handleReaction)
    const u4 = subscribeToChatMessageDeleted(String(chatRoomId), handleDeleted)
    const u5 = subscribeToChatMemberBanned(String(chatRoomId), handleBanned)
    return () => {
      u1(); u2(); u3(); u4(); u5()
      typingCleanupRefs.current.forEach(t => clearTimeout(t))
      typingCleanupRefs.current.clear()
    }
  }

  useEffect(() => {
    if (!chatRoomId || !currentUser) return
    return subscribeToMessages()
    // subscribeToMessages is redefined every render; only the listed values
    // should re-subscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      const result = await apiClient.sendChatMessage(chatRoomId as string, messageText, 'text', undefined, optimistic.reply_to_message_id ?? undefined)
      if (!result.success) throw new Error(result.error || 'Failed to send')

      /*
       * The server can accept a message and still withhold it.
       *
       * When moderation hides content it returns 200 with `content: null` and
       * `moderation_hidden: true`. This branch only checked `result.success`,
       * so the optimistic bubble stayed on screen showing the sender their own
       * text while nobody else could see it — accidental shadowbanning, in the
       * one surface the product's trust model rests on. On reload the same
       * message rendered as an empty bubble, because the text was never stored.
       */
      const hidden = (result.data as { moderation_hidden?: boolean } | undefined)?.moderation_hidden
      if (hidden) {
        if (optimistic) {
          setMessages(prev => prev.filter(m => m.message_id !== optimistic!.message_id))
        }
        showTray('Not sent', 'That message was removed by moderation and was not delivered.')
        return
      }

      const newId = result.data?.id
      /*
       * The room echoes the sender's own message over the socket, and it can
       * land before this response does. Renaming the optimistic bubble then
       * produced two rows with one id -- "Encountered two children with the
       * same key" on the phone, and the message drawn twice. If the echo is
       * already in the list, the optimistic copy is the one to drop.
       */
      if (newId) setMessages(prev =>
        prev.some(m => m.message_id === newId)
          ? prev.filter(m => m.message_id !== optimistic!.message_id)
          : prev.map(m => m.message_id === optimistic!.message_id ? { ...m, message_id: newId } : m)
      )
      markDomainsDirty(['chat'])
    } catch (error) {
      if (optimistic) setMessages(prev => prev.filter(m => m.message_id !== optimistic!.message_id))
      setNewMessage(messageText)
      /*
       * `catch {` discarded the binding, so every refusal the server took care
       * to explain — muted, banned, room locked, chat window closed, spam —
       * was flattened into "Failed to send message." and the user retried
       * forever. The server writes a good sentence; one missing character
       * threw it away.
       */
      showTray('Error', error instanceof Error ? error.message : 'Failed to send message.')
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

  /*
   * Long-press opens the message menu, and it is stable so `ChatBubble`'s memo
   * can bite: a room being typed in re-renders on every keystroke, and an
   * inline arrow here would re-render every mounted bubble each time.
   */
  const openMessageMenu = useCallback((message: Message) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    setSelectedMessage(message)
    setShowMessageMenu(true)
  }, [])

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === currentUser?.id

    // The room narrating itself, not a person speaking. Same shape as a day
    // separator, which is what `SystemNotice` exists to make true.
    if (item.sender_id === 'system') {
      return <SystemNotice label={item.message_text} />
    }

    if (item.message_type === 'announcement' || item.message_type === 'sponsored') {
      return (
        <BroadcastNotice
          kind={item.message_type}
          text={item.message_text}
          time={formatTime(item.created_at)}
        />
      )
    }

    return (
      <ChatBubble
        mine={isMe}
        /*
         * Only the optimistic copy of something you just sent. When the server
         * confirms it the id changes, the row remounts with this false, and it
         * does not rise a second time; history never had a `temp-` id.
         */
        animateIn={item.message_id.startsWith('temp-')}
        senderId={item.sender_id}
        roomId={String(params.id)}
        senderName={item.sender_name}
        text={item.message_text}
        removed={item.removed}
        time={formatTime(item.created_at)}
        edited={item.is_edited}
        reactions={item.reactions}
        replyTo={
          item.replyTo
            ? { senderName: item.replyTo.sender_name, text: item.replyTo.message_text }
            : null
        }
        onLongPress={item.removed ? undefined : () => openMessageMenu(item)}
      />
    )
  }

  const renderChatItem = ({ item }: { item: ChatListItem }) => {
    if (item.kind === 'separator') return <SystemNotice label={item.label} />
    return renderMessage({ item })
  }

  const ListHeader = loading ? (
    <ActivityIndicator style={styles.loadingIndicator} color={EMBER.textSecondary} />
  ) : hasMore ? (
    <TouchableOpacity style={styles.loadMoreBtn} onPress={loadOlderMessages} disabled={loadingOlder}>
      <Text style={styles.loadMoreText}>{loadingOlder ? 'Loading…' : '↑ Load older messages'}</Text>
    </TouchableOpacity>
  ) : null

  return (
    <SafeAreaView
      style={styles.container}
      // Embedded, The Room owns the top inset — it draws the title and the
      // segments above this. Claiming 'top' here too would inset twice and
      // leave a bar of page colour under the toggle.
      edges={embedded ? ['bottom'] : ['top', 'bottom']}
    >
      {embedded ? null : <Stack.Screen options={{ headerShown: false }} />}
      <StatusBar style="light" backgroundColor={EMBER.bg} />

      <KeyboardAvoidingView style={styles.flex} behavior={KEYBOARD_BEHAVIOR}>
        {embedded ? null : (
          <GroupChatHeader
            name={(roomName as string) || 'Event Chat'}
            imageUrl={(eventImage as string) || null}
            subtitle={(eventTitle as string) || undefined}
            typingCount={typingUsers.size}
            onBack={() => router.back()}
          />
        )}
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
          /*
           * Drag the conversation down to put the keyboard away — on iOS the
           * keyboard follows the finger, the Messages behaviour people expect.
           * Android has no interactive mode, so a drag dismisses it.
           */
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          maxToRenderPerBatch={12}
          windowSize={10}
          initialNumToRender={25}
          ListHeaderComponent={ListHeader}
          /*
           * Typing lives at the end of the feed, not pinned above the composer.
           * It is a thing happening *in the conversation*, and pinned it was
           * equally present whether you were reading the newest message or two
           * hundred messages back -- a note about right now, hovering over
           * history.
           */
          ListFooterComponent={
            typingUsers.size > 0 ? (
              <TypingIndicator
                label={
                  typingUsers.size === 1
                    ? `${Array.from(typingUsers.values())[0]} is typing...`
                    : `${typingUsers.size} people are typing...`
                }
              />
            ) : null
          }
          ListEmptyComponent={!loading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>Start the room conversation</Text>
              <Text style={styles.emptyText}>Be the first to post so everyone can join.</Text>
              <ScalePress style={styles.emptyCta} onPress={() => { setNewMessage('Hey everyone 👋') }} pressedScale={0.97}>
                <Text style={styles.emptyCtaText}>Send a starter message</Text>
              </ScalePress>
            </View>
          ) : null}
          /*
           * Follow the end while the reader is at it. A `scrollToEnd` fired
           * 50ms after `setMessages` measured a list that had laid out
           * `initialNumToRender` rows and none of the sponsored notices'
           * heights, so opening the room landed on yesterday's messages with
           * "Today" pinned to the bottom edge and everything under it hidden.
           * Driven 2026-09-13, twice. Content growing while you are reading
           * older messages leaves you where you are.
           */
          onContentSizeChange={() => { if (followEndRef.current) scrollToBottom(false) }}
          onScrollBeginDrag={() => { followEndRef.current = false }}
          onScroll={(e) => {
            const offsetFromBottom = e.nativeEvent.contentSize.height - e.nativeEvent.contentOffset.y - e.nativeEvent.layoutMeasurement.height
            const atBottom = offsetFromBottom < 80
            isAtBottomRef.current = atBottom
            // Back at the end by hand: follow again.
            if (atBottom) followEndRef.current = true
            setShowScrollToBottom(!atBottom)
          }}
          scrollEventThrottle={80}
        />

        {showScrollToBottom && (
          <Animated.View entering={popIn} exiting={popOut} style={styles.scrollToBottomBtn}>
            <TouchableOpacity
              style={styles.scrollToBottomHit}
              onPress={() => scrollToBottom(true)}
              activeOpacity={0.8}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Jump to the newest message"
            >
              <Ionicons name="chevron-down" size={ICON.md} color={EMBER.textPrimary} />
            </TouchableOpacity>
          </Animated.View>
        )}

        {replyingTo && (
          <Animated.View entering={fadeInFast} exiting={fadeOutFast} style={styles.replyBar}>
            <View style={styles.replyBarLine} />
            <View style={styles.replyBarContent}>
              <Text style={styles.replyBarLabel}>Replying to {replyingTo.sender_name}</Text>
              <Text style={styles.replyBarMessage} numberOfLines={1}>{replyingTo.message_text}</Text>
            </View>
            <TouchableOpacity style={styles.replyBarClose} onPress={() => setReplyingTo(null)}>
              <Ionicons name="close" size={ICON.sm} color={EMBER.textSecondary} />
            </TouchableOpacity>
          </Animated.View>
        )}

        <ChatComposer
          value={newMessage}
          sending={sending}
          onSend={sendMessage}
          onFocus={() => setTimeout(() => scrollToBottom(false), 120)}
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
        />
      </KeyboardAvoidingView>

      {/* Message menu */}
      <Modal visible={showMessageMenu} transparent animationType="fade" onRequestClose={() => setShowMessageMenu(false)}>
        {/*
          accessible={false} on the scrim: a TouchableOpacity is accessible by
          default and on iOS that collapses everything inside it into one node,
          so VoiceOver (and Maestro) read the whole menu as "↩️ Reply 📋 Copy 🚩
          Report" and could not pick Report on its own.
        */}
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} accessible={false} onPress={() => setShowMessageMenu(false)}>
          <View style={styles.messageMenu}>
            <TouchableOpacity style={styles.menuItem} accessibilityRole="button" accessibilityLabel="Reply" onPress={() => {
              if (selectedMessage) { setReplyingTo(selectedMessage); setShowMessageMenu(false); setSelectedMessage(null) }
            }}>
              <Text style={styles.menuIcon}>↩️</Text>
              <Text style={styles.menuText}>Reply</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} accessibilityRole="button" accessibilityLabel="Copy" onPress={async () => {
              if (selectedMessage) {
                await Clipboard.setString(selectedMessage.message_text)
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
                setShowMessageMenu(false); setSelectedMessage(null)
              }
            }}>
              <Text style={styles.menuIcon}>📋</Text>
              <Text style={styles.menuText}>Copy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} accessibilityRole="button" accessibilityLabel="Report" onPress={() => {
              /*
               * Reuses the same flow the DM screen uses, rather than a second
               * confirmation tray.
               *
               * This used to show a tray whose Report button fired a SUCCESS
               * haptic and called nothing. So the room where abuse is most
               * likely had a report button that silently did nothing, and the
               * person who pressed it was actively told it had worked. Worse
               * than no button.
               *
               * The message id is captured before the menu closes: the old code
               * called setSelectedMessage(null) first, so by the time any
               * handler ran the id was already gone. Wiring the API call
               * without this would have reported `undefined`.
               */
              const messageId = selectedMessage?.message_id
              setShowMessageMenu(false); setSelectedMessage(null)
              if (!messageId) return
              showMessageReportOptions(messageId, 'group')
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
  container: { flex: 1, backgroundColor: EMBER.bg },
  flex: { flex: 1 },
  banner: { marginHorizontal: GUTTER, marginTop: SPACE.xs, marginBottom: SPACE.xxs },

  listContent: { paddingHorizontal: GUTTER, paddingVertical: SPACE.sm, gap: SPACE.lg },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },

  loadingIndicator: { marginVertical: SPACE.xl },
  loadMoreBtn: { alignItems: 'center', paddingVertical: SPACE.md },
  loadMoreText: { ...TYPE.meta, color: EMBER.textTertiary },

  // System / announcement messages

  // Messages




  // Day separator

  // Typing

  // Reply bar above input
  replyBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: GUTTER, paddingVertical: SPACE.sm,
    backgroundColor: EMBER.surfaceSunken,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: EMBER.separator,
    gap: SPACE.md,
  },
  replyBarLine: { width: 3, height: 32, backgroundColor: EMBER.textSecondary, borderRadius: EMBER_RADIUS.pill },
  replyBarContent: { flex: 1 },
  replyBarLabel: { ...TYPE.caption, color: EMBER.textPrimary },
  replyBarMessage: { ...TYPE.meta, color: EMBER.textSecondary },
  replyBarClose: { padding: SPACE.xs },

  // Input bar

  // Scroll to bottom
  scrollToBottomHit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollToBottomBtn: {
    position: 'absolute', right: GUTTER, bottom: 80,
    width: CONTROL.md, height: CONTROL.md, borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface, alignItems: 'center', justifyContent: 'center',
  },

  // Empty
  emptyContainer: { alignItems: 'center', paddingHorizontal: SPACE.xxl },
  emptyTitle: { ...TYPE.title, marginBottom: SPACE.sm },
  emptyText: { ...TYPE.body, color: EMBER.textSecondary, textAlign: 'center' },
  emptyCta: {
    marginTop: SPACE.lg, backgroundColor: EMBER.surface,
    borderRadius: EMBER_RADIUS.pill, height: CONTROL.md, justifyContent: 'center', paddingHorizontal: SPACE.xl,
  },
  // A secondary button: the composer's send is this screen's one accent.
  emptyCtaText: { ...TYPE.button, color: EMBER.textPrimary },

  // Message menu modal
  modalOverlay: { flex: 1, backgroundColor: EMBER.backdrop, justifyContent: 'center', alignItems: 'center' },
  messageMenu: {
    backgroundColor: EMBER.surface, borderRadius: EMBER_RADIUS.md, padding: SPACE.sm, minWidth: 200,
    borderWidth: StyleSheet.hairlineWidth, borderColor: EMBER.separator,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.md, paddingVertical: SPACE.md, borderRadius: EMBER_RADIUS.sm },
  // An emoji standing in for a row icon, so it takes the icon size.
  menuIcon: { fontSize: ICON.md, marginRight: SPACE.md },
  menuText: TYPE.body,
  menuTextDestructive: { color: EMBER.destructive },
})


/*
 * Wrapped so `lib/perf.tsx` can report what this screen costs to render.
 * `ScreenProfiler` is the children untouched in production — see its header.
 */
export default function GroupChat() {
  return (
    <ScreenProfiler id="event-chat">
      <GroupChatInner />
    </ScreenProfiler>
  )
}

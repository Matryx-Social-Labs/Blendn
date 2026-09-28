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
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ActionTray, { type ActionTrayButton } from '../../components/ActionTray'
import { BroadcastNotice } from '../../components/chat/BroadcastNotice'
import { RoomGuidelinesBanner } from '../../components/chat/RoomGuidelinesBanner'
import { RoomLeftState } from '../../components/chat/RoomLeftState'
import { ChatBubble } from '../../components/chat/ChatBubble'
import { ChatComposer, type ComposerLock } from '../../components/chat/ChatComposer'
import { ChatLoadFailed } from '../../components/chat/ChatLoadFailed'
import { ReactionPicker } from '../../components/chat/ReactionPicker'
import { SystemNotice } from '../../components/chat/SystemNotice'
import { TypingIndicator, typingLabel } from '../../components/chat/TypingIndicator'
import { OptimizedImage } from '../../components/OptimizedImage'
import ScalePress from '../../components/motion/ScalePress'
import { useToast } from '../../components/Toast'
import { queryCache } from '../../lib/queryCache'
import { emitChatListUpdate } from '../../lib/chatListUpdates'
import { markDomainsDirty } from '../../lib/liveSyncState'
import { apiClient, type ChatReaction } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { subscribeToChatMessage, subscribeToChatTyping, subscribeToChatReaction, subscribeToChatMessageDeleted, subscribeToChatMemberBanned, subscribeToChatMemberLeft, rejoinChatSocket, startTyping, stopTyping, ChatMessageCallback, ChatTypingCallback, ChatReactionCallback, ChatMessageDeletedCallback, ChatMemberBannedCallback } from '../../lib/socketClient'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE } from '../../lib/theme'
import { useLiveSync } from '../../lib/useLiveSync'
import { useLatest } from '../../lib/useLatest'
import { userMessage } from '../../lib/userMessage'
import RealtimeStatusBanner from '../../components/RealtimeStatusBanner'
import { useAuth } from '../../lib/useAuth'
import { messageReportStep } from '../../lib/safetyUtils'
import { closeSheet, showSheet, type SheetAction } from '../../lib/sheet'
import { toggleReaction, withMine } from '../../lib/reactions'
import { KEYBOARD_BEHAVIOR } from '../../lib/keyboard'
import { useFollowEnd } from '../../lib/useFollowEnd'
import { newClientId } from '../../lib/clientId'
import { ReplyBar } from '../../components/chat/ReplyBar'
import { SwipeToReply } from '../../components/chat/SwipeToReply'
import { useActiveThread } from '../../lib/notifications'
import { isMuted, markRoomJoined, markRoomLeft, rememberRoomMute, roomSubtitle, useRoomMembership, useRoomMute } from '../../lib/roomMembership'
import Animated from 'react-native-reanimated'
import { popIn, popOut } from '../../components/motion/presence'

interface Message {
  message_id: string
  sender_id: string
  sender_name: string
  message_text: string
  message_type: string
  reply_to_message_id: string | null
  /** This send's own id, kept on the optimistic row so a retry is the same send (SCRUM-410). */
  client_id?: string
  is_edited: boolean
  created_at: string
  /** Hidden by moderation. Only ever true on the sender's own messages. */
  removed?: boolean
  replyTo?: Message
  reactions?: { emoji: string; count: number; mine?: boolean }[]
  /** Yours, and it did not reach the server. Kept, marked, and retryable. */
  failed?: boolean
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

function GroupChatHeader({ name, imageUrl, subtitle, muted, onBack, onInfo }: {
  name: string
  imageUrl: string | null
  subtitle?: string
  /** You muted this room's notifications: a still bell-slash beside the name. */
  muted: boolean
  onBack: () => void
  onInfo: () => void
}) {
  return (
    <View style={headerStyles.container}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={({ pressed }) => [headerStyles.iconBtn, pressed && headerStyles.pressed]}
      >
        <Ionicons name="chevron-back" size={ICON.lg} color={EMBER.textPrimary} />
      </Pressable>

      <View style={headerStyles.avatarWrap}>
        {imageUrl ? (
          <OptimizedImage source={imageUrl} recyclingKey={imageUrl} style={headerStyles.avatar as any} width={HEADER_AVATAR} height={HEADER_AVATAR} contentFit="cover" />
        ) : (
          <View style={[headerStyles.avatar, headerStyles.avatarGroupFallback]}>
            <Ionicons name="people" size={ICON.md} color={EMBER.textPrimary} />
          </View>
        )}
      </View>

      <View style={headerStyles.titleArea}>
        <View style={headerStyles.nameRow}>
          <Text style={headerStyles.name} numberOfLines={1}>{name}</Text>
          {muted ? (
            <Ionicons
              name="notifications-off-outline"
              size={ICON.sm}
              color={EMBER.textSecondary}
              accessibilityLabel="Notifications muted"
            />
          ) : null}
        </View>
        {/*
          Typing is said once, at the end of the feed (`TypingIndicator`). The
          header repeated it here in a different sentence.
        */}
        {subtitle ? (
          <Text style={headerStyles.subtitle} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>

      {/*
        The room's info: who is in it, the guidelines, and a report. The same
        glyph and place as the DM header's options, so one gesture finds both.
      */}
      <Pressable
        onPress={onInfo}
        accessibilityRole="button"
        accessibilityLabel="Room info"
        style={({ pressed }) => [headerStyles.iconBtn, pressed && headerStyles.pressed]}
      >
        <Ionicons name="ellipsis-vertical" size={ICON.lg} color={EMBER.textPrimary} />
      </Pressable>
    </View>
  )
}

/**
 * A room is its event's cover in a square, as on the Banter row — 40pt here,
 * the bubble avatar's size, radius `sm`. A person is round; a room is not.
 */
const HEADER_AVATAR = 40

const headerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    // 12 + (48 − 24) / 2 puts the back and options glyphs on GUTTER.
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: EMBER.separator,
    gap: SPACE.sm,
  },
  iconBtn: { width: CONTROL.md, height: CONTROL.md, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.5 },
  avatarWrap: {},
  avatar: { width: HEADER_AVATAR, height: HEADER_AVATAR, borderRadius: EMBER_RADIUS.sm, overflow: 'hidden' },
  avatarGroupFallback: { backgroundColor: EMBER.surface, alignItems: 'center', justifyContent: 'center' },
  titleArea: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  name: { ...TYPE.bodyStrong, flexShrink: 1 },
  subtitle: { ...TYPE.meta, color: EMBER.textSecondary },
})

/**
 * The event room chat, as a route: the chat room id, and what the opener knew
 * about its event, come from the URL.
 *
 * The Room used to embed this as a segment through optional props (`embedded`
 * dropped the header). Nothing has passed them since the Room navigates here
 * instead, so the path is gone.
 */
function GroupChatInner() {
  const params = useLocalSearchParams()
  const chatRoomId = params.id
  // A reply push for this room is not shown over it (`lib/notifications.ts`).
  useActiveThread(`room:${String(chatRoomId)}`)
  /*
   * The opener's knowledge of the room, filled in from the room list when it
   * is missing — the Room's chat dock opens this with no cover, and the header
   * drew a generic people glyph there while the Banter's path showed the event.
   */
  const [roomInfo, setRoomInfo] = useState<{ title?: string; image?: string }>({})
  const roomName = (params.roomName as string) || roomInfo.title
  const eventTitle = (params.eventTitle as string) || roomInfo.title
  const eventImage = (params.eventImage as string) || roomInfo.image
  const { user: authUser, loading: authLoading } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  /*
   * `sending` no longer reaches the composer -- see ComposerLock. It is kept
   * only as the in-flight guard against a double tap landing in the same frame
   * as the first, before `setNewMessage('')` has flushed. A ref, not state,
   * because nothing renders from it.
   */
  const sendInFlightRef = useRef(false)
  const [composerLock, setComposerLock] = useState<ComposerLock | null>(null)
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map())
  const [hasMore, setHasMore] = useState(false)
  const [oldestCursor, setOldestCursor] = useState<string | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  /*
   * History did not load. Drawn only while there is nothing on screen: a
   * failed background refresh over messages already shown changes nothing.
   */
  const [loadError, setLoadError] = useState(false)
  /*
   * Not in the room. `left` is a leave the app knows about — made here, or
   * the server's LEFT_ROOM — and lives in `lib/roomMembership.ts` so Room info
   * and the Banter agree. `outOfRoom` is history refused as a non-member,
   * which is also what the server says to a leave made on another phone.
   */
  const [outOfRoom, setOutOfRoom] = useState(false)
  const [rejoining, setRejoining] = useState(false)
  const left = useRoomMembership().left.has(String(chatRoomId))
  const outside = left || outOfRoom
  const muted = isMuted(useRoomMute(chatRoomId ? String(chatRoomId) : null))
  /** From the room list (`memberCount`), for the header when the title says nothing new. */
  const [memberCount, setMemberCount] = useState<number | null>(null)
  const { showToast } = useToast()
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
  /*
   * Follows the end as content lays out, until a real drag (lib/useFollowEnd).
   * Distinct from `isAtBottomRef`, which is scroll geometry: during the first
   * layout a programmatic scrollToEnd is followed by the content growing again,
   * so geometry read "not at the bottom" and the room opened one message short.
   */
  const follow = useFollowEnd(() => scrollToBottom(false))

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
        // Counts and yours, from the server's tally; this was dropped, so every
        // reaction vanished on reload.
        reactions: (Array.isArray(msg.reactions) ? msg.reactions : undefined) as
          | { emoji: string; count: number; mine?: boolean }[]
          | undefined,
      }
    })
    return list.map(msg => ({
      ...msg,
      replyTo: msg.reply_to_message_id ? list.find(m => m.message_id === msg.reply_to_message_id) ?? msg.replyTo : undefined,
    }))
  }

  /*
   * Starts a microtask after it is called, so every write, the cache restore
   * included, comes from a callback and the load effect below can start it.
   * The room still opens on the spinner, as it did when the restore ran
   * inside the effect.
   */
  const loadMessages = (force = false, refreshEvenIfCached = false) =>
    Promise.resolve(authUser)
      .then(async (user) => {
        if (!user) return

        if (!force && messagesCacheKey) {
          const cached = queryCache.get<Message[]>(messagesCacheKey)
          if (cached) {
            setMessages(cached)
            setLoading(false)
            if (!refreshEvenIfCached) return
          }
        }

        const result = await apiClient.getChatMessages(chatRoomId as string, { limit: 50 })
        /*
         * Refused as somebody not in the room: the left state, not "Couldn't
         * load" — Try again would be refused the same way for ever.
         */
        if (!result.success && result.errorCode === 'LEFT_ROOM') { markRoomLeft(String(chatRoomId)); setLoading(false); return }
        if (!result.success && result.errorCode === 'FORBIDDEN') { setOutOfRoom(true); setLoading(false); return }
        if (!result.success || !result.data) { setLoadError(true); setLoading(false); return }
        setLoadError(false)
        // Served as a member, so whatever this phone thought, you are in.
        setOutOfRoom(false)
        markRoomJoined(String(chatRoomId))

        const raw = Array.isArray(result.data)
          ? result.data
          : (result.data as any)?.messages || (result.data as any)?.data || []

        const pagination = (result.data as any)?.pagination
        setHasMore(pagination?.hasMore || false)
        setOldestCursor(pagination?.nextCursor || null)

        const msgs = transformRawMessages(Array.isArray(raw) ? raw : [], user.id)
        /*
         * What only this phone holds rides on top of the refresh: a send still
         * in flight, and one that failed. A refresh used to replace the list
         * whole, so a failed message vanished at the next sync.
         */
        setMessages(prev => [
          ...msgs,
          ...prev.filter(m => m.message_id.startsWith('temp-') && !msgs.some(n => n.message_id === m.message_id)),
        ])
        if (messagesCacheKey) queryCache.set(messagesCacheKey, msgs, MESSAGES_CACHE_TTL)
      })
      .catch((err) => {
        Logger.error('chat', 'Error loading messages', { error: err })
        setLoadError(true)
      })
      .finally(() => setLoading(false))

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

  // Follows the signed-in user once the room can load, and keeps the last one
  // otherwise. Adjusted in render, on the same changes the load effect sees.
  if (chatRoomId && authUser && !authLoading && currentUser !== authUser) {
    setCurrentUser(authUser)
  }

  useEffect(() => {
    if (chatRoomId && authUser && !authLoading) {
      loadMessages(false, true)
    }
    // loadMessages is redefined every render; only the listed values should
    // trigger a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatRoomId, authUser, authLoading])

  /*
   * The room's row in the Banter's list — usually already cached, so free —
   * is where its mute and its member count arrive.
   */
  useEffect(() => {
    if (!chatRoomId) return
    let live = true
    apiClient.getChatGroups().then((result) => {
      if (!live || !result.success || !result.data) return
      const data = result.data as unknown as Record<string, any>
      const rooms: Record<string, any>[] = Array.isArray(data) ? data : data.groups || data.rooms || data.data || []
      const room = rooms.find((g) => String(g.id || g.chat_room_id || g.chatRoomId || '') === String(chatRoomId))
      if (!room) return
      rememberRoomMute(String(chatRoomId), room.mute)
      const count = Number(room.memberCount ?? room.participant_count)
      if (count > 0) setMemberCount(count)
      // The same fields the Banter reads for its row, so the header matches it.
      const image = room.event?.coverImageUrl || room.event?.cover_image_url || room.coverImageUrl || room.cover_image_url
      const title = room.event?.title || room.event_title || room.eventTitle
      setRoomInfo({ title: title ? String(title) : undefined, image: image ? String(image) : undefined })
    }).catch(() => {})
    return () => { live = false }
  }, [chatRoomId])

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
        msg.message_id === data.messageId ? { ...msg, reactions: withMine(data.tally, msg.reactions) } : msg
      ))
    }

    const u1 = subscribeToChatMessage(String(chatRoomId), handleNewMessage)
    const u2 = subscribeToChatTyping(String(chatRoomId), handleTyping)
    const u3 = subscribeToChatReaction(String(chatRoomId), handleReaction)
    const u4 = subscribeToChatMessageDeleted(String(chatRoomId), handleDeleted)
    const u5 = subscribeToChatMemberBanned(String(chatRoomId), handleBanned)
    // Somebody left: one fewer in the header's count.
    const u6 = subscribeToChatMemberLeft(String(chatRoomId), () => {
      setMemberCount((n) => (n && n > 0 ? n - 1 : n))
    })
    return () => {
      u1(); u2(); u3(); u4(); u5(); u6()
      typingCleanupRefs.current.forEach(t => clearTimeout(t))
      typingCleanupRefs.current.clear()
    }
  }

  /*
   * Not while outside the room: the server refuses the join. `outside` is a
   * dependency so a rejoin subscribes again, which is what re-joins the
   * socket room (`join:chat`).
   */
  useEffect(() => {
    if (!chatRoomId || !currentUser || outside) return
    return subscribeToMessages()
    // subscribeToMessages is redefined every render; only the listed values
    // should re-subscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatRoomId, currentUser, outside])

  /**
   * Turn the server's refusal into a locked composer.
   *
   * `lib/api-response.ts` has emitted USER_MUTED / CHAT_LOCKED / CHAT_CLOSED /
   * RATE_LIMITED all along. The failed bubble and the toast say this message
   * did not go; the lock says the next one will not either, and why -- so a
   * muted user is not left typing messages they will never be allowed to
   * send. A rate limit lifts on its own, so that one is timed from the
   * server's own `retryAfter` rather than guessed; the rest persist until a
   * send gets through.
   */
  const applyComposerLock = (errorCode?: string, retryAfter?: number) => {
    if (lockTimerRef.current) { clearTimeout(lockTimerRef.current); lockTimerRef.current = null }
    switch (errorCode) {
      case 'USER_MUTED':
        setComposerLock('muted'); return
      case 'CHAT_LOCKED':
        setComposerLock('locked'); return
      case 'CHAT_CLOSED':
        setComposerLock('closed'); return
      case 'RATE_LIMITED': {
        setComposerLock('rate_limited')
        const ms = Math.min(Math.max((retryAfter ?? 5), 1), 120) * 1000
        lockTimerRef.current = setTimeout(() => setComposerLock(null), ms)
        return
      }
      default:
        // A send that landed, or a one-off failure (network, spam heuristic):
        // not a lock. The failed bubble's "Tap to retry" is the way back.
        setComposerLock(null)
    }
  }

  useEffect(() => () => {
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current)
  }, [])

  /*
   * One send of one message, first time or retry. The bubble is already on
   * screen; this decides whether it stays as sent, goes (moderation), or is
   * marked failed with the reason in a toast.
   */
  const deliver = async (optimistic: Message) => {
    try {
      const result = await apiClient.sendChatMessage(
        chatRoomId as string,
        optimistic.message_text,
        'text',
        undefined,
        optimistic.reply_to_message_id ?? undefined,
        optimistic.client_id
      )
      /*
       * Every answer re-decides the lock: a refusal sets it, and a send that
       * got through lifts it. A mute ends on the server only when a send is
       * tried (auto-unmute), and with the field read-only a retry of a failed
       * bubble is the one send left -- so its success has to unlock the field.
       */
      applyComposerLock(result.success ? undefined : result.errorCode, result.retryAfter)
      // Left on another phone, or here a moment ago: the room becomes the left state.
      if (!result.success && result.errorCode === 'LEFT_ROOM') markRoomLeft(String(chatRoomId))
      if (!result.success) throw new Error(userMessage(result, "Couldn't send. Try again."))

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
        setMessages(prev => prev.filter(m => m.message_id !== optimistic.message_id))
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
          ? prev.filter(m => m.message_id !== optimistic.message_id)
          : prev.map(m => m.message_id === optimistic.message_id ? { ...m, message_id: newId, failed: false } : m)
      )
      markDomainsDirty(['chat'])
    } catch (error) {
      /*
       * The bubble stays, marked "Not sent · Tap to retry". It used to be
       * dropped with its text put back in the composer, which took it out of
       * the conversation and read as though it had been deleted.
       */
      setMessages(prev => prev.map(m => m.message_id === optimistic.message_id ? { ...m, failed: true } : m))
      /*
       * `catch {` discarded the binding, so every refusal the server took care
       * to explain — muted, banned, room locked, chat window closed, spam —
       * was flattened into "Failed to send message." and the user retried
       * forever. The server writes a good sentence; one missing character
       * threw it away.
       */
      showToast(error instanceof Error ? error.message : "Couldn't send. Try again.", 'error')
    }
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || !currentUser) return
    if (sendInFlightRef.current) return
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    if (chatRoomId) stopTyping(String(chatRoomId))

    sendInFlightRef.current = true
    const messageText = newMessage.trim()
    const optimistic: Message = {
      message_id: 'temp-' + (++_tempIdCounter),
      sender_id: currentUser.id,
      sender_name: 'You',
      message_text: messageText,
      message_type: 'text',
      reply_to_message_id: replyingTo ? replyingTo.message_id : null,
      client_id: newClientId(),
      is_edited: false,
      created_at: new Date().toISOString(),
      replyTo: replyingTo || undefined,
    }
    setMessages(prev => [...prev, optimistic])
    setNewMessage('')
    setReplyingTo(null)
    setTimeout(() => scrollToBottom(true), 80)

    if (authUser?.id) queryCache.invalidate(`group_chats_${authUser.id}`)
    emitChatListUpdate({ type: 'group', chatGroupId: String(chatRoomId), lastMessage: messageText, lastMessageTime: optimistic.created_at, senderName: 'You' })

    // `deliver` catches its own failures, so this always runs.
    await deliver(optimistic)
    sendInFlightRef.current = false
  }

  const retrySend = (message: Message) => {
    setMessages(prev => prev.map(m => m.message_id === message.message_id ? { ...m, failed: false } : m))
    void deliver({ ...message, failed: false })
  }

  /*
   * A reaction lands on the bubble the moment it is tapped, and the server's
   * tally replaces it when it answers. Refused, it goes back to what it was
   * and says so — an optimistic change that silently stays wrong is worse
   * than a slow one.
   */
  const react = async (message: Message, emoji: ChatReaction) => {
    const before = message.reactions
    setMessages(prev => prev.map(m => m.message_id === message.message_id ? { ...m, reactions: toggleReaction(m.reactions, emoji) } : m))
    const result = await apiClient.reactToChatMessage(String(chatRoomId), message.message_id, emoji)
    if (result.success && result.data) {
      const tally = result.data.reactions
      setMessages(prev => prev.map(m => m.message_id === message.message_id ? { ...m, reactions: tally } : m))
    } else {
      setMessages(prev => prev.map(m => m.message_id === message.message_id ? { ...m, reactions: before } : m))
      if (result.errorCode === 'LEFT_ROOM') markRoomLeft(String(chatRoomId))
      else if (result.errorCode === 'CHAT_CLOSED' || result.errorCode === 'CHAT_LOCKED') applyComposerLock(result.errorCode)
      showToast(userMessage(result, "Couldn't add your reaction. Try again."), 'error')
    }
  }

  /*
   * Back in. The server answers the refusals in its own words — banned, the
   * room has closed, the organiser locked it — and a room you were never in
   * is its 404, which means checking in is the way.
   */
  const rejoin = async () => {
    if (rejoining || !chatRoomId) return
    setRejoining(true)
    const result = await apiClient.rejoinChatGroup(String(chatRoomId))
    setRejoining(false)
    if (!result.success) {
      showToast(
        result.errorCode === 'NOT_FOUND'
          ? 'Check in at the event to join its room.'
          : userMessage(result, "Couldn't rejoin this room. Try again."),
        'error'
      )
      return
    }
    markRoomJoined(String(chatRoomId))
    // The socket was refused this room while you were out of it.
    rejoinChatSocket(String(chatRoomId))
    setOutOfRoom(false)
    setLoading(true)
    showToast("You're back in the room", 'success')
    void loadMessages(true)
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
    enabled: !!chatRoomId && !!currentUser && !outside,
    onSync: () => loadMessages(false, true),
    domains: ['chat'],
    syncOnReconnect: true,
    disconnectedIntervalMs: 15000,
  })

  /*
   * The long-press menu, as the app's one sheet (`lib/sheet.ts`).
   *
   * It was a centred Modal of its own, and Report closed it to open the
   * report alert — a second modal presented while the first was leaving. As a
   * sheet step, Report replaces the menu in place.
   *
   * What it offers depends on the message:
   * - **theirs**: react, reply, copy, report
   * - **yours**: react, reply, copy — reporting your own message is not a
   *   thing, and offering it read as a broken menu
   * - **still sending**: copy only; it has no id yet to reply or react to
   * - **not sent**: try again, copy, delete
   */
  const showMessageMenu = (message: Message) => {
    const mine = message.sender_id === currentUser?.id
    const copy: SheetAction = {
      label: 'Copy',
      then: () => {
        Clipboard.setString(message.message_text)
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      },
    }

    if (message.failed) {
      showSheet({
        kind: 'actions',
        title: 'Not sent',
        message: "This message didn't reach the room.",
        actions: [
          { label: 'Try again', variant: 'primary', then: () => retrySend(message) },
          copy,
          {
            label: 'Delete',
            variant: 'destructive',
            then: () => setMessages(prev => prev.filter(m => m.message_id !== message.message_id)),
          },
          { label: 'Cancel', cancel: true },
        ],
      })
      return
    }

    const delivered = !message.message_id.startsWith('temp-')
    const actions: SheetAction[] = []
    if (delivered) actions.push({ label: 'Reply', then: () => setReplyingTo(message) })
    actions.push(copy)
    if (delivered && !mine) {
      /*
       * The message id is captured here, when the menu opens. The old menu
       * cleared its selection before the handler ran, so wiring the report
       * without this would have reported `undefined`.
       */
      const messageId = message.message_id
      actions.push({ label: 'Report', variant: 'destructive', next: () => messageReportStep(messageId, 'group') })
    }
    actions.push({ label: 'Cancel', cancel: true })

    showSheet({
      kind: 'actions',
      title: mine ? 'Your message' : message.sender_name,
      message: message.message_text.length > 120 ? `${message.message_text.slice(0, 120)}…` : message.message_text,
      content: delivered ? (
        <ReactionPicker
          mine={(message.reactions ?? []).filter(r => r.mine).map(r => r.emoji)}
          onPick={(emoji) => {
            closeSheet()
            void react(message, emoji)
          }}
        />
      ) : undefined,
      actions,
    })
  }
  // Read at the moment of the long press, so the handler below can stay stable.
  const messageMenuRef = useLatest(showMessageMenu)

  /*
   * Long-press opens the message menu, and it is stable so `ChatBubble`'s memo
   * can bite: a room being typed in re-renders on every keystroke, and an
   * inline arrow here would re-render every mounted bubble each time.
   */
  const openMessageMenu = useCallback((message: Message) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    messageMenuRef.current(message)
  }, [messageMenuRef])

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
      <SwipeToReply enabled={!item.removed && !item.failed} onReply={() => setReplyingTo(item)}>
      <ChatBubble
        mine={isMe}
        /*
         * Only the optimistic copy of something you just sent. When the server
         * confirms it the id changes, the row remounts with this false, and it
         * does not rise a second time; history never had a `temp-` id.
         */
        animateIn={item.message_id.startsWith('temp-')}
        senderId={item.sender_id}
        roomId={String(chatRoomId)}
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
        failed={item.failed}
        onRetry={item.failed ? () => retrySend(item) : undefined}
        onLongPress={item.removed ? undefined : () => openMessageMenu(item)}
      />
      </SwipeToReply>
    )
  }

  const renderChatItem = ({ item }: { item: ChatListItem }) => {
    if (item.kind === 'separator') return <SystemNotice label={item.label} />
    return renderMessage({ item })
  }

  const ListHeader = loading ? (
    <ActivityIndicator style={styles.loadingIndicator} color={EMBER.textSecondary} />
  ) : hasMore ? (
    <Pressable
      onPress={loadOlderMessages}
      disabled={loadingOlder}
      accessibilityRole="button"
      accessibilityLabel="Load older messages"
      accessibilityState={{ busy: loadingOlder }}
      hitSlop={SPACE.sm}
      style={({ pressed }) => [styles.loadMoreBtn, pressed && styles.pressed]}
    >
      <Text style={styles.loadMoreText}>{loadingOlder ? 'LOADING…' : 'LOAD OLDER MESSAGES'}</Text>
    </Pressable>
  ) : null

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      <KeyboardAvoidingView style={styles.flex} behavior={KEYBOARD_BEHAVIOR}>
        <GroupChatHeader
            name={roomName || 'Event chat'}
            imageUrl={eventImage || null}
            subtitle={roomSubtitle(roomName || 'Event chat', eventTitle || undefined, memberCount)}
            muted={muted}
            onBack={() => router.back()}
            onInfo={() => router.push({
              pathname: '/chat-info/[id]',
              params: {
                id: String(chatRoomId),
                roomName: roomName || '',
                eventTitle: eventTitle || '',
                eventImage: eventImage || '',
              },
            } as never)}
          />
        {outside ? (
          <RoomLeftState kind={left ? 'left' : 'out'} rejoining={rejoining} onRejoin={() => void rejoin()} />
        ) : (<>
        <RealtimeStatusBanner status={socketStatus} style={styles.banner} />
        <RoomGuidelinesBanner userId={authUser?.id} chatRoomId={chatRoomId ? String(chatRoomId) : undefined} />

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
              <TypingIndicator label={typingLabel(Array.from(typingUsers.values()))} />
            ) : null
          }
          ListEmptyComponent={loading ? null : loadError ? (
            // Not the empty state: an empty room and one that failed to load
            // are different facts, and only one of them is an invitation.
            <ChatLoadFailed
              what="this chat"
              onRetry={() => {
                setLoadError(false)
                setLoading(true)
                void loadMessages(true)
              }}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>Start the room conversation</Text>
              <Text style={styles.emptyText}>Be the first to post so everyone can join.</Text>
              {/*
                Writes a starter into the composer for you to send or change —
                so it says "Write", not "Send": the tap sends nothing.
              */}
              <ScalePress
                style={styles.emptyCta}
                onPress={() => { setNewMessage('Hey everyone 👋') }}
                pressedScale={0.97}
                accessibilityRole="button"
                accessibilityLabel="Write a starter"
                accessibilityHint="Puts a hello in the message box"
              >
                <Text style={styles.emptyCtaText}>Write a starter</Text>
              </ScalePress>
            </View>
          )}
          /*
           * Follow the end while the reader is at it. A `scrollToEnd` fired
           * 50ms after `setMessages` measured a list that had laid out
           * `initialNumToRender` rows and none of the sponsored notices'
           * heights, so opening the room landed on yesterday's messages with
           * "Today" pinned to the bottom edge and everything under it hidden.
           * Driven 2026-09-13, twice. Content growing while you are reading
           * older messages leaves you where you are.
           */
          onContentSizeChange={follow.onContentSizeChange}
          onScrollBeginDrag={follow.onScrollBeginDrag}
          onScroll={(e) => {
            const offsetFromBottom = e.nativeEvent.contentSize.height - e.nativeEvent.contentOffset.y - e.nativeEvent.layoutMeasurement.height
            const atBottom = offsetFromBottom < 80
            isAtBottomRef.current = atBottom
            // Back at the end by hand: follow again.
            follow.noteAtEnd(atBottom)
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

        {replyingTo ? (
          <ReplyBar
            name={replyingTo.sender_name}
            text={replyingTo.message_text}
            onCancel={() => setReplyingTo(null)}
          />
        ) : null}

        <ChatComposer
          value={newMessage}
          lock={composerLock}
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
        </>)}
      </KeyboardAvoidingView>

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
  // A text action: `label` in `textPrimary` (docs/DESIGN_SYSTEM.md).
  loadMoreText: { ...TYPE.label, color: EMBER.textPrimary },
  pressed: { opacity: 0.6 },

  // System / announcement messages

  // Messages




  // Day separator

  // Typing



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

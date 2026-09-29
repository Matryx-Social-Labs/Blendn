import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { ScreenProfiler } from '../../lib/perf'
import { Ionicons } from '@expo/vector-icons'
import { router, Stack, useLocalSearchParams } from 'expo-router'
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
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ActionTray, { type ActionTrayButton } from '../../components/ActionTray'
import { ChatBubble } from '../../components/chat/ChatBubble'
import { ChatComposer, type ComposerLock } from '../../components/chat/ChatComposer'
import { ChatLoadFailed } from '../../components/chat/ChatLoadFailed'
import { SystemNotice } from '../../components/chat/SystemNotice'
import { TypingIndicator, typingLabel } from '../../components/chat/TypingIndicator'
import { OptimizedImage } from '../../components/OptimizedImage'
import ScalePress from '../../components/motion/ScalePress'
import { useToast } from '../../components/Toast'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { messageReportStep, showConversationOptions } from '../../lib/safetyUtils'
import { showSheet, type SheetAction } from '../../lib/sheet'
import { useLatest } from '../../lib/useLatest'
import { sendOutcome } from '../../lib/sendOutcome'
import { userMessage } from '../../lib/userMessage'
import { pseudonymAvatar } from '../../lib/pseudonymAvatar'
import {
  directHeaderAvatar,
  emptyThreadLine,
  isLocalMessage,
  optimisticDirectMessage,
  settleDirectMessage,
  type PrivateMessage,
} from '../../lib/directThread'
import { queryCache } from '../../lib/queryCache'
import { emitChatListUpdate } from '../../lib/chatListUpdates'
import { markDomainsDirty } from '../../lib/liveSyncState'
import { subscribeToConversation, subscribeToDelivered, startPrivateTyping, stopPrivateTyping, markPrivateMessagesRead, PrivateMessageCallback, PrivateTypingCallback, PrivateReadCallback } from '../../lib/socketClient'
import { draftParam, matchOpener } from '../../lib/matchOpener'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, OPACITY, SPACE, TYPE } from '../../lib/theme'
import { useLiveSync } from '../../lib/useLiveSync'
import RealtimeStatusBanner from '../../components/RealtimeStatusBanner'
import { useAuth } from '../../lib/useAuth'
import { setConversationLastRead } from '../../lib/unread'
import { useActiveThread } from '../../lib/notifications'
import { initialsOf } from '../../lib/initials'
import { scrollListToEnd, useFollowEnd } from '../../lib/useFollowEnd'
import { mergeNewestPage } from '../../lib/mergeNewestPage'
import { newClientId } from '../../lib/clientId'
import { receiptFor } from '../../lib/receipts'
import { withUnreadDivider, type UnreadDivider } from '../../lib/unreadDivider'
import type { DmReplyQuote } from '../../lib/apiClient'
import { ReplyBar } from '../../components/chat/ReplyBar'
import { SwipeToReply } from '../../components/chat/SwipeToReply'
import { KEYBOARD_BEHAVIOR } from '../../lib/keyboard'
import Animated from 'react-native-reanimated'
import { fadeOutFast, popIn, popOut } from '../../components/motion/presence'

type ChatListItem =
  | ({ kind: 'message' } & PrivateMessage)
  | { kind: 'separator'; id: string; label: string }
  | UnreadDivider

const mapMessage = (msg: any): PrivateMessage => ({
  id: msg.id,
  conversationId: msg.conversationId,
  senderId: msg.senderId,
  sender: msg.sender,
  text: msg.text,
  isRead: msg.isRead,
  deliveredAt: msg.deliveredAt ?? null,
  replyTo: msg.replyTo ?? null,
  createdAt: msg.createdAt,
})

/** A reply's quote as the bubble draws it. */
const quoteLine = (q: DmReplyQuote) => ({
  senderName: q.senderName,
  text: q.unavailable ? 'Message unavailable' : q.text ?? (q.mediaType === 'image' ? '📷 Photo' : q.mediaType === 'video' ? '🎥 Video' : ''),
})

/** A local quote for a message being replied to, before the server's arrives. */
const quoteFrom = (m: PrivateMessage): DmReplyQuote => ({
  id: m.id,
  senderName: m.sender?.name || '',
  text: m.text,
  mediaType: null,
  unavailable: false,
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


function ChatHeader({ name, avatar, subtitle, onBack, onOptions, onProfile }: {
  name: string
  subtitle?: string | null
  /**
   * Their photo, or — while they are a pseudonym to you — the generated mark
   * the Banter row draws for them (seeded on the pseudonym, so it is the same
   * creature there and here). Initials only for a named person with no photo.
   */
  avatar: { kind: 'photo'; url: string } | { kind: 'mark'; seed: string } | { kind: 'initials' }
  onBack: () => void
  onOptions: () => void
  /**
   * Opens their profile. Absent while they are a pseudonym to you: until they
   * reveal, a profile would be either the flat "Attendee" the server returns
   * for an unidentified person or, worse, more than the conversation says.
   */
  onProfile?: () => void
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

      <Pressable
        onPress={onProfile}
        disabled={!onProfile}
        accessibilityRole={onProfile ? 'button' : 'header'}
        accessibilityLabel={name}
        accessibilityHint={onProfile ? 'Opens their profile' : undefined}
        style={({ pressed }) => [headerStyles.identity, pressed && onProfile && headerStyles.pressed]}
      >
      <View style={headerStyles.avatarWrap}>
        {avatar.kind === 'photo' ? (
          <OptimizedImage source={avatar.url} recyclingKey={avatar.url} style={headerStyles.avatar as any} width={HEADER_AVATAR} height={HEADER_AVATAR} contentFit="cover" />
        ) : avatar.kind === 'mark' ? (
          <PseudonymMark seed={avatar.seed} />
        ) : (
          <View style={[headerStyles.avatar, headerStyles.avatarFallback]}>
            <Text style={headerStyles.avatarText}>{initialsOf(name)}</Text>
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
          // Two lines: the one-way state has two halves by design, and on a
          // 402pt phone one line cut it at "You can't see the…".
          <Text style={headerStyles.subtitle} numberOfLines={2}>{subtitle}</Text>
        )}
      </View>
      </Pressable>

      <Pressable onPress={onOptions} accessibilityRole="button" accessibilityLabel="Conversation options" style={({ pressed }) => [headerStyles.iconBtn, pressed && headerStyles.pressed]}>
        <Ionicons name="ellipsis-vertical" size={ICON.lg} color={EMBER.textPrimary} />
      </Pressable>
    </View>
  )
}

/** The generated mark at the header's size: flat, as the chat's bubbles draw it. */
function PseudonymMark({ seed }: { seed: string }) {
  const mark = pseudonymAvatar(seed)
  return (
    <View style={[headerStyles.avatar, headerStyles.avatarFallback, { backgroundColor: mark.colors[0] }]}>
      <Text style={headerStyles.markGlyph} maxFontSizeMultiplier={1}>{mark.character}</Text>
    </View>
  )
}

/** The room header's avatar size, so a DM and a room open at one height. */
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
  pressed: { opacity: OPACITY.pressed },
  // The avatar and the name are one target: either one opens the profile.
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  avatarWrap: { position: 'relative' },
  avatar: { width: HEADER_AVATAR, height: HEADER_AVATAR, borderRadius: EMBER_RADIUS.pill },
  avatarFallback: { backgroundColor: EMBER.surface, alignItems: 'center', justifyContent: 'center' },
  avatarText: TYPE.bodyStrong,
  // design-exception: an emoji glyph sized to fill the 40pt disc, as in ChatBubble
  markGlyph: { fontSize: 20, lineHeight: 26 },
  titleArea: { flex: 1 },
  name: TYPE.bodyStrong,
  subtitle: { ...TYPE.meta, color: EMBER.textSecondary },
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
          size={ICON.sm}
          color={EMBER.textPrimary}
        />
        <Text style={revealStyles.buttonText}>{action.label}</Text>
      </TouchableOpacity>
    </View>
  )
}

const revealStyles = StyleSheet.create({
  bar: {
    paddingHorizontal: GUTTER,
    paddingVertical: SPACE.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: EMBER.separator,
    gap: SPACE.sm,
  },
  nudge: { ...TYPE.meta, color: EMBER.textSecondary },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
    height: CONTROL.md,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
  },
  buttonText: TYPE.button,
})

function PrivateChatInner() {
  const { conversationId, otherUserName, otherUserId, otherUserAvatar, draft } = useLocalSearchParams()
  // A push for this conversation is not shown over it (`lib/notifications.ts`).
  useActiveThread(`dm:${String(conversationId)}`)
  const { user: authUser } = useAuth()
  const [messages, setMessages] = useState<PrivateMessage[]>([])
  // Read by a refresh to decide whether the older-page cursor moves (lib/mergeNewestPage).
  const messagesRef = useLatest(messages)
  /*
   * The thread is gone — closed by the other side, or they blocked you; the
   * server answers "not found" for both and never says which. This opened as
   * "Start the conversation! Say hi to Sneha · Send a wave", drawn from an
   * empty list, for a thread that had a week of messages an hour earlier
   * (SCRUM-165). Nothing to wave at.
   */
  const [ended, setEnded] = useState(false)
  // A suggested opener (the match moment's "Try …") fills the composer once, on
  // mount. It is only ever a draft: nothing sends until you press send.
  const [newMessage, setNewMessage] = useState(() => draftParam(draft))
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  // The message the next send replies to (SCRUM-409).
  const [replyingTo, setReplyingTo] = useState<PrivateMessage | null>(null)
  // Where the unread started when the thread opened (SCRUM-406).
  const [unread, setUnread] = useState<{ firstId: string; count: number } | null>(null)
  /*
   * Not a send-in-flight state: `sending` above still guards the double tap.
   * This is the composer lock, and it is set only when the server says the
   * user may not post right now -- see ComposerLock.
   */
  const [composerLock, setComposerLock] = useState<ComposerLock | null>(null)
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
  /*
   * The conversation's own record did not load. The options sheet needs it —
   * the leave copy turns on whether they know who you are, and guessing that
   * wrong tells somebody unmatching "ends it" when it cannot — so options
   * says it failed and offers to try again rather than acting on a guess.
   */
  const [revealFailed, setRevealFailed] = useState(false)
  const [revealAttempt, setRevealAttempt] = useState(0)
  /** Their account id, from the server, for the header's tap-through. */
  const [otherId, setOtherId] = useState<string | null>(null)
  /** Their photo as the server resolves it: `null` until they reveal. */
  const [otherImage, setOtherImage] = useState<string | null>(null)
  /** History did not load, and there is nothing on screen to fall back on. */
  const [loadError, setLoadError] = useState(false)
  const { showToast } = useToast()

  // Declared inside the effect: it sets state only after the request returns.
  useEffect(() => {
    const loadReveal = async () => {
      if (!conversationId) return
      const r = await apiClient.getConversation(conversationId as string)
      if (!r.success || !r.data) {
        setRevealFailed(true)
        return
      }
      setRevealFailed(false)
      setOtherId(r.data.otherUser?.id || null)
      setOtherImage(r.data.otherUser?.image || null)
      setReveal({
        displayName: r.data.otherUser?.name || 'Someone',
        youRevealed: r.data.youRevealed ?? false,
        theyRevealed: r.data.theyRevealed ?? false,
        revealRequested: r.data.revealRequested ?? false,
        /*
         * Server-supplied. Replaces the guess below for anything that needs to
         * know "did this come from a match" rather than "is this pseudonymous" --
         * a revealed match is no longer pseudonymous but is still a match.
         */
        fromMatch: r.data.fromMatch === true,
        // Server-supplied. This used to be inferred from the reveal fields being
        // absent, and the server always sent them — so an accepted message
        // request drew "You can see their name. They can't see yours." and a
        // reveal button the server refuses. An older server without the field
        // falls back to the old inference.
        pseudonymous: r.data.pseudonymous ?? r.data.youRevealed !== undefined,
      })
    }
    void loadReveal()
  }, [conversationId, revealAttempt])

  const flatListRef = useRef<FlatList>(null)
  const isAtBottomRef = useRef(true)
  /*
   * Messages that should rise into place as they mount: the one you just sent,
   * and whichever message is first into an empty thread (it replaces the
   * "Start the conversation" card, which fades out as it arrives).
   *
   * A ref, not state — nothing re-renders because of it; the bubble reads it
   * once when it mounts. Each id is dropped after a second, so a row the list
   * later unmounts and remounts does not replay its entrance.
   */
  const arrivingRef = useRef(new Set<string>())
  const markArriving = useCallback((id: string) => {
    arrivingRef.current.add(id)
    setTimeout(() => arrivingRef.current.delete(id), 1000)
  }, [])
  const initialLoadDoneRef = useRef(false)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingActiveSentRef = useRef(false)
  const otherTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const closeTray = useCallback(() => setTrayVisible(false), [])
  const showTray = useCallback((title: string, message: string, buttons?: ActionTrayButton[]) => {
    setTrayTitle(title); setTrayMessage(message)
    setTrayButtons(buttons?.length ? buttons : [{ label: 'Done', variant: 'primary', onPress: closeTray }])
    setTrayVisible(true)
  }, [closeTray])

  // Their profile, only once they are a name to you: an accepted request, or
  // a match who revealed. The server decides both. The header's name and the
  // ⋮ menu's "View profile" both use it.
  const profileId = otherId || (otherUserId as string | undefined)
  const openProfile =
    reveal && (reveal.pseudonymous === false || reveal.theyRevealed) && profileId
      ? () => router.push({ pathname: '/user/[id]', params: { id: String(profileId) } } as never)
      : undefined

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
              showTray("Couldn't ask", userMessage(r, "Couldn't ask them. Try again."))
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
                  showTray('Not yet', userMessage(r, "Couldn't reveal. Try again."))
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
    scrollListToEnd(flatListRef.current, animated)
  }
  // Follows the end as the first page lays out (lib/useFollowEnd.ts).
  const follow = useFollowEnd(() => scrollToBottom(false))

  // State is set only in the callbacks, once the request has settled.
  const loadMessages = (cursor?: string) =>
    apiClient.getConversationMessages(String(conversationId), { limit: 50, before: cursor })
      .then((result) => {
        if (!result.success && result.errorCode === 'NOT_FOUND') {
          setEnded(true)
          return
        }
        if (!result.success && !cursor) {
          setLoadError(true)
          return
        }
        if (result.success && result.data) {
          if (!cursor) setLoadError(false)
          const msgs = result.data.messages.map(mapMessage).reverse()
          let keptOlder = false
          if (cursor) {
            setMessages(prev => {
              const existingIds = new Set(prev.map(m => m.id))
              return [...msgs.filter(m => !existingIds.has(m.id)), ...prev]
            })
          } else {
            // A refresh keeps the older pages already loaded, and a send only
            // this phone holds (lib/mergeNewestPage).
            keptOlder = mergeNewestPage(messagesRef.current, msgs, m => m.id, isLocalMessage).keptOlder
            setMessages(prev => mergeNewestPage(prev, msgs, m => m.id, isLocalMessage).items)
            /*
             * Open where they left off (SCRUM-406): the server named the first
             * unread before marking the thread read. Only on the first open —
             * a background refresh must not yank someone who is reading.
             */
            const firstUnreadId = result.data.firstUnreadId
            if (!initialLoadDoneRef.current && firstUnreadId && (result.data.unreadCount ?? 0) > 0) {
              setUnread({ firstId: firstUnreadId, count: result.data.unreadCount ?? 0 })
              follow.stop()
              if (!msgs.some(m => m.id === firstUnreadId) && result.data.hasMore && result.data.nextCursor) {
                void loadBackTo(firstUnreadId, result.data.nextCursor)
              }
            }
            initialLoadDoneRef.current = true
          }
          // Older pages kept means the cursor already points below them.
          if (!keptOlder) {
            setHasMore(result.data.hasMore)
            setOldestCursor(result.data.nextCursor)
          }
          if (conversationId && !cursor) {
            setConversationLastRead(String(conversationId)).catch(() => {})
          }
        }
      })
      .catch((err) => {
        Logger.error('private-chat', 'Failed to load messages', { error: err })
        if (!cursor) setLoadError(true)
      })
      .finally(() => setLoading(false))

  /** Older pages until the first unread is on screen — at most three more. */
  const loadBackTo = async (messageId: string, cursor: string) => {
    let next: string | null = cursor
    for (let page = 0; page < 3 && next; page++) {
      const r = await apiClient.getConversationMessages(String(conversationId), { limit: 50, before: next })
      if (!r.success || !r.data) return
      const older = r.data.messages.map(mapMessage).reverse()
      setMessages(prev => {
        const ids = new Set(prev.map(m => m.id))
        return [...older.filter(m => !ids.has(m.id)), ...prev]
      })
      setHasMore(r.data.hasMore)
      setOldestCursor(r.data.nextCursor)
      if (older.some(m => m.id === messageId)) return
      next = r.data.hasMore ? r.data.nextCursor : null
    }
  }

  const loadOlderMessages = async () => {
    if (loadingOlder || !hasMore || !oldestCursor) return
    setLoadingOlder(true)
    try { await loadMessages(oldestCursor) } finally { setLoadingOlder(false) }
  }

  useEffect(() => {
    if (authUser && conversationId) loadMessages()
    // loadMessages is redefined every render; only the listed values should
    // trigger a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, authUser])

  // Mark messages read when viewing
  useEffect(() => {
    if (!authUser?.id || !conversationId || messages.length === 0) return
    const unreadIds = messages.filter(m => !m.isRead && m.senderId !== authUser.id).map(m => m.id)
    if (unreadIds.length > 0) markPrivateMessagesRead(String(conversationId), unreadIds)
  }, [messages, authUser?.id, conversationId])

  const subscribeToMessages = useCallback(() => {
    if (!conversationId) return () => {}

    /*
     * One registry, three event kinds.
     *
     * `subscribeToConversation` keeps a single callback set per conversation
     * and the socket layer calls every callback in it for `private:message`,
     * `private:typing` AND `private:read`. So each handler here received the
     * other two payloads as well — `handleRead` did `data.messageIds.includes`
     * on a message payload and threw, which unmounted the screen the moment
     * the other person's first message arrived (simulator, 2026-09-12). Each
     * handler now checks the payload is its own before touching it.
     */
    const handleNewMessage: PrivateMessageCallback = (data) => {
      if (!('message' in data) || !data.message) return
      setMessages(prev => {
        if (prev.some(m => m.id === data.message.id)) return prev
        // Your own send echoed back before the request resolved is still your
        // send; the first message into an empty thread takes over from the card.
        if (prev.length === 0 || data.message.senderId === authUser?.id) markArriving(data.message.id)
        return [...prev, mapMessage(data.message)]
      })
      setIsOtherTyping(false)
      if (otherTypingTimeoutRef.current) { clearTimeout(otherTypingTimeoutRef.current); otherTypingTimeoutRef.current = null }
      if (isAtBottomRef.current) setTimeout(() => scrollToBottom(true), 80)
    }

    const handleTyping: PrivateTypingCallback = (data) => {
      if (typeof data.isTyping !== 'boolean') return
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
      if (!Array.isArray(data.messageIds)) return
      if (data.readBy === authUser?.id) return
      setMessages(prev => prev.map(m => data.messageIds.includes(m.id) ? { ...m, isRead: true } : m))
    }

    const u1 = subscribeToConversation(String(conversationId), handleNewMessage)
    const u2 = subscribeToConversation(String(conversationId), handleTyping)
    const u3 = subscribeToConversation(String(conversationId), handleRead)
    // ✓✓ delivered as their app gets them (SCRUM-408).
    const u4 = subscribeToDelivered((d) => {
      if (d.conversationId !== String(conversationId)) return
      const at = new Date().toISOString()
      setMessages(prev => prev.map(m => d.messageIds.includes(m.id) && !m.deliveredAt ? { ...m, deliveredAt: at } : m))
    })
    return () => { u1(); u2(); u3(); u4(); if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current) }
  }, [conversationId, authUser?.id, markArriving])

  useEffect(() => {
    if (!conversationId) return
    return subscribeToMessages()
  }, [conversationId, subscribeToMessages])

  /*
   * One send of one message, first time or retry. The bubble is already on
   * screen under a `local-` id, as the room does it: the text leaves the
   * composer and lands in the thread in the same frame, rather than after the
   * round trip. The answer swaps the local id for the server's, drops it
   * (moderation), or marks it "Not sent · Tap to retry" with the reason in a
   * toast.
   */
  const deliver = async (localId: string, messageText: string, opts: { clientId: string; replyToId?: string }) => {
    const { clientId, replyToId } = opts
    const markFailed = (reason: string) => {
      setMessages(prev => prev.map(m => m.id === localId ? { ...m, failed: true } : m))
      showToast(reason, 'error')
    }

    try {
      const result = await apiClient.sendPrivateMessage(String(conversationId), {
        text: messageText,
        clientId,
        ...(replyToId && { replyToId }),
      })

      const outcome = sendOutcome(result)
      if (outcome.kind === 'failed') {
        // The server's sentence when it wrote one for the person (`sendOutcome`).
        if (result.errorCode === 'RATE_LIMITED' || result.errorCode === 'SPAM_BLOCKED') {
          setComposerLock('rate_limited')
          if (lockTimerRef.current) clearTimeout(lockTimerRef.current)
          const ms = Math.min(Math.max(result.retryAfter ?? 5, 1), 120) * 1000
          lockTimerRef.current = setTimeout(() => setComposerLock(null), ms)
        }
        markFailed(outcome.reason)
        return
      }

      // Withheld by moderation: never left showing as sent (see `sendOutcome`).
      if (outcome.kind === 'withheld') {
        setMessages(prev => prev.filter(m => m.id !== localId))
        showTray('Not sent', 'That message was removed by moderation and was not delivered.')
        return
      }

      if (result.data) {
        const sent = mapMessage(result.data)
        /*
         * The socket can echo your own message before this response lands.
         * If the echo is already in the list, the local copy is the one to go;
         * otherwise the local bubble takes the server's id in place.
         */
        setMessages(prev => settleDirectMessage(prev, localId, sent))
        markDomainsDirty(['chat'])
      }
    } catch (error) {
      Logger.warn('private-chat', 'send failed', { error })
      markFailed("Couldn't send. Try again.")
    }
  }

  const sendMessage = async (text?: string) => {
    const messageText = (text ?? newMessage).trim()
    if (!messageText || sending || !authUser || !conversationId) return
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    stopPrivateTyping(String(conversationId))

    const replyTo = replyingTo
    const local: PrivateMessage = {
      ...optimisticDirectMessage(messageText, String(conversationId), authUser.id),
      // The same id on every try of this send (SCRUM-410), and what it replies to.
      clientId: newClientId(),
      ...(replyTo && !replyTo.failed && { replyToId: replyTo.id, replyTo: quoteFrom(replyTo) }),
    }
    markArriving(local.id)
    setMessages(prev => [...prev, local])
    if (text === undefined) setNewMessage('')
    setReplyingTo(null)
    setSending(true)
    // Your own send brings the end back into view and follows it again.
    follow.noteAtEnd(true)
    setTimeout(() => scrollToBottom(true), 80)

    if (authUser?.id) queryCache.invalidate(`personal_chats_${authUser.id}`)
    emitChatListUpdate({ type: 'personal', conversationId: String(conversationId), lastMessage: messageText, lastMessageTime: local.createdAt })

    // `deliver` catches its own failures, so this always runs.
    await deliver(local.id, messageText, { clientId: local.clientId ?? newClientId(), replyToId: local.replyToId })
    setSending(false)
  }

  const retrySend = (message: PrivateMessage) => {
    if (!message.text) return
    setMessages(prev => prev.map(m => m.id === message.id ? { ...m, failed: false } : m))
    void deliver(message.id, message.text, { clientId: message.clientId ?? newClientId(), replyToId: message.replyToId })
  }

  const chatItems: ChatListItem[] = React.useMemo(() => {
    const items: ChatListItem[] = []
    let lastDay: string | null = null
    for (const m of messages) {
      const day = toDayKey(m.createdAt)
      if (day !== lastDay) { items.push({ kind: 'separator', id: `sep-${day}`, label: formatDayLabel(m.createdAt) }); lastDay = day }
      items.push({ kind: 'message', ...m })
    }
    return withUnreadDivider(items, unread?.firstId, unread?.count ?? 0)
  }, [messages, unread])

  /*
   * Scroll to "N unread messages" once it is in the list (SCRUM-406). Once per
   * open; rows further up may not be measured yet, which is what
   * `onScrollToIndexFailed` below answers.
   */
  const anchoredRef = useRef(false)
  const dividerIndex = chatItems.findIndex(i => i.kind === 'unread')
  useEffect(() => {
    if (anchoredRef.current || dividerIndex < 0) return
    anchoredRef.current = true
    requestAnimationFrame(() =>
      flatListRef.current?.scrollToIndex({ index: dividerIndex, viewPosition: 0.1, animated: false })
    )
  }, [dividerIndex])

  /*
   * The long-press menu, as the app's one sheet (`lib/sheet.ts`).
   *
   * Every message can be copied. Theirs can also be reported; yours cannot —
   * reporting your own message is not a thing. It used to be report-only, so
   * a long press on your own message opened nothing and there was no way to
   * copy anything. A message that did not send offers Try again and Delete.
   */
  const showMessageMenu = (message: PrivateMessage) => {
    const isMe = message.senderId === authUser?.id
    const actions: SheetAction[] = []
    if (message.failed) actions.push({ label: 'Try again', variant: 'primary', then: () => retrySend(message) })
    else actions.push({ label: 'Reply', then: () => setReplyingTo(message) })
    actions.push({
      label: 'Copy',
      then: () => {
        Clipboard.setStringAsync(message.text || '')
          .then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
          .catch(() => {})
      },
    })
    if (message.failed) {
      actions.push({
        label: 'Delete',
        variant: 'destructive',
        then: () => setMessages(prev => prev.filter(m => m.id !== message.id)),
      })
    } else if (!isMe) {
      const messageId = message.id
      actions.push({ label: 'Report', variant: 'destructive', next: () => messageReportStep(messageId, 'private') })
    }
    actions.push({ label: 'Cancel', cancel: true })

    const text = message.text || ''
    showSheet({
      kind: 'actions',
      title: message.failed ? 'Not sent' : isMe ? 'Your message' : reveal?.displayName || 'Their message',
      message: text.length > 120 ? `${text.slice(0, 120)}…` : text,
      actions,
    })
  }
  // Read at the moment of the long press, so the handler below can stay stable.
  const messageMenuRef = useLatest(showMessageMenu)

  /*
   * Stable, so `ChatBubble`'s memo can bite: a conversation being typed in
   * re-renders on every keystroke, and an inline arrow would re-render every
   * mounted bubble each time.
   */
  const openMessageMenu = useCallback((message: PrivateMessage) => {
    // The same press-and-hold answer the room's message menu gives, on the
    // frame the sheet opens — the hold has "caught".
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    messageMenuRef.current(message)
  }, [messageMenuRef])

  const renderMessage = ({ item }: { item: PrivateMessage }) => {
    const isMe = item.senderId === authUser?.id
    return (
      <SwipeToReply enabled={!item.failed} onReply={() => setReplyingTo(item)}>
      <ChatBubble
        variant="direct"
        mine={isMe}
        animateIn={arrivingRef.current.has(item.id)}
        senderId={item.senderId}
        roomId={String(conversationId)}
        senderName={reveal?.displayName || 'Them'}
        text={item.text || ''}
        time={formatTime(item.createdAt)}
        /*
         * Only on your own, and only here. A room has twenty readers and twenty
         * different answers, so a tick there would either lie or need twenty.
         * A message that never arrived has nothing to tick.
         */
        receipt={isLocalMessage(item) ? null : receiptFor(item, authUser?.id)}
        replyTo={item.replyTo ? quoteLine(item.replyTo) : null}
        failed={item.failed}
        onRetry={item.failed ? () => retrySend(item) : undefined}
        // Every message can be copied; the menu decides whether Report is on it.
        onLongPress={() => openMessageMenu(item)}
      />
      </SwipeToReply>
    )
  }

  const renderChatItem = ({ item }: { item: ChatListItem }) => {
    // Same centred pill the room uses -- a date is the conversation narrating
    // itself, not something either person said.
    if (item.kind === 'separator' || item.kind === 'unread') return <SystemNotice label={item.label} />
    return renderMessage({ item })
  }

  const socketStatus = useLiveSync({
    enabled: !!authUser && !!conversationId,
    onSync: () => loadMessages(),
    domains: ['chat'],
    syncOnReconnect: true,
    disconnectedIntervalMs: 15000,
  })

  /*
   * The match header sits above the oldest message, permanently.
   *
   * Not an empty state. Tying it to "no messages yet" loses a race -- whoever
   * liked first gets the push, and if the other person types before they open
   * the app they arrive at an ordinary thread and never learn it came from a
   * match. It also flashes during pagination, when "no messages" and "not
   * loaded yet" look identical. As a header it is seen by both, whoever types
   * first, and scrolls away on its own as the conversation grows.
   */
  const opener = matchOpener({ fromMatch: reveal?.fromMatch, otherName: reveal?.displayName })
  const sayHi = emptyThreadLine(reveal?.displayName, (otherUserName as string) || null)

  const ListHeader = (
    <>
      {opener ? (
        <View style={styles.matchOpener}>
          <Text style={styles.matchOpenerTitle} maxFontSizeMultiplier={1.4}>
            {opener.title}
          </Text>
          <Text style={styles.matchOpenerBody} maxFontSizeMultiplier={1.4}>
            {opener.body}
          </Text>
        </View>
      ) : null}
      {loading ? (
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
      ) : null}
    </>
  )

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={styles.flex} behavior={KEYBOARD_BEHAVIOR}>
        <ChatHeader
          // Server-resolved. A pseudonym until they reveal, and the route param
          // only as a first paint before the fetch lands.
          name={reveal?.displayName || (otherUserName as string) || 'Chat'}
          avatar={directHeaderAvatar(reveal, otherImage, (otherUserAvatar as string) || null)}
          subtitle={reveal ? revealSubtitle(reveal) : null}
          onBack={() => router.back()}
          onProfile={openProfile}
          onOptions={() => {
            /*
             * The conversation sheet, not the profile one.
             *
             * `showUserSafetyActions` blocks and reports a person; it cannot
             * close this conversation, so from here it left the thread sitting
             * in both inboxes. `showConversationOptions` is about *this*
             * conversation and bundles the report into the same request.
             */
            if (reveal) {
              showConversationOptions(
                conversationId as string,
                reveal.displayName || (otherUserName as string) || 'them',
                // They know you if you revealed, or if this never was
                // pseudonymous — an accepted request showed them your name.
                reveal.youRevealed || reveal.pseudonymous === false,
                { onLeft: () => router.back(), fromMatch: reveal.fromMatch ?? true, onViewProfile: openProfile }
              )
            } else {
              /*
               * Not "Coming soon". The sheet's copy depends on what the
               * conversation record says, so without it the honest answer is
               * that it did not load — or has not yet — and a way to retry.
               */
              showTray(
                revealFailed ? "Couldn't load this conversation" : 'Still loading',
                revealFailed
                  ? 'Its options need the conversation details, which did not load.'
                  : 'The conversation details are on their way. Try again in a moment.',
                [
                  { label: 'Cancel', onPress: closeTray },
                  {
                    label: 'Try again',
                    variant: 'primary',
                    onPress: () => {
                      closeTray()
                      setRevealAttempt(n => n + 1)
                    },
                  },
                ]
              )
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
          // Touching the conversation to scroll it puts the keyboard away.
          keyboardDismissMode="on-drag"
          maxToRenderPerBatch={12}
          windowSize={10}
          initialNumToRender={25}
          ListHeaderComponent={ListHeader}
          /*
           * At the end of the feed rather than pinned above the composer -- it
           * is a thing happening in the conversation, and pinned it was equally
           * present whether you were reading the newest message or scrolled
           * back through a month of them.
           */
          ListFooterComponent={
            isOtherTyping ? (
              // The server's name for them, never the route param: a pseudonym
              // until they reveal, like every other line on this screen.
              <TypingIndicator label={typingLabel([reveal?.displayName ?? ''])} />
            ) : null
          }
          ListEmptyComponent={!loading && ended ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyGlyph}>
                <Ionicons name="chatbubble-ellipses-outline" size={36} color={EMBER.textTertiary} />
              </View>
              <Text style={styles.emptyTitle}>This conversation has ended</Text>
              <Text style={styles.emptyText}>It is no longer available to either of you.</Text>
            </View>
          ) : !loading && loadError ? (
            // Not the empty state: a thread that failed to load is not an
            // invitation to "Start the conversation".
            <ChatLoadFailed
              what="this conversation"
              onRetry={() => {
                setLoadError(false)
                setLoading(true)
                void loadMessages()
              }}
            />
          ) : !loading ? (
            /*
              Fades out as the first message lands rather than vanishing in the
              frame it arrives, so the card hands over to the bubble instead of
              being swapped for it.
            */
            <Animated.View style={styles.emptyContainer} exiting={fadeOutFast}>
              <View style={styles.emptyGlyph}>
                <Ionicons name="chatbubble-ellipses-outline" size={36} color={EMBER.textTertiary} />
              </View>
              <Text style={styles.emptyTitle}>Start the conversation!</Text>
              {/*
                This said "You matched with X" for EVERY empty thread, including
                an accepted message request, which was never a match. The header
                above already says so when it is true, so this stays neutral.
              */}
              {sayHi ? <Text style={styles.emptyText}>{sayHi}</Text> : null}
              {/*
                Sends for real. It used to be labelled "Send a wave" and only
                put "Hey 👋" in the composer, so the tap that promised a wave
                sent nothing.
              */}
              <ScalePress
                style={styles.emptyCta}
                onPress={() => void sendMessage('Hey 👋')}
                pressedScale={0.97}
                accessibilityRole="button"
                accessibilityLabel="Say hi"
                accessibilityHint="Sends “Hey 👋”"
              >
                <Text style={styles.emptyCtaText}>Say hi 👋</Text>
              </ScalePress>
            </Animated.View>
          ) : null}
          onContentSizeChange={follow.onContentSizeChange}
          onScrollToIndexFailed={(info) => {
            // Not measured yet: get close by the average row, then land on it.
            flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false })
            setTimeout(() => flatListRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.1, animated: false }), 120)
          }}
          onScrollBeginDrag={follow.onScrollBeginDrag}
          onScroll={(e) => {
            const offsetFromBottom = e.nativeEvent.contentSize.height - e.nativeEvent.contentOffset.y - e.nativeEvent.layoutMeasurement.height
            const atBottom = offsetFromBottom < 80
            isAtBottomRef.current = atBottom
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
            name={replyingTo.senderId === authUser?.id ? 'yourself' : reveal?.displayName || String(otherUserName || 'them')}
            text={replyingTo.text || ''}
            onCancel={() => setReplyingTo(null)}
          />
        ) : null}

        <ChatComposer
          value={newMessage}
          lock={composerLock}
          onSend={() => void sendMessage()}
          onFocus={() => setTimeout(() => scrollToBottom(false), 120)}
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
        />
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
  pressed: { opacity: OPACITY.pressed },
  /*
   * Frame-less by necessity -- the design has no thread header for this. Built
   * from the Banter's own card idiom (radius 32, p24) so it reads as part of
   * the product rather than a banner bolted on. Flagged in docs/BANTER.md for
   * a designer pass.
   */
  matchOpener: {
    marginTop: SPACE.lg,
    padding: SPACE.xl,
    borderRadius: EMBER_RADIUS.card,
    backgroundColor: EMBER.surfaceSunken,
    gap: SPACE.xs,
  },
  matchOpenerTitle: TYPE.heading,
  matchOpenerBody: { ...TYPE.body, color: EMBER.textSecondary },
  // A text action: `label` in `textPrimary` (docs/DESIGN_SYSTEM.md).
  loadMoreText: { ...TYPE.label, color: EMBER.textPrimary },

  // Messages


  // Day separator

  // Typing

  // Input bar — WhatsApp style: simple, no icons

  // Scroll to bottom
  scrollToBottomHit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollToBottomBtn: {
    position: 'absolute',
    right: GUTTER,
    bottom: 80,
    width: CONTROL.md,
    height: CONTROL.md,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty state
  emptyContainer: { alignItems: 'center', paddingHorizontal: SPACE.xxl, paddingTop: SPACE.xxxl },
  emptyGlyph: {
    width: 80,
    height: 80,
    borderRadius: EMBER_RADIUS.lg,
    backgroundColor: EMBER.surface,
    borderWidth: 1,
    borderColor: EMBER.separator,
    marginBottom: SPACE.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { ...TYPE.title, marginBottom: SPACE.sm },
  emptyText: { ...TYPE.body, color: EMBER.textSecondary, textAlign: 'center' },
  emptyCta: {
    marginTop: SPACE.lg,
    backgroundColor: EMBER.surface,
    borderRadius: EMBER_RADIUS.pill,
    height: CONTROL.md,
    justifyContent: 'center',
    paddingHorizontal: SPACE.xl,
  },
  // A secondary button: the composer's send is this screen's one accent.
  emptyCtaText: { ...TYPE.button, color: EMBER.textPrimary },
})


/*
 * Wrapped so `lib/perf.tsx` can report what this screen costs to render.
 * `ScreenProfiler` is the children untouched in production — see its header.
 */
export default function PrivateChat() {
  return (
    <ScreenProfiler id="dm">
      <PrivateChatInner />
    </ScreenProfiler>
  )
}

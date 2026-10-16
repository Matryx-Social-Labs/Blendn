import { router, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native'
import Animated, { Easing, FadeIn, FadeOut } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BrokenLink } from '../../components/chat/BrokenLink'
import { ChatHeader, chatHeaderBottom } from '../../components/chat/ChatHeader'
import { FeedSkeleton, HEADER_FACE, LoadOlder, NewestChip } from '../../components/chat/ChatParts'
import { DmMessageRow, MatchOpenerCard, NudgeLine, PhotoPreviewSheet, quoteText, RevealLine, RevealSheets, SayHi, type DmRowHandlers } from '../../components/chat/DmParts'
import { Avatar } from '../../components/ds/Avatar'
import { ChatBubble } from '../../components/ds/ChatBubble'
import type { Rect } from '../../components/ds/chatShared'
import { Composer } from '../../components/ds/Composer'
import { LongPressMenu, type MenuItem } from '../../components/ds/ContextMenu'
import type { Face } from '../../components/ds/Facepile'
import { Grain } from '../../components/ds/Grain'
import { ImageViewer } from '../../components/ds/ImageViewer'
import { Orbs } from '../../components/ds/Orbs'
import { RevealBar } from '../../components/ds/RevealBar'
import { StateScreen } from '../../components/ds/StateScreen'
import { TypingIndicator } from '../../components/ds/TypingIndicator'
import { DayPill, UnreadDivider as UnreadRule } from '../../components/ds/UnreadDivider'
import RealtimeStatusBanner from '../../components/RealtimeStatusBanner'
import { useToast } from '../../components/Toast'
import { apiClient } from '../../lib/apiClient'
import { runPlace } from '../../lib/chatFeed'
import { emitChatListUpdate } from '../../lib/chatListUpdates'
import { dmThread, draftOf, failedOf, keepFailed, setDraft } from '../../lib/chatOutbox'
import { copyText, linkSheet, notSentSheet } from '../../lib/chatSheets'
import { idParam, nameParam } from '../../lib/routeParams'
import { newClientId } from '../../lib/clientId'
import { revealView, type ConversationRevealState } from '../../lib/conversationReveal'
import { COLOR, DURATION, EASING, SIZE, SPACE } from '../../lib/design/tokens'
import {
  directHeaderAvatar,
  directMessageFrom,
  emptyThreadLine,
  isLocalMessage,
  optimisticDirectMessage,
  quoteFrom,
  settleDirectMessage,
  type PrivateMessage,
} from '../../lib/directThread'
import { H } from '../../lib/haptics'
import { KEYBOARD_BEHAVIOR, useKeyboardShown } from '../../lib/keyboard'
import { markDomainsDirty } from '../../lib/liveSyncState'
import { Logger } from '../../lib/logger'
import { draftParam, matchOpener } from '../../lib/matchOpener'
import { mergeNewestPage } from '../../lib/mergeNewestPage'
import { messageMenu } from '../../lib/messageMenu'
import { useActiveThread } from '../../lib/notifications'
import { ScreenProfiler } from '../../lib/perf'
import { pickImage, uploadChatPhoto } from '../../lib/photoUtils'
import { queryCache } from '../../lib/queryCache'
import { receiptFor } from '../../lib/receipts'
import { messageReportStep, showConversationOptions } from '../../lib/safetyUtils'
import { sendOutcome } from '../../lib/sendOutcome'
import { showSheet } from '../../lib/sheet'
import {
  markPrivateMessagesRead,
  startPrivateTyping,
  stopPrivateTyping,
  subscribeToConversation,
  subscribeToDelivered,
  type PrivateMessageCallback,
  type PrivateReadCallback,
  type PrivateTypingCallback,
} from '../../lib/socketClient'
import { chatClock } from '../../lib/time'
import { withDaySeparators, withUnreadDivider, type UnreadDivider } from '../../lib/unreadDivider'
import { useAuth } from '../../lib/useAuth'
import { useComposerLock } from '../../lib/useComposerLock'
import { scrollListToEnd, useFollowEnd } from '../../lib/useFollowEnd'
import { useLatest } from '../../lib/useLatest'
import { useLiveSync } from '../../lib/useLiveSync'
import { isOffline, useWaitingSends } from '../../lib/useWaitingSends'
import { userMessage } from '../../lib/userMessage'

type ChatListItem = ({ kind: 'message' } & PrivateMessage) | { kind: 'separator'; id: string; label: string } | UnreadDivider

const AT_END = 80
const KEYBOARD_DISMISS = Platform.OS === 'ios' ? 'interactive' : 'on-drag'
/** #23: the reveal resolves in with one M.settle-length crossfade. */
const REVEAL_MS = 700
const revealIn = FadeIn.duration(REVEAL_MS).easing(Easing.bezier(...EASING.gentle))
const revealOut = FadeOut.duration(DURATION.base)

/**
 * A direct message (Flow 5 DM frames, R3-0, R3-D5): the glass capsule header
 * with their round face, name and a one-line reveal state; the two-sided
 * reveal bar while either of you is a pseudonym; the match opener as a
 * permanent header; receipts under your last bubble; the composer says
 * "Message {name}", and once you can both see each other it takes a photo.
 */
function PrivateChatInner() {
  const { conversationId, otherUserName, otherUserId, draft } = useLocalSearchParams()
  const conversation = String(conversationId)
  const insets = useSafeAreaInsets()
  const keyboardUp = useKeyboardShown()
  // A push for this conversation is not shown over it (`lib/notifications.ts`).
  useActiveThread(`dm:${conversation}`)
  const { user: authUser } = useAuth()
  const myId = authUser?.id
  const thread = dmThread(conversation, myId)
  // A failed send survives leaving the thread (SCRUM-633).
  const [messages, setMessages] = useState<PrivateMessage[]>(() => failedOf<PrivateMessage>(thread))
  // Read by a refresh to decide whether the older-page cursor moves (lib/mergeNewestPage).
  const messagesRef = useLatest(messages)
  /*
   * The thread is gone — closed by the other side, or they blocked you; the
   * server answers "not found" for both and never says which (SCRUM-165).
   */
  const [ended, setEnded] = useState(false)
  // A suggested opener (the match moment's "Try …") fills the composer once; nothing sends until you do.
  const [newMessage, setNewMessage] = useState(() => draftParam(draft) || draftOf(thread))
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  // The message the next send replies to (SCRUM-409).
  const [replyingTo, setReplyingTo] = useState<PrivateMessage | null>(null)
  // Where the unread started when the thread opened (SCRUM-406).
  const [unread, setUnread] = useState<{ firstId: string; count: number } | null>(null)
  const composer = useComposerLock()
  const [isOtherTyping, setIsOtherTyping] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [oldestCursor, setOldestCursor] = useState<string | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [awayFromEnd, setAwayFromEnd] = useState(false)
  const [newWhileAway, setNewWhileAway] = useState(0)
  /* The identity of this conversation, from the server: only it can say whether they revealed to you. */
  const [reveal, setReveal] = useState<ConversationRevealState | null>(null)
  const [revealBusy, setRevealBusy] = useState(false)
  /** You asked them this session: the Asked state (the server keeps no "you asked"). */
  const [asked, setAsked] = useState(false)
  const [revealSheet, setRevealSheet] = useState<'confirm' | { notYet: string } | null>(null)
  /* The conversation's own record did not load: options says so and offers to try again. */
  const [revealFailed, setRevealFailed] = useState(false)
  const [revealAttempt, setRevealAttempt] = useState(0)
  const [otherId, setOtherId] = useState<string | null>(null)
  /** Their photo as the server resolves it: `null` until they reveal. */
  const [otherImage, setOtherImage] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [menu, setMenu] = useState<{ message: PrivateMessage; anchor: Rect } | null>(null)
  const [viewer, setViewer] = useState<{ message: PrivateMessage; from: Rect } | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [dockHeight, setDockHeight] = useState<number>(SIZE.input)
  const [barHeight, setBarHeight] = useState(0)
  const { showToast } = useToast()

  useEffect(() => {
    if (!conversationId) return
    let live = true
    apiClient.getConversation(conversation).then((r) => {
      if (!live) return
      if (!r.success || !r.data) return setRevealFailed(true)
      setRevealFailed(false)
      setOtherId(r.data.otherUser?.id || null)
      setOtherImage(r.data.otherUser?.image || null)
      setReveal({
        displayName: r.data.otherUser?.name || 'Someone',
        youRevealed: r.data.youRevealed ?? false,
        theyRevealed: r.data.theyRevealed ?? false,
        revealRequested: r.data.revealRequested ?? false,
        fromMatch: r.data.fromMatch === true,
        // Server-supplied; an older server without it falls back to the reveal fields' presence.
        pseudonymous: r.data.pseudonymous ?? r.data.youRevealed !== undefined,
      })
    })
    return () => {
      live = false
    }
  }, [conversationId, conversation, revealAttempt])

  const flatListRef = useRef<FlatList<ChatListItem>>(null)
  const isAtBottomRef = useRef(true)
  /* Messages that rise into place as they mount: the one you just sent, and the first into an empty thread. */
  const arrivingRef = useRef(new Set<string>())
  const markArriving = useCallback((id: string) => {
    arrivingRef.current.add(id)
    setTimeout(() => arrivingRef.current.delete(id), 1000)
  }, [])
  const initialLoadDoneRef = useRef(false)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingActiveSentRef = useRef(false)
  const otherTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setMessage = (id: string, change: (m: PrivateMessage) => PrivateMessage) => setMessages((prev) => prev.map((m) => (m.id === id ? change(m) : m)))

  // Their profile, only once they are a name to you: an accepted request, or a match who revealed.
  const profileId = otherId || idParam(otherUserId) || undefined
  const openProfile =
    reveal && (reveal.pseudonymous === false || reveal.theyRevealed) && profileId
      ? () => router.push({ pathname: '/user/[id]', params: { id: String(profileId) } } as never)
      : undefined
  const name = reveal?.displayName || nameParam(otherUserName) || 'Chat'
  const view = reveal ? revealView(reveal, asked) : null

  /* Ask them: the Asked state on the server's yes. No haptic (Flow 5 DM annotation). */
  const askThem = () => {
    if (!reveal || revealBusy) return
    setRevealBusy(true)
    void apiClient
      .requestReveal(conversation)
      .then((r) => {
        if (r.success) setAsked(true)
        else showToast(userMessage(r, "Couldn't ask them. Try again."), 'error')
      })
      .finally(() => setRevealBusy(false))
  }

  /*
   * Show them who you are. The confirmation is not ceremony: the server has no
   * path back, so the sheet says so before the tap. On the server's yes the
   * names resolve in (#23) with H.success; the photo gate's refusal is the
   * server's sentence, verbatim, in the Not yet sheet.
   */
  const showThem = () => {
    setRevealBusy(true)
    void apiClient
      .revealInConversation(conversation)
      .then((r) => {
        if (r.success) {
          H.success()
          setRevealSheet(null)
          setReveal((prev) => (prev ? { ...prev, youRevealed: true } : prev))
        } else {
          setRevealSheet({ notYet: userMessage(r, "Couldn't reveal. Try again.") })
        }
      })
      .finally(() => setRevealBusy(false))
  }

  const scrollToBottom = (animated = true) => scrollListToEnd(flatListRef.current, animated)
  const follow = useFollowEnd(() => scrollToBottom(false))

  const loadMessages = (cursor?: string) =>
    apiClient
      .getConversationMessages(conversation, { limit: 50, before: cursor })
      .then((result) => {
        if (!result.success && result.errorCode === 'NOT_FOUND') return setEnded(true)
        if (!result.success && !cursor) return setLoadError(true)
        if (!result.success || !result.data) return
        if (!cursor) setLoadError(false)
        const msgs = result.data.messages.map(directMessageFrom).reverse()
        let keptOlder = false
        if (cursor) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id))
            return [...msgs.filter((m) => !existingIds.has(m.id)), ...prev]
          })
        } else {
          // A refresh keeps the older pages already loaded, and a send only this phone holds.
          keptOlder = mergeNewestPage(messagesRef.current, msgs, (m) => m.id, isLocalMessage).keptOlder
          setMessages((prev) => mergeNewestPage(prev, msgs, (m) => m.id, isLocalMessage).items)
          // Open where they left off (SCRUM-406), once: a background refresh must not yank a reader.
          const firstUnreadId = result.data.firstUnreadId
          if (!initialLoadDoneRef.current && firstUnreadId && (result.data.unreadCount ?? 0) > 0) {
            setUnread({ firstId: firstUnreadId, count: result.data.unreadCount ?? 0 })
            follow.stop()
            if (!msgs.some((m) => m.id === firstUnreadId) && result.data.hasMore && result.data.nextCursor) {
              void loadBackTo(firstUnreadId, result.data.nextCursor)
            }
          }
          initialLoadDoneRef.current = true
        }
        if (!keptOlder) {
          setHasMore(result.data.hasMore)
          setOldestCursor(result.data.nextCursor)
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
      const r = await apiClient.getConversationMessages(conversation, { limit: 50, before: next })
      if (!r.success || !r.data) return
      const older = r.data.messages.map(directMessageFrom).reverse()
      setMessages((prev) => {
        const ids = new Set(prev.map((m) => m.id))
        return [...older.filter((m) => !ids.has(m.id)), ...prev]
      })
      setHasMore(r.data.hasMore)
      setOldestCursor(r.data.nextCursor)
      if (older.some((m) => m.id === messageId)) return
      next = r.data.hasMore ? r.data.nextCursor : null
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

  useEffect(() => {
    if (authUser && conversationId) loadMessages()
    // loadMessages is redefined every render; only the listed values should trigger a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, authUser])

  // Mark messages read when viewing.
  useEffect(() => {
    if (!myId || !conversationId || messages.length === 0) return
    const unreadIds = messages.filter((m) => !m.isRead && m.senderId !== myId && !isLocalMessage(m)).map((m) => m.id)
    if (unreadIds.length > 0) markPrivateMessagesRead(conversation, unreadIds)
  }, [messages, myId, conversationId, conversation])

  // This phone's unsent messages stay where the thread (and the Banter) can find them; the draft too.
  useEffect(() => keepFailed(thread, messages.filter((m) => m.failed || m.waiting)), [messages, thread])
  const draftRef = useLatest(newMessage)
  useEffect(() => () => setDraft(thread, draftRef.current), [thread, draftRef])

  const subscribeToMessages = useCallback(() => {
    if (!conversationId) return () => {}
    const onMessage: PrivateMessageCallback = (data) => {
      if (!data.message) return
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.message.id)) return prev
        // Your own send echoed before the request resolved is still yours; the first into an empty thread takes over from Say hi.
        if (prev.length === 0 || data.message.senderId === myId) markArriving(data.message.id)
        return [...prev, directMessageFrom(data.message)]
      })
      setIsOtherTyping(false)
      if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current)
      // Reading back: count it on the chip. Incoming plays no haptic.
      if (isAtBottomRef.current) setTimeout(() => scrollToBottom(true), 80)
      else if (data.message.senderId !== myId) setNewWhileAway((n) => n + 1)
    }
    const onTyping: PrivateTypingCallback = (data) => {
      if (data.userId === myId) return
      setIsOtherTyping(data.isTyping)
      if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current)
      if (data.isTyping) otherTypingTimeoutRef.current = setTimeout(() => setIsOtherTyping(false), 3000)
    }
    const onRead: PrivateReadCallback = (data) => {
      if (data.readBy === myId) return
      setMessages((prev) => prev.map((m) => (data.messageIds.includes(m.id) ? { ...m, isRead: true } : m)))
    }
    const u1 = subscribeToConversation(conversation, { onMessage, onTyping, onRead })
    // ✓✓ delivered as their app gets them (SCRUM-408).
    const u2 = subscribeToDelivered((d) => {
      if (d.conversationId !== conversation) return
      const at = new Date().toISOString()
      setMessages((prev) => prev.map((m) => (d.messageIds.includes(m.id) && !m.deliveredAt ? { ...m, deliveredAt: at } : m)))
    })
    return () => {
      u1()
      u2()
      if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current)
    }
  }, [conversationId, conversation, myId, markArriving])

  useEffect(() => {
    if (!conversationId) return
    return subscribeToMessages()
  }, [conversationId, subscribeToMessages])

  /*
   * One send of one message, first time or retry. The bubble is already on
   * screen under a `local-` id; the answer swaps it for the server's, drops it
   * to the removed placeholder (moderation), or marks it "Not sent" with the
   * server's reason — a photo's refusal verbatim, on the bubble (R3-D5 5.9).
   */
  const deliver = async (local: PrivateMessage) => {
    const fail = (line?: string) => {
      H.error()
      setMessage(local.id, (m) => ({ ...m, failed: true, waiting: false, progress: undefined, failedLine: line }))
    }
    try {
      let mediaUrl = local.mediaUrl ?? undefined
      if (local.localUri && !mediaUrl) {
        setMessage(local.id, (m) => ({ ...m, progress: 0 }))
        const up = await uploadChatPhoto(local.localUri, (p) => setMessage(local.id, (m) => ({ ...m, progress: p })))
        if (!up.ok) return fail(up.error)
        mediaUrl = up.url
        setMessage(local.id, (m) => ({ ...m, mediaUrl: up.url }))
      }
      const result = await apiClient.sendPrivateMessage(conversation, {
        ...(local.text ? { text: local.text } : {}),
        ...(mediaUrl ? { mediaUrl, mediaType: 'image' as const } : {}),
        clientId: local.clientId ?? newClientId(),
        ...(local.replyToId && { replyToId: local.replyToId }),
      })
      const outcome = sendOutcome(result)
      if (outcome.kind === 'failed') {
        // A rate limit or the spam filter locks the composer; anything else is the server's sentence.
        composer.apply(result.errorCode, result.retryAfter, result.error)
        if (mediaUrl) return fail(result.error || outcome.reason)
        fail()
        if (result.errorCode !== 'RATE_LIMITED' && result.errorCode !== 'SPAM_BLOCKED') showToast(outcome.reason, 'error')
        return
      }
      composer.apply(null)
      if (outcome.kind === 'withheld') {
        setMessage(local.id, (m) => ({ ...m, id: result.data?.id ?? m.id, removed: true, failed: false, progress: undefined }))
        showToast('That message wasn’t delivered.', 'info')
        return
      }
      if (result.data) {
        // The socket can echo your own message first: then the local copy goes.
        setMessages((prev) => settleDirectMessage(prev, local.id, directMessageFrom(result.data)))
        markDomainsDirty(['chat'])
      }
    } catch (error) {
      Logger.warn('private-chat', 'send failed', { error })
      fail()
      showToast("Couldn't send. Try again.", 'error')
    }
  }

  const holdForConnection = useWaitingSends<PrivateMessage>({
    waiting: () => messagesRef.current.filter((m) => m.waiting),
    resend: (m) => {
      setMessage(m.id, (x) => ({ ...x, waiting: false }))
      void deliver({ ...m, waiting: false })
    },
    expire: (id) => setMessage(id, (m) => (m.waiting ? { ...m, waiting: false, failed: true } : m)),
  })

  const send = async (text: string, photo?: string) => {
    if ((!text && !photo) || sending || !myId) return
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    stopPrivateTyping(conversation)
    const replyTo = replyingTo
    const offline = isOffline()
    const local: PrivateMessage = {
      ...optimisticDirectMessage(text || '', conversation, myId),
      ...(text ? {} : { text: null }),
      // The same id on every try of this send (SCRUM-410), and what it replies to.
      clientId: newClientId(),
      ...(photo ? { localUri: photo } : {}),
      ...(replyTo && !replyTo.failed && { replyToId: replyTo.id, replyTo: quoteFrom(replyTo) }),
      ...(offline ? { waiting: true } : {}),
    }
    markArriving(local.id)
    setMessages((prev) => [...prev, local])
    setReplyingTo(null)
    setSending(true)
    follow.noteAtEnd(true)
    setNewWhileAway(0)
    setTimeout(() => scrollToBottom(true), 80)
    if (myId) queryCache.invalidate(`personal_chats_${myId}`)
    emitChatListUpdate({ type: 'personal', conversationId: conversation, lastMessage: text || 'Photo', lastMessageTime: local.createdAt })
    if (offline) holdForConnection(local.id)
    else await deliver(local)
    setSending(false)
  }

  const sendTyped = () => {
    const text = newMessage.trim()
    if (!text) return
    setNewMessage('')
    void send(text)
  }

  const retrySend = (message: PrivateMessage) => {
    setMessage(message.id, (m) => ({ ...m, failed: false, failedLine: undefined }))
    void deliver({ ...message, failed: false, failedLine: undefined })
  }

  /* A photo: the library (no permission asked), then the preview (R3-D5 5.9). */
  const attach = async () => {
    const result = await pickImage('library')
    const uri = result?.assets?.[0]?.uri
    if (uri) setPicked(uri)
  }

  const chatItems: ChatListItem[] = useMemo(
    () => withUnreadDivider(withDaySeparators(messages, (m) => m.createdAt), unread?.firstId, unread?.count ?? 0),
    [messages, unread]
  )
  /* Your last message carries the receipt, under it (Flow 5 DM #12–#13); never in a room. */
  const lastMineId = useMemo(() => [...messages].reverse().find((m) => m.senderId === myId && !isLocalMessage(m))?.id, [messages, myId])

  /* Scroll to the unread rule once it is in the list (SCRUM-406). */
  const anchoredRef = useRef(false)
  const dividerIndex = chatItems.findIndex((i) => i.kind === 'unread')
  useEffect(() => {
    if (anchoredRef.current || dividerIndex < 0) return
    anchoredRef.current = true
    requestAnimationFrame(() => flatListRef.current?.scrollToIndex({ index: dividerIndex, viewPosition: 0.1, animated: false }))
  }, [dividerIndex])

  /* The long-press for a DM (R3-D5 5.2): no reactions; Reply · Copy (· Report… on theirs); Not sent opens its sheet. */
  const menuItems = (message: PrivateMessage): MenuItem[] => {
    const plan = messageMenu({
      surface: 'dm',
      mine: message.senderId === myId,
      state: message.removed ? 'removed' : message.failed ? 'failed' : isLocalMessage(message) ? 'sending' : 'sent',
      speech: true,
    })
    if (plan.kind !== 'menu') return []
    const items: Partial<Record<string, MenuItem>> = {
      reply: { icon: 'reply', label: 'Reply', onPress: () => setReplyingTo(message) },
      // Silent: no haptic, no toast (C20).
      copy: { icon: 'copy', label: 'Copy', onPress: () => copyText(message.text || '') },
      report: { icon: 'flag', label: 'Report…', onPress: () => showSheet(messageReportStep(message.id, 'private', { about: name })) },
    }
    return plan.items.flatMap((k) => (items[k] ? [items[k]] : []))
  }

  const openMenu = (message: PrivateMessage, anchor: Rect) => {
    const mine = message.senderId === myId
    const plan = messageMenu({ surface: 'dm', mine, state: message.removed ? 'removed' : message.failed ? 'failed' : isLocalMessage(message) ? 'sending' : 'sent', speech: true })
    if (plan.kind === 'none') return
    if (plan.kind === 'menu') return setMenu({ message, anchor })
    showSheet(
      notSentSheet({
        to: name,
        text: message.text || '',
        onRetry: () => retrySend(message),
        onDelete: () => setMessages((prev) => prev.filter((m) => m.id !== message.id)),
      })
    )
  }

  /* Stable for the rows' memo. */
  const handlersRef = useLatest({ openMenu, retrySend })
  const handlers = useMemo<DmRowHandlers>(
    () => ({
      menu: (m, a) => handlersRef.current.openMenu(m, a),
      retry: (m) => handlersRef.current.retrySend(m),
      reply: (m) => setReplyingTo(m),
      photo: (m, from) => setViewer({ message: m, from }),
      link: (url) => showSheet(linkSheet(url, 'dm')),
    }),
    [handlersRef]
  )

  const renderChatItem = ({ item, index }: { item: ChatListItem; index: number }) => {
    if (item.kind === 'separator') return <DayPill text={item.label} />
    if (item.kind === 'unread') return <UnreadRule count={unread?.count} word="unread" testID="dm-unread" />
    const place = runPlace(chatItems, index, (i) => (i.kind === 'message' ? i.senderId : null), (i) => (i.kind === 'message' ? Date.parse(i.createdAt) || 0 : 0))
    const mine = item.senderId === myId
    return (
      <DmMessageRow
        item={item}
        mine={mine}
        name={name}
        first={place.first}
        last={place.last}
        receipt={mine && item.id === lastMineId ? receiptFor(item, myId) : null}
        animate={arrivingRef.current.has(item.id)}
        handlers={handlers}
      />
    )
  }

  const socketStatus = useLiveSync({
    enabled: !!authUser && !!conversationId && !ended,
    onSync: () => loadMessages(),
    domains: ['chat'],
    syncOnReconnect: true,
    disconnectedIntervalMs: 15000,
  })

  /* The options: the conversation's own sheet (lib/safetyUtils), or why it can't open yet. */
  const openOptions = () => {
    if (reveal) {
      return showConversationOptions(conversation, name, reveal.youRevealed || reveal.pseudonymous === false, {
        onLeft: () => router.back(),
        fromMatch: reveal.fromMatch ?? true,
        onViewProfile: openProfile,
      })
    }
    showSheet({
      kind: 'actions',
      title: revealFailed ? 'Couldn’t load this conversation' : 'Still loading',
      message: revealFailed
        ? 'Its options need the conversation details, which did not load.'
        : 'The conversation details are on their way. Try again in a moment.',
      actions: [
        { label: 'Try again', variant: 'primary', then: () => setRevealAttempt((n) => n + 1) },
        { label: 'Cancel', cancel: true },
      ],
    })
  }

  const onChangeText = (text: string) => {
    setNewMessage(text)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    if (!text.length) {
      stopPrivateTyping(conversation)
      typingActiveSentRef.current = false
      return
    }
    if (!typingActiveSentRef.current) startPrivateTyping(conversation)
    typingActiveSentRef.current = true
    typingTimeoutRef.current = setTimeout(() => {
      stopPrivateTyping(conversation)
      typingActiveSentRef.current = false
    }, 2000)
  }

  const opener = matchOpener({ fromMatch: reveal?.fromMatch, otherName: reveal?.displayName })
  /* Faces only where they have been earned: theirs a photo once they revealed, yours once you did. */
  // Their mark until they reveal; then the server's photo — never one from the route.
  const head = ended ? null : directHeaderAvatar(reveal, otherImage)
  const themFace: Face =
    head?.kind === 'photo' ? { kind: 'photo', uri: head.url } : { kind: 'creature', pseudonym: head?.kind === 'mark' ? head.seed : ended ? 'Conversation' : name }
  const youFace: Face = reveal?.youRevealed && authUser?.image ? { kind: 'photo', uri: authUser.image } : { kind: 'creature', pseudonym: 'You' }
  // Photos once you can both see each other, or the conversation never hid anyone (R9, admin #697).
  const photosAllowed = !!reveal && (!reveal.pseudonymous || (reveal.youRevealed && reveal.theyRevealed))
  const top = chatHeaderBottom(insets.top)
  // The feed starts under the reveal bar while there is one.
  const barSpace = !ended && view?.bar ? barHeight : 0
  const dockBottom = keyboardUp ? SPACE.sm : Math.max(insets.bottom, SPACE.lg)
  const lock = composer.lock

  return (
    <View style={styles.screen}>
      <Orbs set="brand" paused={keyboardUp} />
      <Grain />
      <KeyboardAvoidingView style={styles.fill} behavior={KEYBOARD_BEHAVIOR}>
        {ended ? (
          // The composer goes; it never says whether you were blocked (Flow 5 DM #14).
          <StateScreen
            variant="screen"
            icon="message-circle-off"
            title="This conversation has ended"
            body="It is no longer available to either of you."
            actions={[{ label: 'Back to Banter', kind: 'secondary', onPress: () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/chat')) }]}
            testID="dm-ended"
          />
        ) : (
          <>
            <FlatList
              ref={flatListRef}
              testID="dm-feed"
              data={loading && !messages.length ? [] : chatItems}
              keyExtractor={(item) => item.id}
              renderItem={renderChatItem}
              style={styles.fill}
              contentContainerStyle={[styles.listContent, { paddingTop: top + barSpace, paddingBottom: dockHeight + dockBottom + SPACE.md }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={KEYBOARD_DISMISS}
              maxToRenderPerBatch={12}
              windowSize={10}
              initialNumToRender={25}
              onStartReached={() => void loadOlderMessages()}
              ListHeaderComponent={
                <View>
                  {/* Permanent, not an empty state: seen by both, whoever types first. */}
                  {opener ? <MatchOpenerCard you={youFace} them={themFace} title={opener.title} body={opener.body} /> : null}
                  {hasMore ? <LoadOlder busy={loadingOlder} onPress={() => void loadOlderMessages()} /> : null}
                </View>
              }
              ListFooterComponent={
                isOtherTyping ? (
                  <View style={styles.typing}>
                    <TypingIndicator surface="dm" people={[{ name }]} testID="dm-typing" />
                  </View>
                ) : null
              }
              ListEmptyComponent={
                loading ? (
                  <FeedSkeleton faces={false} />
                ) : loadError ? (
                  <View style={styles.centre}>
                    <StateScreen
                      icon="cloud-off"
                      title="Couldn’t load this conversation"
                      body="Check your connection and try again."
                      actions={[
                        {
                          label: 'Try again',
                          onPress: () => {
                            setLoadError(false)
                            setLoading(true)
                            void loadMessages()
                          },
                        },
                      ]}
                      testID="dm-failed"
                    />
                  </View>
                ) : (
                  // Sends for real: Say hi is "Hey 👋", at once (Flow 5 DM #10).
                  <SayHi line={emptyThreadLine(reveal?.displayName, nameParam(otherUserName) ?? null)} onPress={() => void send('Hey 👋')} />
                )
              }
              onContentSizeChange={follow.onContentSizeChange}
              onScrollToIndexFailed={(info) => {
                // Not measured yet: get close by the average row, then land on it.
                flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false })
                setTimeout(() => flatListRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.1, animated: false }), 120)
              }}
              onScrollBeginDrag={follow.onScrollBeginDrag}
              onScroll={(e) => {
                const { contentSize, contentOffset, layoutMeasurement } = e.nativeEvent
                const atBottom = contentSize.height - contentOffset.y - layoutMeasurement.height < AT_END
                isAtBottomRef.current = atBottom
                follow.noteAtEnd(atBottom)
                setAwayFromEnd(!atBottom)
                if (atBottom) setNewWhileAway(0)
              }}
              scrollEventThrottle={80}
            />
            {awayFromEnd && messages.length ? (
              <NewestChip
                count={newWhileAway}
                bottom={dockHeight + dockBottom + SPACE.lg}
                onPress={() => {
                  setNewWhileAway(0)
                  scrollToBottom(true)
                }}
              />
            ) : null}
            <View style={[styles.dock, { paddingBottom: dockBottom }]} onLayout={(e) => setDockHeight(e.nativeEvent.layout.height - dockBottom)}>
              <Composer
                testID="dm-composer"
                value={newMessage}
                onChangeText={onChangeText}
                onSend={sendTyped}
                state={lock?.state ?? 'normal'}
                reason={lock?.reason}
                countdown={composer.countdown}
                reply={replyingTo ? { name: replyingTo.senderId === myId ? 'yourself' : name, text: quoteText(quoteFrom(replyingTo)) } : null}
                onCancelReply={() => setReplyingTo(null)}
                placeholder={`Message ${name}`}
                onAttach={photosAllowed ? () => void attach() : undefined}
                onFocus={() => setTimeout(() => scrollToBottom(false), 120)}
              />
            </View>
          </>
        )}
      </KeyboardAvoidingView>

      <ChatHeader
        testID="dm-header"
        title={ended ? 'Conversation' : name}
        leading={
          <Animated.View key={themFace.kind === 'photo' ? themFace.uri : 'mark'} entering={revealIn}>
            <Avatar size={HEADER_FACE} {...themFace} />
          </Animated.View>
        }
        subtitle={!ended && view?.line ? <RevealLine seen={view.line.seen} text={view.line.text} /> : null}
        onBack={() => router.back()}
        moreLabel="Conversation options"
        onMore={openOptions}
        onIdentity={ended ? undefined : openProfile}
        identityHint="Opens their profile"
      />
      {/* The reveal stays in view under the header while either of you is a pseudonym; the feed starts below it. */}
      {!ended && view?.bar ? (
        <Animated.View
          key={view.bar}
          entering={revealIn}
          exiting={revealOut}
          onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
          style={[styles.reveal, { top }]}
        >
          <RevealBar
            state={view.bar}
            you={{ face: youFace, name: reveal?.youRevealed ? authUser?.name?.split(' ')[0] || 'You' : 'anonymous' }}
            them={{ face: themFace, name }}
            onShow={() => setRevealSheet('confirm')}
            onAsk={askThem}
            testID="dm-reveal"
          />
          {view.nudge ? <NudgeLine text={view.nudge} /> : null}
        </Animated.View>
      ) : null}
      {ended ? null : <RealtimeStatusBanner status={socketStatus} style={{ ...styles.banner, top: top + barSpace }} />}

      <LongPressMenu
        testID="dm-menu"
        visible={!!menu}
        anchor={menu?.anchor ?? null}
        side={menu && menu.message.senderId === myId ? 'right' : 'left'}
        items={menu ? menuItems(menu.message) : []}
        onClose={() => setMenu(null)}
      >
        {menu ? (
          <ChatBubble
            lifted
            surface="dm"
            mine={menu.message.senderId === myId}
            sender={{ name }}
            text={menu.message.text || (menu.message.mediaUrl ? 'Photo' : '')}
            time={chatClock(menu.message.createdAt)}
          />
        ) : null}
      </LongPressMenu>

      <ImageViewer
        testID="dm-viewer"
        visible={!!viewer}
        uri={viewer ? viewer.message.mediaUrl || viewer.message.localUri || '' : ''}
        sender={{ name: viewer && viewer.message.senderId === myId ? 'You' : name }}
        time={viewer ? chatClock(viewer.message.createdAt) : ''}
        from={viewer?.from}
        onClose={() => setViewer(null)}
        // Theirs can be reported from the viewer (#33); yours has nothing to report.
        onMore={
          viewer && viewer.message.senderId !== myId
            ? () => {
                const id = viewer.message.id
                setViewer(null)
                showSheet(messageReportStep(id, 'private', { about: name }))
              }
            : undefined
        }
      />

      <PhotoPreviewSheet
        uri={picked}
        name={name}
        onClose={() => setPicked(null)}
        onSend={(caption) => {
          const uri = picked
          setPicked(null)
          H.send()
          if (uri) void send(caption, uri)
        }}
      />

      <RevealSheets
        name={name}
        sheet={revealSheet}
        busy={revealBusy}
        onShow={showThem}
        onClose={() => setRevealSheet(null)}
        onAddPhoto={() => {
          setRevealSheet(null)
          router.push('/edit-profile')
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.ink },
  fill: { flex: 1 },
  listContent: { paddingHorizontal: SPACE.gutter, flexGrow: 1, justifyContent: 'flex-end' },
  reveal: { position: 'absolute', left: SPACE.lg, right: SPACE.lg, gap: SPACE.sm, paddingBottom: SPACE.md },
  typing: { marginTop: SPACE.lg },
  centre: { flexGrow: 1, justifyContent: 'center' },
  dock: { position: 'absolute', left: SPACE.lg, right: SPACE.lg, bottom: 0 },
  banner: { position: 'absolute', left: SPACE.gutter, right: SPACE.gutter },
})

/*
 * Wrapped so `lib/perf.tsx` can report what this screen costs to render.
 * `ScreenProfiler` is the children untouched in production — see its header.
 */
export default function PrivateChat() {
  if (!idParam(useLocalSearchParams().conversationId)) return <BrokenLink />
  return (
    <ScreenProfiler id="dm">
      <PrivateChatInner />
    </ScreenProfiler>
  )
}

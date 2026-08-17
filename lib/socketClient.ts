/**
 * Socket.io Client for Real-time Features
 * Handles event check-ins, chat messages, and other real-time updates
 */

import { io, Socket } from "socket.io-client"
import { AppState, AppStateStatus } from "react-native"
import { apiClient, TokenStorage } from "./apiClient"
import { markDomainsDirty } from "./liveSyncState"
import { Logger } from "./logger"
import { Sentry } from "./sentry"
import { buildAuthPayload } from "./socketAuth"

// Socket server URL
const SOCKET_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3000"

// Event types from server
export interface ServerToClientEvents {
  "event:checkin": (data: {
    eventId: string
    userId: string
    userName: string
    userImage?: string
    checkInTime: string
  }) => void
  "event:checkout": (data: {
    eventId: string
    userId: string
    checkOutTime: string
  }) => void
  "event:interestUpdate": (data: {
    eventId: string
    interested: boolean
    interestCount: number
    userId: string
  }) => void
  "chat:message": (data: {
    chatGroupId: string
    message: {
      id: string
      content: string
      type: string
      userId: string
      userName: string
      userImage?: string
      createdAt: string
      parentId?: string
    }
  }) => void
  "chat:typing": (data: {
    chatGroupId: string
    userId: string
    userName: string
    isTyping: boolean
  }) => void
  "chat:reaction": (data: {
    chatGroupId: string
    messageId: string
    userId: string
    emoji: string
    action: "add" | "remove"
  }) => void
  // Private messaging
  "private:message": (data: {
    conversationId: string
    message: {
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
  }) => void
  "private:typing": (data: {
    conversationId: string
    userId: string
    userName: string
    isTyping: boolean
  }) => void
  "private:read": (data: {
    conversationId: string
    messageIds: string[]
    readBy: string
  }) => void
  // Moderation events
  "chat:messageDeleted": (data: { chatGroupId: string; messageId: string }) => void
  "chat:memberBanned": (data: { chatGroupId: string; userId: string; banned: boolean }) => void
  error: (data: { message: string; code?: string }) => void
  connected: (data: { userId: string }) => void
}

interface ClientToServerEvents {
  "join:event": (eventId: string) => void
  "leave:event": (eventId: string) => void
  "join:chat": (chatGroupId: string) => void
  "leave:chat": (chatGroupId: string) => void
  "join:conversation": (conversationId: string) => void
  "leave:conversation": (conversationId: string) => void
  "chat:startTyping": (chatGroupId: string) => void
  "chat:stopTyping": (chatGroupId: string) => void
  "private:startTyping": (conversationId: string) => void
  "private:stopTyping": (conversationId: string) => void
  "private:markRead": (conversationId: string, messageIds: string[]) => void
  ping: () => void
}

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>

type SocketState = "connected" | "connecting" | "reconnecting" | "disconnected"

interface SocketConnectionStatus {
  state: SocketState
  connected: boolean
  reconnectAttempts: number
  lastConnectedAt: number | null
  lastError: string | null
}

// Subscription callback types
type EventCheckInCallback = (data: ServerToClientEvents["event:checkin"] extends (data: infer D) => void ? D : never) => void
type EventCheckOutCallback = (data: ServerToClientEvents["event:checkout"] extends (data: infer D) => void ? D : never) => void
type EventInterestCallback = (data: ServerToClientEvents["event:interestUpdate"] extends (data: infer D) => void ? D : never) => void
type ChatMessageCallback = (data: ServerToClientEvents["chat:message"] extends (data: infer D) => void ? D : never) => void
type ChatTypingCallback = (data: ServerToClientEvents["chat:typing"] extends (data: infer D) => void ? D : never) => void
type ChatReactionCallback = (data: ServerToClientEvents["chat:reaction"] extends (data: infer D) => void ? D : never) => void
type ChatMessageDeletedCallback = (data: ServerToClientEvents["chat:messageDeleted"] extends (data: infer D) => void ? D : never) => void
type ChatMemberBannedCallback = (data: ServerToClientEvents["chat:memberBanned"] extends (data: infer D) => void ? D : never) => void
type PrivateMessageCallback = (data: ServerToClientEvents["private:message"] extends (data: infer D) => void ? D : never) => void
type PrivateTypingCallback = (data: ServerToClientEvents["private:typing"] extends (data: infer D) => void ? D : never) => void
type PrivateReadCallback = (data: ServerToClientEvents["private:read"] extends (data: infer D) => void ? D : never) => void

// Connection state
let socket: TypedSocket | null = null
let isConnecting = false
let reconnectAttempts = 0
/*
 * Unlimited, deliberately.
 *
 * This was 5. socket.io counts failed attempts and, on reaching the cap, sets
 * `skipReconnect` — which is **permanent for the life of the socket**, not a
 * pause. Nothing listened for `reconnect_failed`, so five failures during a lift
 * ride, a tunnel or a token expiry killed realtime for the rest of the session
 * with no path back except the user finding the Retry button.
 *
 * A cap only makes sense where giving up is correct. For a socket whose whole
 * job is "tell me what is happening in this room right now", it never is: the
 * user is standing in the venue and the answer is always to keep trying.
 * `reconnectionDelayMax` already bounds how hard we try, so unlimited attempts
 * cost a poll every ten seconds rather than a busy loop.
 */
const MAX_RECONNECT_ATTEMPTS = Infinity
const RECONNECT_DELAY_BASE = 1000
let connectionStatus: SocketConnectionStatus = {
  state: "disconnected",
  connected: false,
  reconnectAttempts: 0,
  lastConnectedAt: null,
  lastError: null,
}
const connectionStatusSubscribers = new Set<(status: SocketConnectionStatus) => void>()

function emitConnectionStatus(patch: Partial<SocketConnectionStatus>): void {
  connectionStatus = { ...connectionStatus, ...patch }
  connectionStatusSubscribers.forEach((cb) => {
    try {
      cb(connectionStatus)
    } catch (error) {
      Sentry.captureException(error, { tags: { context: "socket-status-subscriber" } })
    }
  })
}

export function getConnectionStatus(): SocketConnectionStatus {
  return connectionStatus
}

export function subscribeConnectionStatus(
  callback: (status: SocketConnectionStatus) => void
): () => void {
  connectionStatusSubscribers.add(callback)
  callback(connectionStatus)
  return () => {
    connectionStatusSubscribers.delete(callback)
  }
}

// Subscriptions
const eventCheckInSubscriptions = new Map<string, Set<EventCheckInCallback>>()
const eventCheckOutSubscriptions = new Map<string, Set<EventCheckOutCallback>>()
const eventInterestSubscriptions = new Map<string, Set<EventInterestCallback>>()
const chatMessageSubscriptions = new Map<string, Set<ChatMessageCallback>>()
const chatTypingSubscriptions = new Map<string, Set<ChatTypingCallback>>()
const chatReactionSubscriptions = new Map<string, Set<ChatReactionCallback>>()
/*
 * One map per event, matching every other subscription in this file.
 *
 * These used to share a single `chatModerationSubscriptions` map, so both
 * handlers fired on both events and each was cast to whichever callback type
 * the emitting branch assumed. A "message deleted" subscriber was invoked with
 * a memberBanned payload and vice versa.
 *
 * It was benign only by accident: `handleDeleted` filters on `data.messageId`,
 * which is `undefined` on a ban and matches nothing, and `handleBanned` guards
 * on `data.banned`, which is `undefined` on a delete. Either handler gaining a
 * less careful guard, or either payload gaining the other's field, turns it
 * into a real one — a user shown "you have been removed from this chat"
 * because somebody's message was deleted.
 */
const chatMessageDeletedSubscriptions = new Map<string, Set<ChatMessageDeletedCallback>>()
const chatMemberBannedSubscriptions = new Map<string, Set<ChatMemberBannedCallback>>()
const conversationSubscriptions = new Map<string, Set<PrivateMessageCallback | PrivateTypingCallback | PrivateReadCallback>>()
const userSubscriptions = new Map<string, Set<PrivateMessageCallback>>()

// App state listener
let appStateSubscription: { remove: () => void } | null = null

/**
 * Initialize the socket connection
 */
export async function connect(): Promise<boolean> {
  if (socket?.connected) {
    Logger.debug("socket", "Already connected")
    emitConnectionStatus({
      state: "connected",
      connected: true,
      lastError: null,
    })
    return true
  }

  if (isConnecting) {
    Logger.debug("socket", "Connection already in progress")
    emitConnectionStatus({
      state: reconnectAttempts > 0 ? "reconnecting" : "connecting",
      connected: false,
    })
    return false
  }

  isConnecting = true
  emitConnectionStatus({
    state: reconnectAttempts > 0 ? "reconnecting" : "connecting",
    connected: false,
    reconnectAttempts,
  })

  try {
    const accessToken = await TokenStorage.getAccessToken()

    if (!accessToken) {
      Logger.warn("socket", "No access token available, cannot connect")
      isConnecting = false
      emitConnectionStatus({
        state: "disconnected",
        connected: false,
        lastError: "No access token",
      })
      return false
    }

    Logger.info("socket", `Connecting to socket server at: ${SOCKET_URL}`)

    socket = io(SOCKET_URL, {
      /*
       * A callback, and one that refreshes.
       *
       * This was `auth: { token: accessToken }` — a plain object captured once.
       * socket.io replays it verbatim on every reconnection attempt, and the
       * access token lives 15 minutes, so after a quarter of an hour idle every
       * retry failed the handshake with the same dead credential. Realtime only
       * came back if the user hit Retry, because only a fresh connect re-read
       * storage.
       *
       * Note that a callback alone would not have fixed it:
       * `TokenStorage.getAccessToken()` is a bare SecureStore read with no
       * expiry awareness, so re-reading serves the same expired token.
       * `buildAuthPayload` refreshes first. See lib/socketAuth.ts.
       */
      auth: (cb: (data: { token: string | null }) => void) => {
        buildAuthPayload({
          getToken: () => TokenStorage.getAccessToken(),
          refresh: () => apiClient.refreshSession(),
        })
          .then(cb)
          // buildAuthPayload does not reject, but socket.io does not await this
          // callback either — an escaped rejection here would be unhandled.
          .catch(() => cb({ token: accessToken }))
      },
      /*
       * WebSocket first, HTTP long-polling as a fallback.
       *
       * This was `["websocket"]` alone, which gives a single point of failure:
       * one failed upgrade and the client has no realtime at all, ever. That is
       * the wrong trade for a product used in venues -- conference and club
       * wifi, captive portals and some mobile carriers block or mangle
       * WebSocket while leaving ordinary HTTP alone, and chat going permanently
       * dead is far worse than chat running over polling.
       *
       * `tryAllTransports` is required, not optional. engine.io-client leaves it
       * `undefined` (falsy) by default, and its fallback is gated on it
       * (`socket.js:512`) -- so listing a second transport without this flag
       * changes nothing at all: the first failure is still terminal.
       */
      transports: ["websocket", "polling"],
      tryAllTransports: true,
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: RECONNECT_DELAY_BASE,
      reconnectionDelayMax: 10000,
      timeout: 20000,
    })

    // Set up event handlers
    setupSocketHandlers(socket)

    // Wait for connection
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        Logger.warn("socket", "Connection timeout")
        isConnecting = false
        emitConnectionStatus({
          state: "disconnected",
          connected: false,
          lastError: "Connection timeout",
        })
        resolve(false)
      }, 20000)

      socket!.on("connect", () => {
        clearTimeout(timeout)
        Logger.info("socket", "Connected successfully")
        isConnecting = false
        reconnectAttempts = 0
        emitConnectionStatus({
          state: "connected",
          connected: true,
          reconnectAttempts: 0,
          lastConnectedAt: Date.now(),
          lastError: null,
        })
        resolve(true)
      })

      socket!.on("connect_error", (error) => {
        clearTimeout(timeout)
        /*
         * `error.message` alone is not diagnosable. A transport failure and a
         * rejected token are the same shape to the caller, and "websocket
         * error" says nothing about which transport was in play, what the
         * underlying cause was, or which host was even being dialled -- all of
         * which cost real time to establish by hand. engine.io attaches a
         * `description` (the underlying event or HTTP status) and `context`.
         */
        const detail = error as Error & { description?: unknown; context?: unknown }
        Logger.error("socket", "Connection error", {
          error: detail.message,
          description:
            detail.description instanceof Error
              ? detail.description.message
              : detail.description,
          transport: socket?.io?.engine?.transport?.name,
          url: SOCKET_URL,
        })
        isConnecting = false
        emitConnectionStatus({
          state: "disconnected",
          connected: false,
          lastError: error.message || "Connection error",
        })
        resolve(false)
      })
    })
  } catch (error) {
    Logger.error("socket", "Failed to connect", { error })
    isConnecting = false
    emitConnectionStatus({
      state: "disconnected",
      connected: false,
      lastError: error instanceof Error ? error.message : "Failed to connect",
    })
    return false
  }
}

/**
 * Disconnect from the socket server
 */
export function disconnect(): void {
  if (socket) {
    Logger.info("socket", "Disconnecting...")
    socket.disconnect()
    socket = null
  }

  emitConnectionStatus({
    state: "disconnected",
    connected: false,
  })

  // Clear subscriptions
  eventCheckInSubscriptions.clear()
  eventCheckOutSubscriptions.clear()
  eventInterestSubscriptions.clear()
  chatMessageSubscriptions.clear()
  chatTypingSubscriptions.clear()
  chatReactionSubscriptions.clear()
  chatMessageDeletedSubscriptions.clear()
  chatMemberBannedSubscriptions.clear()
  conversationSubscriptions.clear()
  userSubscriptions.clear()
}

/**
 * Check if socket is connected
 */
export function isConnected(): boolean {
  return socket?.connected ?? false
}

/**
 * Rejoin all rooms that have active subscriptions.
 * Called after every (re)connect so server-side room membership is restored.
 */
function rejoinAllRooms(): void {
  if (!socket?.connected) return

  const eventIds = new Set<string>([
    ...eventCheckInSubscriptions.keys(),
    ...eventCheckOutSubscriptions.keys(),
    ...eventInterestSubscriptions.keys(),
  ])
  eventIds.forEach((id) => socket?.emit("join:event", id))
  const chatIds = new Set<string>([
    ...chatMessageSubscriptions.keys(),
    ...chatTypingSubscriptions.keys(),
    ...chatReactionSubscriptions.keys(),
  ])
  chatIds.forEach((id) => socket?.emit("join:chat", id))
  conversationSubscriptions.forEach((_, id) => socket?.emit("join:conversation", id))

  const roomCount = eventIds.size + chatIds.size + conversationSubscriptions.size
  if (roomCount > 0) {
    Logger.info("socket", `Rejoined ${roomCount} rooms after connect`)
  }
}

/**
 * Set up socket event handlers
 */
function setupSocketHandlers(sock: TypedSocket): void {
  // Rejoin all subscribed rooms on every (re)connect
  sock.on("connect", () => {
    Logger.info("socket", "Socket (re)connected, rejoining rooms")
    rejoinAllRooms()
  })

  sock.on("connected", (data) => {
    Logger.info("socket", "Authenticated", { userId: data.userId })
  })

  sock.on("error", (data) => {
    Logger.error("socket", "Server error", { message: data.message, code: data.code })
  })

  sock.on("disconnect", (reason) => {
    Logger.warn("socket", "Disconnected", { reason })
    emitConnectionStatus({
      state: "disconnected",
      connected: false,
      lastError: reason || "Disconnected",
    })

    // Attempt to reconnect if not intentional
    if (reason === "io server disconnect") {
      // Server disconnected us, try to reconnect with new token
      handleReconnect()
    }
  })

  /*
   * The listener whose absence made the retry cap permanent.
   *
   * socket.io fires this once it has exhausted `reconnectionAttempts` and set
   * `skipReconnect`, after which the manager never tries again on its own. With
   * the cap now Infinity this should be unreachable — which is exactly why it is
   * worth having: if it ever fires, something has reintroduced a finite cap, and
   * a silent permanent disconnect is the hardest failure in this file to
   * diagnose from a user report ("it just stopped updating").
   */
  sock.io.on("reconnect_failed", () => {
    Logger.error("socket", "Reconnection gave up permanently — this should be unreachable")
    Sentry.captureMessage("socket reconnect_failed despite unlimited attempts")
    emitConnectionStatus({
      state: "disconnected",
      connected: false,
      lastError: "Reconnection gave up",
    })
    // Do not leave it dead. Once skipReconnect is set, a fresh socket is the
    // only way back — `connect()` tears the old one down and builds one.
    void connect()
  })

  sock.io.on("reconnect", (attempt: number) => {
    Logger.info("socket", "Reconnected", { attempt })
    reconnectAttempts = 0
  })

  // Event updates
  sock.on("event:checkin", (data) => {
    markDomainsDirty(["events", "match"])
    const callbacks = eventCheckInSubscriptions.get(data.eventId)
    callbacks?.forEach((cb) => cb(data))
  })

  sock.on("event:checkout", (data) => {
    markDomainsDirty(["events", "match"])
    const callbacks = eventCheckOutSubscriptions.get(data.eventId)
    callbacks?.forEach((cb) => cb(data))
  })

  sock.on("event:interestUpdate", (data) => {
    markDomainsDirty(["events", "match"])
    const callbacks = eventInterestSubscriptions.get(data.eventId)
    callbacks?.forEach((cb) => cb(data))
  })

  // Chat updates
  sock.on("chat:message", (data) => {
    markDomainsDirty(["chat"])
    chatMessageSubscriptions.get(data.chatGroupId)?.forEach((cb) => cb(data))
  })

  sock.on("chat:typing", (data) => {
    chatTypingSubscriptions.get(data.chatGroupId)?.forEach((cb) => cb(data))
  })

  sock.on("chat:reaction", (data) => {
    chatReactionSubscriptions.get(data.chatGroupId)?.forEach((cb) => cb(data))
  })

  sock.on("chat:messageDeleted", (data) => {
    chatMessageDeletedSubscriptions.get(data.chatGroupId)?.forEach((cb) => cb(data))
  })

  sock.on("chat:memberBanned", (data) => {
    chatMemberBannedSubscriptions.get(data.chatGroupId)?.forEach((cb) => cb(data))
  })

  // Private messaging updates
  sock.on("private:message", (data) => {
    markDomainsDirty(["chat", "match"])
    // Notify conversation subscribers
    const callbacks = conversationSubscriptions.get(data.conversationId)
    callbacks?.forEach((cb) => (cb as PrivateMessageCallback)(data))

    // Also notify user-level subscribers (for chat list updates)
    userSubscriptions.forEach((userCallbacks) => {
      userCallbacks.forEach((cb) => cb(data))
    })
  })

  sock.on("private:typing", (data) => {
    const callbacks = conversationSubscriptions.get(data.conversationId)
    callbacks?.forEach((cb) => (cb as PrivateTypingCallback)(data))
  })

  sock.on("private:read", (data) => {
    const callbacks = conversationSubscriptions.get(data.conversationId)
    callbacks?.forEach((cb) => (cb as PrivateReadCallback)(data))
  })
}

/**
 * Handle reconnection with exponential backoff
 */
async function handleReconnect(): Promise<void> {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    Logger.error("socket", "Max reconnect attempts reached, giving up", { reconnectAttempts })
    emitConnectionStatus({
      state: "disconnected",
      connected: false,
      reconnectAttempts,
      lastError: "Max reconnect attempts reached",
    })
    return
  }

  reconnectAttempts++
  const delay = RECONNECT_DELAY_BASE * Math.pow(2, reconnectAttempts - 1)

  Logger.info("socket", `Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`)
  emitConnectionStatus({
    state: "reconnecting",
    connected: false,
    reconnectAttempts,
  })

  await new Promise((resolve) => setTimeout(resolve, delay))

  // Get fresh token and reconnect
  await connect()
}

// === Event Subscriptions ===

/**
 * Subscribe to event updates (check-ins, check-outs, interest)
 */
function subscribeToEventMap<TCallback>(
  eventId: string,
  callback: TCallback,
  targetMap: Map<string, Set<TCallback>>
): () => void {
  if (!socket?.connected) {
    // connect() is async; room will be joined by the connect handler via rejoinAllRooms()
    connect()
  } else {
    socket.emit("join:event", eventId)
  }

  // Add to subscriptions
  if (!targetMap.has(eventId)) {
    targetMap.set(eventId, new Set())
  }
  targetMap.get(eventId)!.add(callback)

  // Return unsubscribe function
  return () => {
    const callbacks = targetMap.get(eventId)
    if (callbacks) {
      callbacks.delete(callback)
      if (callbacks.size === 0) {
        targetMap.delete(eventId)
        const hasAnyEventSubs = eventCheckInSubscriptions.has(eventId)
          || eventCheckOutSubscriptions.has(eventId)
          || eventInterestSubscriptions.has(eventId)
        if (!hasAnyEventSubs) {
          socket?.emit("leave:event", eventId)
        }
      }
    }
  }
}

/**
 * Subscribe only to event check-in updates.
 */
export function subscribeToEventCheckIn(
  eventId: string,
  callback: EventCheckInCallback
): () => void {
  return subscribeToEventMap(eventId, callback, eventCheckInSubscriptions)
}

/**
 * Subscribe only to event check-out updates.
 */
export function subscribeToEventCheckOut(
  eventId: string,
  callback: EventCheckOutCallback
): () => void {
  return subscribeToEventMap(eventId, callback, eventCheckOutSubscriptions)
}

/**
 * Subscribe only to event interest updates.
 */
export function subscribeToEventInterest(
  eventId: string,
  callback: EventInterestCallback
): () => void {
  return subscribeToEventMap(eventId, callback, eventInterestSubscriptions)
}

/**
 * Backward-compatible helper.
 * Deprecated: prefer specific subscription helpers above.
 */
export function subscribeToEvent(
  eventId: string,
  callback: EventCheckInCallback | EventCheckOutCallback | EventInterestCallback
): () => void {
  return subscribeToEventCheckIn(eventId, callback as EventCheckInCallback)
}

// === Chat Subscriptions ===

function subscribeToChatMap<T>(
  chatGroupId: string,
  callback: T,
  targetMap: Map<string, Set<T>>
): () => void {
  if (!socket?.connected) {
    connect()
  } else {
    socket.emit("join:chat", chatGroupId)
  }

  if (!targetMap.has(chatGroupId)) {
    targetMap.set(chatGroupId, new Set())
  }
  targetMap.get(chatGroupId)!.add(callback)

  return () => {
    const callbacks = targetMap.get(chatGroupId)
    if (callbacks) {
      callbacks.delete(callback)
      if (callbacks.size === 0) {
        targetMap.delete(chatGroupId)
        const hasAny = chatMessageSubscriptions.has(chatGroupId)
          || chatTypingSubscriptions.has(chatGroupId)
          || chatReactionSubscriptions.has(chatGroupId)
        if (!hasAny) {
          socket?.emit("leave:chat", chatGroupId)
        }
      }
    }
  }
}

/**
 * Subscribe to chat messages for a specific chat group.
 */
export function subscribeToChatMessage(
  chatGroupId: string,
  callback: ChatMessageCallback
): () => void {
  return subscribeToChatMap(chatGroupId, callback, chatMessageSubscriptions)
}

/**
 * Subscribe to typing indicators for a specific chat group.
 */
export function subscribeToChatTyping(
  chatGroupId: string,
  callback: ChatTypingCallback
): () => void {
  return subscribeToChatMap(chatGroupId, callback, chatTypingSubscriptions)
}

/**
 * Subscribe to reaction events for a specific chat group.
 */
export function subscribeToChatReaction(
  chatGroupId: string,
  callback: ChatReactionCallback
): () => void {
  return subscribeToChatMap(chatGroupId, callback, chatReactionSubscriptions)
}

/**
 * @deprecated Use subscribeToChatMessage, subscribeToChatTyping, or subscribeToChatReaction instead.
 * Kept for backward compatibility — routes to subscribeToChatMessage.
 */
export function subscribeToChat(
  chatGroupId: string,
  callback: ChatMessageCallback | ChatTypingCallback | ChatReactionCallback
): () => void {
  return subscribeToChatMap(chatGroupId, callback as ChatMessageCallback, chatMessageSubscriptions)
}

/**
 * Subscribe to chat moderation events (message deleted, member banned)
 */
function subscribeIn<C>(
  map: Map<string, Set<C>>,
  chatGroupId: string,
  callback: C
): () => void {
  if (!map.has(chatGroupId)) map.set(chatGroupId, new Set())
  map.get(chatGroupId)!.add(callback)

  return () => {
    const callbacks = map.get(chatGroupId)
    if (!callbacks) return
    callbacks.delete(callback)
    if (callbacks.size === 0) map.delete(chatGroupId)
  }
}

/** A message was removed, by its author or by a moderator. */
export function subscribeToChatMessageDeleted(
  chatGroupId: string,
  callback: ChatMessageDeletedCallback
): () => void {
  return subscribeIn(chatMessageDeletedSubscriptions, chatGroupId, callback)
}

/** A member was banned from, or unbanned in, this room. */
export function subscribeToChatMemberBanned(
  chatGroupId: string,
  callback: ChatMemberBannedCallback
): () => void {
  return subscribeIn(chatMemberBannedSubscriptions, chatGroupId, callback)
}

/**
 * Start typing indicator
 */
export function startTyping(chatGroupId: string): void {
  socket?.emit("chat:startTyping", chatGroupId)
}

/**
 * Stop typing indicator
 */
export function stopTyping(chatGroupId: string): void {
  socket?.emit("chat:stopTyping", chatGroupId)
}

// === Private Conversation Subscriptions ===

/**
 * Subscribe to private conversation updates (messages, typing, read receipts)
 */
export function subscribeToConversation(
  conversationId: string,
  callback: PrivateMessageCallback | PrivateTypingCallback | PrivateReadCallback
): () => void {
  if (!socket?.connected) {
    // connect() is async; room will be joined by the connect handler via rejoinAllRooms()
    connect()
  } else {
    socket.emit("join:conversation", conversationId)
  }

  // Add to subscriptions
  if (!conversationSubscriptions.has(conversationId)) {
    conversationSubscriptions.set(conversationId, new Set())
  }
  conversationSubscriptions.get(conversationId)!.add(callback)

  // Return unsubscribe function
  return () => {
    const callbacks = conversationSubscriptions.get(conversationId)
    if (callbacks) {
      callbacks.delete(callback)
      if (callbacks.size === 0) {
        conversationSubscriptions.delete(conversationId)
        socket?.emit("leave:conversation", conversationId)
      }
    }
  }
}

/**
 * Start typing indicator for private conversation
 */
export function startPrivateTyping(conversationId: string): void {
  socket?.emit("private:startTyping", conversationId)
}

/**
 * Stop typing indicator for private conversation
 */
export function stopPrivateTyping(conversationId: string): void {
  socket?.emit("private:stopTyping", conversationId)
}

/**
 * Mark messages as read in private conversation
 */
export function markPrivateMessagesRead(conversationId: string, messageIds: string[]): void {
  socket?.emit("private:markRead", conversationId, messageIds)
}

// === User-level Subscriptions ===

/**
 * Subscribe to user-level notifications (private messages when not in conversation)
 */
export function subscribeToUserNotifications(
  userId: string,
  callback: PrivateMessageCallback
): () => void {
  if (!socket?.connected) {
    connect()
  }

  // User room is automatically joined server-side on connection, no need to emit join
  // Add to subscriptions
  if (!userSubscriptions.has(userId)) {
    userSubscriptions.set(userId, new Set())
  }
  userSubscriptions.get(userId)!.add(callback)

  // Return unsubscribe function
  return () => {
    const callbacks = userSubscriptions.get(userId)
    if (callbacks) {
      callbacks.delete(callback)
      if (callbacks.size === 0) {
        userSubscriptions.delete(userId)
      }
    }
  }
}

// === App State Management ===

/**
 * Initialize socket with app state management
 */
export function initSocketWithAppState(): void {
  if (appStateSubscription) return

  appStateSubscription = AppState.addEventListener("change", handleAppStateChange)

  // Connect if app is active
  if (AppState.currentState === "active") {
    connect()
  }
}

/**
 * Handle app state changes
 */
async function handleAppStateChange(state: AppStateStatus): Promise<void> {
  Logger.debug("socket", `App state changed to: ${state}`)

  if (state === "active") {
    // App came to foreground, reconnect if needed
    // Room rejoining is handled automatically by the connect handler in setupSocketHandlers
    if (!socket?.connected) {
      await connect()
    }
  } else {
    // App went to background, disconnect to save battery
    // Note: In production, you might want to keep the connection
    // for push-like functionality
  }
}

/**
 * Cleanup socket and app state listener
 */
export function cleanup(): void {
  disconnect()

  if (appStateSubscription) {
    appStateSubscription.remove()
    appStateSubscription = null
  }
}

// Export types for consumers
export type {
  SocketConnectionStatus,
  EventCheckInCallback,
  EventCheckOutCallback,
  EventInterestCallback,
  ChatMessageCallback,
  ChatTypingCallback,
  ChatReactionCallback,
  ChatMessageDeletedCallback,
  ChatMemberBannedCallback,
  PrivateMessageCallback,
  PrivateTypingCallback,
  PrivateReadCallback,
}

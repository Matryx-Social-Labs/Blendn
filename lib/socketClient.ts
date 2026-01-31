/**
 * Socket.io Client for Real-time Features
 * Handles event check-ins, chat messages, and other real-time updates
 */

import { io, Socket } from "socket.io-client"
import { AppState, AppStateStatus } from "react-native"
import { TokenStorage } from "./apiClient"
import { Logger } from "./logger"

// Socket server URL
const SOCKET_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3000"

// Event types from server
interface ServerToClientEvents {
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

// Subscription callback types
type EventCheckInCallback = (data: ServerToClientEvents["event:checkin"] extends (data: infer D) => void ? D : never) => void
type EventCheckOutCallback = (data: ServerToClientEvents["event:checkout"] extends (data: infer D) => void ? D : never) => void
type EventInterestCallback = (data: ServerToClientEvents["event:interestUpdate"] extends (data: infer D) => void ? D : never) => void
type ChatMessageCallback = (data: ServerToClientEvents["chat:message"] extends (data: infer D) => void ? D : never) => void
type ChatTypingCallback = (data: ServerToClientEvents["chat:typing"] extends (data: infer D) => void ? D : never) => void
type ChatReactionCallback = (data: ServerToClientEvents["chat:reaction"] extends (data: infer D) => void ? D : never) => void
type PrivateMessageCallback = (data: ServerToClientEvents["private:message"] extends (data: infer D) => void ? D : never) => void
type PrivateTypingCallback = (data: ServerToClientEvents["private:typing"] extends (data: infer D) => void ? D : never) => void
type PrivateReadCallback = (data: ServerToClientEvents["private:read"] extends (data: infer D) => void ? D : never) => void

// Connection state
let socket: TypedSocket | null = null
let isConnecting = false
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_DELAY_BASE = 1000

// Subscriptions
const eventSubscriptions = new Map<string, Set<EventCheckInCallback | EventCheckOutCallback | EventInterestCallback>>()
const chatSubscriptions = new Map<string, Set<ChatMessageCallback | ChatTypingCallback | ChatReactionCallback>>()
const conversationSubscriptions = new Map<string, Set<PrivateMessageCallback | PrivateTypingCallback | PrivateReadCallback>>()

// App state listener
let appStateSubscription: { remove: () => void } | null = null

/**
 * Initialize the socket connection
 */
export async function connect(): Promise<boolean> {
  if (socket?.connected) {
    Logger.debug("socket", "Already connected")
    return true
  }

  if (isConnecting) {
    Logger.debug("socket", "Connection already in progress")
    return false
  }

  isConnecting = true

  try {
    const accessToken = await TokenStorage.getAccessToken()

    if (!accessToken) {
      Logger.warn("socket", "No access token available, cannot connect")
      isConnecting = false
      return false
    }

    Logger.info("socket", "Connecting to socket server...")

    socket = io(SOCKET_URL, {
      auth: { token: accessToken },
      transports: ["websocket"],
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
        resolve(false)
      }, 20000)

      socket!.on("connect", () => {
        clearTimeout(timeout)
        Logger.info("socket", "Connected successfully")
        isConnecting = false
        reconnectAttempts = 0
        resolve(true)
      })

      socket!.on("connect_error", (error) => {
        clearTimeout(timeout)
        Logger.error("socket", "Connection error", { error: error.message })
        isConnecting = false
        resolve(false)
      })
    })
  } catch (error) {
    Logger.error("socket", "Failed to connect", { error })
    isConnecting = false
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

  // Clear subscriptions
  eventSubscriptions.clear()
  chatSubscriptions.clear()
  conversationSubscriptions.clear()
}

/**
 * Check if socket is connected
 */
export function isConnected(): boolean {
  return socket?.connected ?? false
}

/**
 * Set up socket event handlers
 */
function setupSocketHandlers(sock: TypedSocket): void {
  sock.on("connected", (data) => {
    Logger.info("socket", "Authenticated", { userId: data.userId })
  })

  sock.on("error", (data) => {
    Logger.error("socket", "Server error", { message: data.message, code: data.code })
  })

  sock.on("disconnect", (reason) => {
    Logger.warn("socket", "Disconnected", { reason })

    // Attempt to reconnect if not intentional
    if (reason === "io server disconnect") {
      // Server disconnected us, try to reconnect with new token
      handleReconnect()
    }
  })

  // Event updates
  sock.on("event:checkin", (data) => {
    const callbacks = eventSubscriptions.get(data.eventId)
    callbacks?.forEach((cb) => (cb as EventCheckInCallback)(data))
  })

  sock.on("event:checkout", (data) => {
    const callbacks = eventSubscriptions.get(data.eventId)
    callbacks?.forEach((cb) => (cb as EventCheckOutCallback)(data))
  })

  sock.on("event:interestUpdate", (data) => {
    const callbacks = eventSubscriptions.get(data.eventId)
    callbacks?.forEach((cb) => (cb as EventInterestCallback)(data))
  })

  // Chat updates
  sock.on("chat:message", (data) => {
    const callbacks = chatSubscriptions.get(data.chatGroupId)
    callbacks?.forEach((cb) => (cb as ChatMessageCallback)(data))
  })

  sock.on("chat:typing", (data) => {
    const callbacks = chatSubscriptions.get(data.chatGroupId)
    callbacks?.forEach((cb) => (cb as ChatTypingCallback)(data))
  })

  sock.on("chat:reaction", (data) => {
    const callbacks = chatSubscriptions.get(data.chatGroupId)
    callbacks?.forEach((cb) => (cb as ChatReactionCallback)(data))
  })

  // Private messaging updates
  sock.on("private:message", (data) => {
    const callbacks = conversationSubscriptions.get(data.conversationId)
    callbacks?.forEach((cb) => (cb as PrivateMessageCallback)(data))
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
    Logger.warn("socket", "Max reconnect attempts reached")
    return
  }

  reconnectAttempts++
  const delay = RECONNECT_DELAY_BASE * Math.pow(2, reconnectAttempts - 1)

  Logger.info("socket", `Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`)

  await new Promise((resolve) => setTimeout(resolve, delay))

  // Get fresh token and reconnect
  await connect()
}

// === Event Subscriptions ===

/**
 * Subscribe to event updates (check-ins, check-outs, interest)
 */
export function subscribeToEvent(
  eventId: string,
  callback: EventCheckInCallback | EventCheckOutCallback | EventInterestCallback
): () => void {
  if (!socket?.connected) {
    connect()
  }

  // Join event room
  socket?.emit("join:event", eventId)

  // Add to subscriptions
  if (!eventSubscriptions.has(eventId)) {
    eventSubscriptions.set(eventId, new Set())
  }
  eventSubscriptions.get(eventId)!.add(callback)

  // Return unsubscribe function
  return () => {
    const callbacks = eventSubscriptions.get(eventId)
    if (callbacks) {
      callbacks.delete(callback)
      if (callbacks.size === 0) {
        eventSubscriptions.delete(eventId)
        socket?.emit("leave:event", eventId)
      }
    }
  }
}

// === Chat Subscriptions ===

/**
 * Subscribe to chat updates (messages, typing, reactions)
 */
export function subscribeToChat(
  chatGroupId: string,
  callback: ChatMessageCallback | ChatTypingCallback | ChatReactionCallback
): () => void {
  if (!socket?.connected) {
    connect()
  }

  // Join chat room
  socket?.emit("join:chat", chatGroupId)

  // Add to subscriptions
  if (!chatSubscriptions.has(chatGroupId)) {
    chatSubscriptions.set(chatGroupId, new Set())
  }
  chatSubscriptions.get(chatGroupId)!.add(callback)

  // Return unsubscribe function
  return () => {
    const callbacks = chatSubscriptions.get(chatGroupId)
    if (callbacks) {
      callbacks.delete(callback)
      if (callbacks.size === 0) {
        chatSubscriptions.delete(chatGroupId)
        socket?.emit("leave:chat", chatGroupId)
      }
    }
  }
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
    connect()
  }

  // Join conversation room
  socket?.emit("join:conversation", conversationId)

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
    if (!socket?.connected) {
      await connect()

      // Rejoin all subscribed rooms
      eventSubscriptions.forEach((_, eventId) => {
        socket?.emit("join:event", eventId)
      })
      chatSubscriptions.forEach((_, chatGroupId) => {
        socket?.emit("join:chat", chatGroupId)
      })
      conversationSubscriptions.forEach((_, conversationId) => {
        socket?.emit("join:conversation", conversationId)
      })
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
  EventCheckInCallback,
  EventCheckOutCallback,
  EventInterestCallback,
  ChatMessageCallback,
  ChatTypingCallback,
  ChatReactionCallback,
  PrivateMessageCallback,
  PrivateTypingCallback,
  PrivateReadCallback,
}

import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { useCallback } from 'react'
import { useFocusEffect, type Href } from 'expo-router'
import { openWhenReady } from './pendingRoute'
import { apiClient, TokenStorage } from './apiClient'
import { Logger } from './logger'
import { setPushTokenRef, getPushTokenRef } from './pushTokenRef'

/**
 * The conversation or room on screen, spelled the way the server spells a
 * push's `threadId`: `dm:{conversationId}`, `room:{chatGroupId}`.
 *
 * A DM you were reading dropped a banner over itself for every message, because
 * this handler showed everything. It is the server's burst rule's other half:
 * the server decides what is worth a push, and the phone does not show you a
 * push about the thing you are looking at.
 */
let activeThread: string | null = null

export function setActiveThread(thread: string | null): void {
  activeThread = thread
}

/**
 * Marks `thread` as on screen; the returned function gives it back.
 *
 * Gives back only its own. Going from one chat straight to another, the next
 * screen can claim before this one lets go — clearing unconditionally would
 * leave nothing on screen and let the new conversation's pushes drop banners
 * over it.
 */
export function claimThread(thread: string): () => void {
  activeThread = thread
  return () => {
    if (activeThread === thread) activeThread = null
  }
}

/** Marks `thread` as on screen while the calling screen has focus. */
export function useActiveThread(thread: string): void {
  useFocusEffect(useCallback(() => claimThread(thread), [thread]))
}

function threadOf(data: Record<string, unknown> | undefined): string | null {
  if (data?.type === 'private_message' && data.conversationId) return `dm:${String(data.conversationId)}`
  if (data?.type === 'group_message' && data.chatGroupId) return `room:${String(data.chatGroupId)}`
  return null
}

// How a push that arrives while the app is open is shown.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const thread = threadOf(notification.request.content.data)
    const onScreen = thread !== null && thread === activeThread
    return {
      shouldShowBanner: !onScreen,
      shouldShowList: !onScreen,
      shouldPlaySound: !onScreen,
      shouldSetBadge: false,
    }
  },
})

/**
 * The Android channels the server sends on — `deliveryFor` in blendn-admin's
 * `lib/push-notifications.ts` picks one of these for every kind.
 *
 * Only `default` existed, at the highest importance, and the server sent DMs,
 * friend requests and matches on `messages`: Android filed those under
 * "Miscellaneous" at normal importance while room chatter rode `default` as a
 * heads-up. People and events pop up; a room reply does not.
 *
 * Android fixes a channel's importance when it is created, so these are the
 * first and last word on it — a person changes it in system settings after
 * that. A no-op on iOS.
 */
export async function ensureNotificationChannels(): Promise<void> {
  const base = { vibrationPattern: [0, 250, 250, 250], lightColor: '#FF6B6B' }
  await Promise.all([
    Notifications.setNotificationChannelAsync('messages', {
      ...base,
      name: 'Messages and people',
      description: 'Direct messages, friend requests and matches',
      importance: Notifications.AndroidImportance.HIGH,
    }),
    Notifications.setNotificationChannelAsync('events', {
      ...base,
      name: 'Events',
      description: 'Changes to events you are going to, reminders and organiser announcements',
      importance: Notifications.AndroidImportance.HIGH,
    }),
    Notifications.setNotificationChannelAsync('rooms', {
      ...base,
      name: 'Room replies',
      description: 'Someone replied to you in an event room',
      importance: Notifications.AndroidImportance.DEFAULT,
    }),
  ])
}

// Types for different notification types
export interface NotificationData {
  type: 'match' | 'message' | 'event_reminder' | 'check_in'
  title: string
  body: string
  data?: Record<string, any>
}

// Register for push notifications and get the Expo push token.
// `prompt: false` never shows the OS dialog: it registers only when the
// permission is already granted (see lib/pushDecline.ts).
export async function registerForPushNotificationsAsync(
  { prompt = true }: { prompt?: boolean } = {}
): Promise<string | null> {
  let token: string | null = null

  if (Platform.OS === 'android') {
    // `default` carries only a payload with no type; kept because installs
    // already have it and nothing can lower its importance now.
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF6B6B',
    })
    await ensureNotificationChannels()
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus

    if (existingStatus !== 'granted') {
      if (!prompt) {
        Logger.info('notifications', 'Push declined during onboarding; not asking')
        return null
      }
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }

    if (finalStatus !== 'granted') {
      Logger.warn('notifications', 'Push notification permission not granted')
      return null
    }

    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
      if (!projectId) {
        Logger.warn('notifications', 'Project ID not found - using dev token')
        return 'development-token-' + Math.random().toString(36).substr(2, 9)
      }

      token = (await Notifications.getExpoPushTokenAsync({
        projectId,
      })).data

      Logger.info('notifications', 'Got push token', { token: token.substring(0, 20) + '...' })
    } catch (error) {
      // This is expected if APS entitlement is missing (dev builds without push capability)
      Logger.warn('notifications', 'Push token unavailable (expected in dev builds)', { error: String(error).substring(0, 100) })
      return 'development-token-' + Math.random().toString(36).substr(2, 9)
    }
  } else {
    Logger.debug('notifications', 'Using simulator token')
    return 'simulator-token-' + Math.random().toString(36).substr(2, 9)
  }

  return token
}

// Save push token to backend
export async function savePushTokenToProfile(token: string): Promise<boolean> {
  try {
    const user = await TokenStorage.getUser()
    if (!user) {
      Logger.warn('notifications', 'No authenticated user found for push token')
      return false
    }

    const platform = Platform.OS === 'ios' ? 'ios' : 'android'
    const result = await apiClient.registerPushToken(token, platform)

    if (result.success) {
      Logger.info('notifications', 'Push token registered successfully', { token: token.substring(0, 20) + '...' })
      return true
    } else {
      Logger.error('notifications', 'Failed to register push token', { error: result.error })
      return false
    }
  } catch (error) {
    Logger.error('notifications', 'Error saving push token', { error })
    return false
  }
}

// The token itself lives in lib/pushTokenRef.ts, because apiClient needs to
// read it at sign-out and this module already imports apiClient. Kept under the
// original name so existing call sites are unchanged.
export function setCurrentPushToken(token: string | null) {
  setPushTokenRef(token)
}

// Remove push token when user logs out
export async function removePushTokenFromProfile(): Promise<boolean> {
  try {
    const token = getPushTokenRef()
    if (!token) {
      Logger.debug('notifications', 'No push token to remove')
      return true
    }

    const result = await apiClient.removePushToken(token)

    if (result.success) {
      Logger.info('notifications', 'Push token removed successfully')
      setPushTokenRef(null)
      return true
    } else {
      Logger.warn('notifications', 'Failed to remove push token', { error: result.error })
      // Clear local reference anyway
      setPushTokenRef(null)
      return false
    }
  } catch (error) {
    Logger.error('notifications', 'Error removing push token', { error })
    setPushTokenRef(null)
    return false
  }
}

// Send a notification to a specific user (for backend use)
// Note: This is typically handled server-side, not from the mobile app
export async function sendNotificationToUser(
  userId: string,
  notification: NotificationData
): Promise<boolean> {
  // Notifications are handled by the backend via Socket.io or push services
  // This function is a stub for compatibility
  Logger.debug('notifications', 'sendNotificationToUser called (handled by backend)', { userId, type: notification.type })
  return true
}

// Helper functions for specific notification types
export const NotificationHelpers = {
  // Send match notification
  matchNotification: (matchedUserName: string, userId: string) => {
    return sendNotificationToUser(userId, {
      type: 'match',
      title: '🎉 New Match!',
      body: `You and ${matchedUserName} liked each other!`,
      data: { screen: 'chat' }
    })
  },

  // Send new message notification
  messageNotification: (senderName: string, message: string, userId: string, conversationId?: string) => {
    return sendNotificationToUser(userId, {
      type: 'message',
      title: `${senderName}`,
      body: message.length > 50 ? message.substring(0, 47) + '...' : message,
      data: { 
        screen: 'chat',
        conversationId 
      }
    })
  },

  // Send event reminder notification
  eventReminderNotification: (eventTitle: string, userId: string, eventId: string) => {
    return sendNotificationToUser(userId, {
      type: 'event_reminder',
      title: '📅 Event Starting Soon',
      body: `${eventTitle} starts in 30 minutes!`,
      data: { 
        screen: 'event',
        eventId 
      }
    })
  },

  // Send check-in success notification
  checkInNotification: (eventTitle: string, userId: string) => {
    return sendNotificationToUser(userId, {
      type: 'check_in',
      title: '✅ Checked In!',
      body: `You're now checked into ${eventTitle}. Start matching!`,
      data: { screen: 'match' }
    })
  }
}

// Handle notification received while app is in foreground
export function setupNotificationListener(
  onNotificationReceived?: (notification: Notifications.Notification) => void
) {
  const subscription = Notifications.addNotificationReceivedListener(notification => {
    Logger.debug('notifications', 'Notification received', { id: notification.request.identifier })
    onNotificationReceived?.(notification)
  })

  return subscription
}

/**
 * Where a notification's payload should take you, or `null` for nowhere.
 *
 * Pure, so it can be tested, and so the decision is separate from *when* to
 * navigate — that is `openWhenReady`'s, because a tap can arrive before the
 * session has (see `lib/pendingRoute.ts`).
 */
export function notificationTarget(data: Record<string, any> | undefined): Href | null {
  if (!data) return null

  // Support both backend payload format (type) and legacy local format (screen)
  const notifType = data.type || data.screen

  if (!notifType) return null

  let target: Href | null = null
  switch (notifType) {
    // Backend types
    case 'private_message': {
      if (data.conversationId) {
        target = { pathname: '/private-chat/[conversationId]', params: { conversationId: String(data.conversationId) } as any }
      } else {
        target = '/(tabs)/chat'
      }
      break
    }
    case 'group_message': {
      if (data.chatGroupId) {
        target = { pathname: '/chat/[id]', params: { id: String(data.chatGroupId) } as any }
      } else {
        target = '/(tabs)/chat'
      }
      break
    }
    case 'announcement': {
      if (data.chatGroupId) {
        target = { pathname: '/chat/[id]', params: { id: String(data.chatGroupId) } as any }
      } else if (data.eventId) {
        target = { pathname: '/event/[id]', params: { id: String(data.eventId) } as any }
      } else {
        target = '/(tabs)/chat'
      }
      break
    }
    case 'event_checkin':
    case 'event_update': {
      if (data.eventId) {
        target = { pathname: '/event/[id]', params: { id: String(data.eventId) } as any }
      } else {
        target = '/(tabs)/events'
      }
      break
    }
    // Legacy local types (from NotificationHelpers)
    case 'chat': {
      if (data.conversationId) {
        target = { pathname: '/private-chat/[conversationId]', params: { conversationId: String(data.conversationId) } as any }
      } else {
        target = '/(tabs)/chat'
      }
      break
    }
    // An earlier build's local one-hour reminder, which may still be in the
    // tray after an update. It had no case here and opened nothing.
    case 'event_reminder':
    case 'event': {
      if (data.eventId) {
        target = { pathname: '/event/[id]', params: { id: String(data.eventId) } as any }
      } else {
        target = '/(tabs)/events'
      }
      break
    }
    case 'match': {
      /*
       * The conversation, not the room.
       *
       * This pushed `/room` on the reasoning that "a match is about somebody
       * in a room". That was true when the Grid was the only place a match
       * existed. It is not any more: a mutual like opens the conversation
       * server-side (`lib/matches.ts`) and it is in the Banter from that
       * moment, with its own opener.
       *
       * `/room` is a *place*, and you stop being in it. Match at an event,
       * leave, get checked out by the presence monitor — and the push about
       * your match lands you on "Not Checked In Yet". The notification was
       * about a person and it opened a venue you had left.
       *
       * `notifyMatch` has always sent the id (`push-notifications.ts`); this
       * branch simply threw it away, while the `chat` case ten lines above
       * did the right thing with the same field.
       */
      if (data.conversationId) {
        target = {
          pathname: '/private-chat/[conversationId]',
          params: { conversationId: String(data.conversationId) } as any,
        }
      } else {
        target = '/(tabs)/chat'
      }
      break
    }
    /*
     * The five below fell straight through this switch and navigated
     * nowhere. Every one is a kind `sendPushNotification` actually emits —
     * they are in `NotificationData["type"]` and in the `notification_kind`
     * enum — so tapping any of these pushes opened the app and left you
     * wherever you were, which reads as the notification being broken.
     *
     * Found while wiring the notifications centre, which routes through this
     * same function rather than carrying a second copy of it.
     */
    case 'message_request':
    case 'message_request_response': {
      /*
       * The Banter tab, which is where requests are listed
       * (`app/(tabs)/chat.tsx` loads them) — there is no dedicated route.
       *
       * Deliberately not the sender's profile: the decision is
       * accept-or-decline, and a request from somebody you have not accepted
       * must not deep-link to a profile you are not yet entitled to see.
       */
      target = '/(tabs)/chat'
      break
    }
    case 'friend_request': {
      /*
       * Where requests are answered. Not the asker's profile: a friend's
       * profile is what accepting gives you, and the push carries no name.
       */
      target = '/friends/add'
      break
    }
    case 'friend_accepted': {
      target = '/friends'
      break
    }
    /*
     * "The night's over — rate who you met." The server sends
     * `rating_request` with `eventId`, once per event, after an event you
     * checked in to ends (blendn-admin `event-notifications.service.ts`). The
     * other names were routed ahead of it and cost nothing to keep. Without an
     * event id there is nothing to rate, and Going's Past rows carry the way
     * in for every event you attended.
     */
    case 'event_ended':
    case 'event_rating':
    case 'rate_event':
    case 'peer_rating':
    case 'rate_peers':
    case 'rating_request': {
      if (data.eventId) {
        target = { pathname: '/rate/[eventId]', params: { eventId: String(data.eventId) } as any }
      } else {
        target = '/(tabs)/going'
      }
      break
    }
    case 'waitlist_promoted': {
      // "A place opened up" is only actionable on the event itself.
      if (data.eventId) {
        target = { pathname: '/event/[id]', params: { id: String(data.eventId) } as any }
      } else {
        target = '/(tabs)/events'
      }
      break
    }
    case 'reveal_request':
    case 'reveal': {
      /*
       * Same destination as `match`, and for the same reason: all three are
       * about one pairing, and the pairing is the conversation. Reveal is the
       * clearest case — it is the moment their name appears in that thread,
       * so the thread is the only place the news means anything.
       *
       * Still deliberately **not** a profile route keyed on `senderId`. The
       * reveal gate decides what you may see of somebody and is enforced by
       * the screens that ask the server; deep-linking to a profile would be
       * the app asserting an entitlement the server has not granted. The
       * conversation has no such problem — it is gated server-side already,
       * and the thread header resolves the name through the same rule.
       */
      if (data.conversationId) {
        target = {
          pathname: '/private-chat/[conversationId]',
          params: { conversationId: String(data.conversationId) } as any,
        }
      } else {
        target = '/(tabs)/chat'
      }
      break
    }
  }
  return target
}

// Navigate based on notification payload data
export function navigateFromNotificationData(data: Record<string, any> | undefined) {
  try {
    const target = notificationTarget(data)
    if (target) openWhenReady(target)
  } catch (e) {
    Logger.warn('notifications', 'Failed to navigate from notification', { error: e })
  }
}

// Handle notification tapped (app opened from notification)
export function setupNotificationResponseListener(
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void
) {
  // Handle cold-start: check if app was opened from a notification while killed
  Notifications.getLastNotificationResponseAsync().then(response => {
    if (response) {
      Logger.debug('notifications', 'Cold-start notification tap', { id: response.notification.request.identifier })
      const data = response.notification.request.content.data
      navigateFromNotificationData(data)
    }
  }).catch(() => {})

  // Handle warm taps (app in background or foreground)
  const subscription = Notifications.addNotificationResponseReceivedListener(response => {
    Logger.debug('notifications', 'Notification tapped', { id: response.notification.request.identifier })
    onNotificationResponse?.(response)
    const data = response.notification.request.content.data
    navigateFromNotificationData(data)
  })

  return subscription
}

/**
 * The one-hour reminder is the server's (`sendEventReminders`, blendn-admin).
 *
 * This file scheduled its own as well, for the same people — interested,
 * going, waitlisted — so "starts in an hour" arrived twice. The server's also
 * follows a time change and honours the notifications switch; a local one did
 * neither. This clears the ones an earlier build left scheduled.
 *
 * ponytail: delete once no install predates this build.
 */
export async function cancelLegacyEventReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync()
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith('event-reminder-'))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  )
}

// Initialize push notifications (call this on app startup)
export async function initializePushNotifications(
  options: { prompt?: boolean } = {}
): Promise<string | null> {
  cancelLegacyEventReminders().catch(() => {})
  try {
    const token = await registerForPushNotificationsAsync(options)

    if (token) {
      // Store token for removal on logout
      setCurrentPushToken(token)

      // Only register real tokens with the backend
      if (!token.startsWith('development-token-') && !token.startsWith('simulator-token-')) {
        await savePushTokenToProfile(token)
      }
    }

    return token
  } catch (error) {
    Logger.error('notifications', 'Error initializing push notifications', { error })
    return null
  }
}

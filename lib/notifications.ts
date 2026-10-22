import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { useCallback } from 'react'
import { router, useFocusEffect, type Href } from 'expo-router'
import { openWhenReady } from './pendingRoute'
import { apiClient, TokenStorage } from './apiClient'
import { bannerPresentation, isOnNotificationsScreen } from './inAppBanners'
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

/**
 * Whether a push is about the conversation or room on screen: it is not shown over what you are reading.
 * The in-app banner host asks the same question.
 */
export function isOnScreenThread(data: Record<string, unknown> | undefined): boolean {
  const thread = threadOf(data)
  return thread !== null && thread === activeThread
}

/**
 * How a push that arrives while the app is open is shown.
 *
 * Nothing for the thread you are reading. Otherwise it is the in-app capsule (`lib/inAppBanners`, Flow 9 · 9.4)
 * where the tabs are showing, nothing for the kinds that only fill the bell, and the system's banner
 * everywhere else: a pushed screen over the tabs, or a kind with no capsule.
 */
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data
    const system = !isOnScreenThread(data) && bannerPresentation(data) === 'system'
    return {
      shouldShowBanner: system,
      shouldShowList: system,
      shouldPlaySound: system,
      shouldSetBadge: false,
    }
  },
})

/** What Android lists for the `default` channel. */
export const DEFAULT_CHANNEL_NAME = 'Other notifications'

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
  /*
   * Flow 9 · 9.5 (Android): people and crew are private on the lock screen (the notification shows "Contents
   * hidden" there), events are shown, and "After the night" is low. `lockscreenVisibility` is as the channel is
   * created, like importance. The three new channels (`matches`, `crew`, `after-the-night`) are for Notification
   * settings' rows to open; a push reaches them only when the server sends their id (`channelId`, see the
   * server contract in the Flow 9 report): until then `messages` stays what carries people and `events` the rest.
   */
  const PRIVATE = Notifications.AndroidNotificationVisibility.PRIVATE
  const PUBLIC = Notifications.AndroidNotificationVisibility.PUBLIC
  await Promise.all([
    Notifications.setNotificationChannelAsync('messages', {
      ...base,
      name: 'Messages and people',
      description: 'Direct messages, friend requests and matches',
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: PRIVATE,
    }),
    Notifications.setNotificationChannelAsync('matches', {
      ...base,
      name: 'Matches and friends',
      description: 'Friend requests, matches and reveals',
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: PRIVATE,
    }),
    Notifications.setNotificationChannelAsync('crew', {
      ...base,
      name: 'Your crew',
      description: 'Crew invites, “we’re here” and Blends',
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: PRIVATE,
    }),
    Notifications.setNotificationChannelAsync('events', {
      ...base,
      name: 'Events',
      description: 'Changes to events you are going to, reminders and organiser announcements',
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: PUBLIC,
    }),
    Notifications.setNotificationChannelAsync('rooms', {
      ...base,
      name: 'Room replies',
      description: 'Someone replied to you in an event room',
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: PRIVATE,
    }),
    Notifications.setNotificationChannelAsync('after-the-night', {
      ...base,
      name: 'After the night',
      description: 'Rate the night, and what comes after it',
      importance: Notifications.AndroidImportance.LOW,
      lockscreenVisibility: PRIVATE,
    }),
    // The server already sends offers on this id (`deliveryFor`); an install without it filed them under "Miscellaneous".
    Notifications.setNotificationChannelAsync('offers', {
      ...base,
      name: 'Offers from places',
      description: 'Offers from places you keep going back to',
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: PRIVATE,
    }),
  ])
}

// Register for push notifications and get the Expo push token.
// `prompt: false` never shows the OS dialog: it registers only when the
// permission is already granted (see lib/pushDecline.ts).
export async function registerForPushNotificationsAsync(
  { prompt = true }: { prompt?: boolean } = {}
): Promise<string | null> {
  let token: string | null = null

  if (Platform.OS === 'android') {
    // `default` carries a push with no payload (the server's `deliveryFor`), so it stays, and installs already have it
    // (its importance can no longer be lowered). Its name is what Android lists in the app's settings: it was the bare
    // id, a stray lowercase "default" beside the named channels. A name can be changed after creation; this renames it.
    await Notifications.setNotificationChannelAsync('default', {
      name: DEFAULT_CHANNEL_NAME,
      description: 'Notifications that are none of the other kinds',
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
    /*
     * One pairing, so its conversation. `chat` is a legacy local type.
     *
     * `match` pushed `/room` once, on the reasoning that "a match is about
     * somebody in a room". That was true when the Grid was the only place a
     * match existed. It is not any more: a mutual like opens the conversation
     * server-side (`lib/matches.ts`) and it is in the Banter from that moment,
     * with its own opener. `/room` is a *place*, and you stop being in it.
     * Match at an event, leave, get checked out by the presence monitor — and
     * the push about your match landed you on "Not Checked In Yet". The
     * notification was about a person and it opened a venue you had left.
     * `notifyMatch` has always sent the id (`push-notifications.ts`).
     *
     * Reveal is the clearest case — it is the moment their name appears in
     * that thread, so the thread is the only place the news means anything.
     *
     * Still deliberately **not** a profile route keyed on `senderId`. The
     * reveal gate decides what you may see of somebody and is enforced by
     * the screens that ask the server; deep-linking to a profile would be
     * the app asserting an entitlement the server has not granted. The
     * conversation has no such problem — it is gated server-side already,
     * and the thread header resolves the name through the same rule.
     *
     * A board request is answered in the Banter; an acceptance opens the
     * conversation it made.
     */
    case 'reveal_request':
    case 'reveal':
    case 'private_message':
    case 'chat':
    case 'match':
    case 'board_request_accepted': {
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
    case 'group_message': {
      if (data.chatGroupId) {
        /*
         * A reply in a crew's or a Blend's room opens as that room (the
         * server's `kind`, step 9 review H2): opened as an event's it said
         * "Event chat", offered an event's Room info and read a closed Blend
         * as a load error. Anything else, a venue day's room included, is an event's.
         */
        const kind = data.kind === 'crew' || data.kind === 'blend' ? data.kind : null
        target = {
          pathname: '/chat/[id]',
          params: {
            id: String(data.chatGroupId),
            ...(kind ? { kind } : {}),
            ...(kind === 'crew' && data.crewId ? { crewId: String(data.crewId) } : {}),
            ...(kind === 'blend' && data.blendId ? { blendId: String(data.blendId) } : {}),
          } as any,
        }
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
    /*
     * The event itself. `event` is a legacy local type, and `event_reminder`
     * an earlier build's local one-hour reminder, which may still be in the
     * tray after an update — it had no case here and opened nothing. "A place
     * opened up" (`waitlist_promoted`) is only actionable on the event.
     */
    case 'event_checkin':
    case 'event_update':
    case 'event_changed':
    case 'event_cancelled':
    case 'event_reminder':
    case 'event':
    case 'waitlist_promoted': {
      if (data.eventId) {
        target = { pathname: '/event/[id]', params: { id: String(data.eventId) } as any }
      } else {
        target = '/(tabs)/events'
      }
      break
    }
    /*
     * Message requests fell straight through this switch and navigated
     * nowhere, though `sendPushNotification` emits them — they are in
     * `NotificationData["type"]` and in the `notification_kind` enum — so
     * tapping one opened the app and left you wherever you were. Found while
     * wiring the notifications centre, which routes through this same
     * function rather than carrying a second copy of it.
     *
     * The Banter tab, which is where requests are listed (`app/(tabs)/chat.tsx`
     * loads them) — there is no dedicated route. Deliberately not the sender's
     * profile: the decision is accept-or-decline, and a request from somebody
     * you have not accepted must not deep-link to a profile you are not yet
     * entitled to see.
     *
     * The board's push says only that something happened — no handle, no
     * words, because a lock screen is read by other people — so the client
     * draws nothing from it either.
     */
    case 'message_request':
    case 'message_request_response':
    case 'board_request': {
      target = '/(tabs)/chat'
      break
    }
    /*
     * Crews (step 9). None of these names anybody, and none renders a
     * preview: an invite is answered on the crews screen; "We're here" opens
     * the crew's chat, where its line is; a Blend opens its room.
     */
    case 'crew_invite': {
      // An invite always lands on its own screen, never one tap from joined (Flow 10 · 10.3).
      target = data.crewId ? { pathname: '/crews/invite/[crewId]', params: { crewId: String(data.crewId) } } : '/crews'
      break
    }
    case 'crew_here': {
      target = data.chatGroupId
        ? {
            pathname: '/chat/[id]',
            params: { id: String(data.chatGroupId), kind: 'crew', ...(data.crewId ? { crewId: String(data.crewId) } : {}) } as any,
          }
        : '/crews'
      break
    }
    case 'blend': {
      target = data.chatGroupId
        ? {
            pathname: '/chat/[id]',
            params: { id: String(data.chatGroupId), kind: 'blend', ...(data.blendId ? { blendId: String(data.blendId) } : {}) } as any,
          }
        : '/(tabs)/chat'
      break
    }
    /*
     * A place's offer (step 12). The push names no place — a lock screen is
     * read by others — so it opens the offer, where the place and its words
     * come from the server, and the door pass with them.
     */
    case 'venue_offer': {
      target = data.offerId
        ? { pathname: '/offer/[id]', params: { id: String(data.offerId) } as any }
        : '/(tabs)/events'
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
  }
  return target
}

/**
 * The kinds that are asked something, whose push lands on the Notifications screen (Flow 9 · 9.2, motion #50):
 * the request is answered there, where Accept and Decline are, and the screen scrolls to it and washes it.
 * (A row's own View/Join, on that screen, goes to `notificationTarget`: the destination, not the feed.)
 */
const LANDS_IN_THE_FEED = ['friend_request', 'crew_invite', 'reveal_request', 'board_request', 'message_request']
const LANDING_KEYS = ['requestId', 'crewId', 'eventId', 'conversationId'] as const

/** Where a tapped push or banner goes: the Notifications screen with its payload ids for a request kind, otherwise the destination. */
export function landingTarget(data: Record<string, any> | undefined): Href | null {
  const type = data?.type
  if (!data || typeof type !== 'string' || !LANDS_IN_THE_FEED.includes(type)) return notificationTarget(data)
  const params: Record<string, string> = { type }
  for (const key of LANDING_KEYS) if (typeof data[key] === 'string') params[key] = data[key]
  return { pathname: '/notifications', params }
}

/** A tapped push (cold start, warm) or banner: the landing. */
export function landFromNotificationData(data: Record<string, any> | undefined) {
  try {
    const target = landingTarget(data)
    if (!target) return
    /*
     * Already on the Notifications screen: a second instance would stack on it. Its params change in place
     * (the ones the new target does not name are cleared, `at` makes a tap on the same row new), and the
     * screen lands again on the new row.
     */
    if (isOnNotificationsScreen() && typeof target === 'object' && 'pathname' in target && target.pathname === '/notifications') {
      const params: Record<string, string | undefined> = Object.fromEntries(LANDING_KEYS.map((k) => [k, undefined]))
      router.setParams({ ...params, ...(target.params as Record<string, string>), at: String(Date.now()) })
      return
    }
    openWhenReady(target)
  } catch (e) {
    Logger.warn('notifications', 'Failed to land from notification', { error: e })
  }
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
      landFromNotificationData(data)
    }
  }).catch(() => {})

  // Handle warm taps (app in background or foreground)
  const subscription = Notifications.addNotificationResponseReceivedListener(response => {
    Logger.debug('notifications', 'Notification tapped', { id: response.notification.request.identifier })
    onNotificationResponse?.(response)
    const data = response.notification.request.content.data
    landFromNotificationData(data)
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
      setPushTokenRef(token)

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

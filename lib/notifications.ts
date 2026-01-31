import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { router } from 'expo-router'
import { apiClient, TokenStorage } from './apiClient'
import { Logger } from './logger'

// Configure how notifications are handled when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

// Types for different notification types
export interface NotificationData {
  type: 'match' | 'message' | 'event_reminder' | 'check_in'
  title: string
  body: string
  data?: Record<string, any>
}

// Register for push notifications and get the Expo push token
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF6B6B',
    })
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus

    if (existingStatus !== 'granted') {
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

// Store current push token for removal on logout
let currentPushToken: string | null = null

export function setCurrentPushToken(token: string | null) {
  currentPushToken = token
}

// Remove push token when user logs out
export async function removePushTokenFromProfile(): Promise<boolean> {
  try {
    if (!currentPushToken) {
      Logger.debug('notifications', 'No push token to remove')
      return true
    }

    const result = await apiClient.removePushToken(currentPushToken)

    if (result.success) {
      Logger.info('notifications', 'Push token removed successfully')
      currentPushToken = null
      return true
    } else {
      Logger.warn('notifications', 'Failed to remove push token', { error: result.error })
      // Clear local reference anyway
      currentPushToken = null
      return false
    }
  } catch (error) {
    Logger.error('notifications', 'Error removing push token', { error })
    currentPushToken = null
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

// Handle notification tapped (app opened from notification)
export function setupNotificationResponseListener(
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void
) {
  const subscription = Notifications.addNotificationResponseReceivedListener(response => {
    Logger.debug('notifications', 'Notification tapped', { id: response.notification.request.identifier })
    onNotificationResponse?.(response)
    
    // Handle navigation based on notification data
    const data = response.notification.request.content.data
    if (data?.screen) {
      try {
        switch (data.screen) {
          case 'chat': {
            if (data.conversationId) {
              router.push({ pathname: '/private-chat/[conversationId]', params: { conversationId: String(data.conversationId) } as any })
            } else {
              router.push('/(tabs)/chat')
            }
            break
          }
          case 'event': {
            if (data.eventId) {
              router.push({ pathname: '/event/[id]', params: { id: String(data.eventId) } as any })
            } else {
              router.push('/(tabs)/events')
            }
            break
          }
          case 'match': {
            router.push('/(tabs)/match')
            break
          }
          default: {
            router.push('/(tabs)/events')
          }
        }
      } catch (e) {
        console.warn('Failed to navigate from notification', e)
      }
    }
  })

  return subscription
}

// Initialize push notifications (call this on app startup)
export async function initializePushNotifications(): Promise<string | null> {
  try {
    const token = await registerForPushNotificationsAsync()

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
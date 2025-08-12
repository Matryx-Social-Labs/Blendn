import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { supabase } from './supabase'

// Configure how notifications are handled when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
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
      console.log('Failed to get push token for push notification!')
      return null
    }
    
    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
      if (!projectId) {
        console.warn('Project ID not found - using fallback for development')
        // Return a dummy token for development/simulator testing
        return 'development-token-' + Math.random().toString(36).substr(2, 9)
      }
      
      token = (await Notifications.getExpoPushTokenAsync({
        projectId,
      })).data
      
      console.log('Got push token:', token)
    } catch (error) {
      console.error('Error getting push token:', error)
      // Return a dummy token for development/simulator testing
      console.log('Using development token for simulator/testing')
      return 'development-token-' + Math.random().toString(36).substr(2, 9)
    }
  } else {
    console.log('Must use physical device for Push Notifications - using development token')
    // Return a dummy token for simulator testing
    return 'simulator-token-' + Math.random().toString(36).substr(2, 9)
  }

  return token
}

// Save push token to user profile in Supabase
export async function savePushTokenToProfile(token: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error('No authenticated user found')
      return false
    }

    const { error } = await supabase
      .from('profiles')
      .update({ push_token: token })
      .eq('id', user.id)

    if (error) {
      console.error('Error saving push token:', error)
      return false
    }

    console.log('Push token saved successfully')
    return true
  } catch (error) {
    console.error('Error saving push token:', error)
    return false
  }
}

// Remove push token when user logs out
export async function removePushTokenFromProfile(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return true // No user, nothing to remove

    const { error } = await supabase
      .from('profiles')
      .update({ push_token: null })
      .eq('id', user.id)

    if (error) {
      console.error('Error removing push token:', error)
      return false
    }

    console.log('Push token removed successfully')
    return true
  } catch (error) {
    console.error('Error removing push token:', error)
    return false
  }
}

// Send a notification to a specific user (for backend use)
export async function sendNotificationToUser(
  userId: string, 
  notification: NotificationData
): Promise<boolean> {
  try {
    // Use SECURITY DEFINER RPC to bypass RLS safely
    const { error } = await supabase.rpc('create_notification_json', {
      payload: {
        user_id: userId,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        data: notification.data || {},
      }
    })

    if (error) {
      console.error('Error creating notification record:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error sending notification:', error)
    return false
  }
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
    console.log('Notification received:', notification)
    onNotificationReceived?.(notification)
  })

  return subscription
}

// Handle notification tapped (app opened from notification)
export function setupNotificationResponseListener(
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void
) {
  const subscription = Notifications.addNotificationResponseReceivedListener(response => {
    console.log('Notification response:', response)
    onNotificationResponse?.(response)
    
    // Handle navigation based on notification data
    const data = response.notification.request.content.data
    if (data?.screen) {
      // Navigate to specific screen based on notification data
      // This would be implemented in the component using this function
    }
  })

  return subscription
}

// Initialize push notifications (call this on app startup)
export async function initializePushNotifications(): Promise<string | null> {
  try {
    const token = await registerForPushNotificationsAsync()
    
    if (token) {
      await savePushTokenToProfile(token)
    }
    
    return token
  } catch (error) {
    console.error('Error initializing push notifications:', error)
    return null
  }
} 
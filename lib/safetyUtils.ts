import { Alert } from 'react-native'
import { Logger } from './logger'
import { supabase } from './supabase'

export interface SafetyActionResult {
  success: boolean
  message: string
}

export interface BlockedUser {
  blocked_id: string
  blocked_user_name: string
  blocked_user_photo: string | null
  reason: string | null
  blocked_at: string
}

export type ReportType = 
  | 'inappropriate_messages'
  | 'fake_profile' 
  | 'harassment'
  | 'spam'
  | 'inappropriate_photos'
  | 'other'

export type MessageReportType = 
  | 'harassment'
  | 'spam'
  | 'inappropriate_content'
  | 'hate_speech'
  | 'other'

/**
 * Block a user
 */
export const blockUser = async (
  userId: string, 
  reason?: string
): Promise<SafetyActionResult> => {
  try {
    const { data, error } = await supabase.rpc('block_user', {
      p_blocked_id: userId,
      p_reason: reason
    })

    if (error) {
      Logger.error('general', 'Error blocking user', { error })
      return { success: false, message: 'Failed to block user' }
    }

    const result: any = Array.isArray(data) ? data[0] : data
    return { success: !!result?.success, message: result?.message || (result?.success ? 'OK' : 'Failed') }
  } catch (error) {
    Logger.error('general', 'Error blocking user', { error })
    return { success: false, message: 'Something went wrong' }
  }
}

/**
 * Unblock a user
 */
export const unblockUser = async (userId: string): Promise<SafetyActionResult> => {
  try {
    const { data, error } = await supabase.rpc('unblock_user', {
      p_blocked_id: userId
    })

    if (error) {
      Logger.error('general', 'Error unblocking user', { error })
      return { success: false, message: 'Failed to unblock user' }
    }

    const result: any = Array.isArray(data) ? data[0] : data
    return { success: !!result?.success, message: result?.message || (result?.success ? 'OK' : 'Failed') }
  } catch (error) {
    Logger.error('general', 'Error unblocking user', { error })
    return { success: false, message: 'Something went wrong' }
  }
}

/**
 * Report a user
 */
export const reportUser = async (
  userId: string,
  reportType: ReportType,
  description?: string
): Promise<SafetyActionResult> => {
  try {
    const { data, error } = await supabase.rpc('report_user', {
      p_reported_id: userId,
      p_report_type: reportType,
      p_description: description
    })

    if (error) {
      Logger.error('general', 'Error reporting user', { error })
      return { success: false, message: 'Failed to submit report' }
    }

    const result: any = Array.isArray(data) ? data[0] : data
    return { success: !!result?.success, message: result?.message || (result?.success ? 'OK' : 'Failed') }
  } catch (error) {
    Logger.error('general', 'Error reporting user', { error })
    return { success: false, message: 'Something went wrong' }
  }
}

/**
 * Report a message
 */
export const reportMessage = async (
  messageId: string,
  messageType: 'group' | 'private',
  reportType: MessageReportType,
  description?: string
): Promise<SafetyActionResult> => {
  try {
    const { data, error } = await supabase.rpc('report_message', {
      p_message_id: messageId,
      p_message_type: messageType,
      p_report_type: reportType,
      p_description: description
    })

    if (error) {
      Logger.error('general', 'Error reporting message', { error })
      return { success: false, message: 'Failed to report message' }
    }

    const result = data[0]
    return { success: result.success, message: result.message }
  } catch (error) {
    Logger.error('general', 'Error reporting message', { error })
    return { success: false, message: 'Something went wrong' }
  }
}

/**
 * Get list of blocked users
 */
export const getBlockedUsers = async (): Promise<BlockedUser[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase.rpc('get_blocked_users', {
      p_user_id: user.id
    })

    if (error) {
      Logger.error('general', 'Error fetching blocked users', { error })
      return []
    }

    return data || []
  } catch (error) {
    Logger.error('general', 'Error fetching blocked users', { error })
    return []
  }
}

/**
 * Check if a user is blocked
 */
export const isUserBlocked = async (userId: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { data, error } = await supabase.rpc('is_user_blocked', {
      p_user_id: user.id,
      p_other_user_id: userId
    })

    if (error) {
      Logger.error('general', 'Error checking if user is blocked', { error })
      return false
    }

    return data || false
  } catch (error) {
    Logger.error('general', 'Error checking if user is blocked', { error })
    return false
  }
}

/**
 * Show user safety action sheet
 */
export const showUserSafetyActions = (
  userName: string,
  userId: string,
  onBlock?: () => void,
  onReport?: () => void
): void => {
  Alert.alert(
    `Safety Actions`,
    `What would you like to do regarding ${userName}?`,
    [
      {
        text: 'Block User',
        style: 'destructive',
        onPress: () => {
          showBlockConfirmation(userName, userId, onBlock)
        }
      },
      {
        text: 'Report User',
        onPress: () => {
          showReportOptions(userName, userId, onReport)
        }
      },
      {
        text: 'Cancel',
        style: 'cancel'
      }
    ]
  )
}

/**
 * Show block confirmation dialog
 */
export const showBlockConfirmation = (
  userName: string,
  userId: string,
  onComplete?: () => void
): void => {
  Alert.alert(
    'Block User',
    `Are you sure you want to block ${userName}? They won't be able to see your profile or message you.`,
    [
      {
        text: 'Cancel',
        style: 'cancel'
      },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          const result = await blockUser(userId, 'Blocked by user')
          Alert.alert(
            result.success ? 'Success' : 'Error',
            result.message
          )
          if (result.success && onComplete) {
            onComplete()
          }
        }
      }
    ]
  )
}

/**
 * Show report options dialog
 */
export const showReportOptions = (
  userName: string,
  userId: string,
  onComplete?: () => void
): void => {
  const reportOptions = [
    { text: 'Inappropriate Messages', value: 'inappropriate_messages' as ReportType },
    { text: 'Fake Profile', value: 'fake_profile' as ReportType },
    { text: 'Harassment', value: 'harassment' as ReportType },
    { text: 'Spam', value: 'spam' as ReportType },
    { text: 'Inappropriate Photos', value: 'inappropriate_photos' as ReportType },
    { text: 'Other', value: 'other' as ReportType },
    { text: 'Cancel', style: 'cancel' as const }
  ]

  Alert.alert(
    'Report User',
    `Why are you reporting ${userName}?`,
    reportOptions.map(option => ({
      text: option.text,
      style: option.style,
      onPress: option.value ? async () => {
        const result = await reportUser(userId, option.value!)
        Alert.alert(
          result.success ? 'Thank You' : 'Error',
          result.success 
            ? 'Your report has been submitted. Our team will review it.' 
            : result.message
        )
        if (result.success && onComplete) {
          onComplete()
        }
      } : undefined
    }))
  )
}

/**
 * Show message report options
 */
export const showMessageReportOptions = (
  messageId: string,
  messageType: 'group' | 'private',
  onComplete?: () => void
): void => {
  const reportOptions = [
    { text: 'Harassment', value: 'harassment' as MessageReportType },
    { text: 'Spam', value: 'spam' as MessageReportType },
    { text: 'Inappropriate Content', value: 'inappropriate_content' as MessageReportType },
    { text: 'Hate Speech', value: 'hate_speech' as MessageReportType },
    { text: 'Other', value: 'other' as MessageReportType },
    { text: 'Cancel', style: 'cancel' as const }
  ]

  Alert.alert(
    'Report Message',
    'Why are you reporting this message?',
    reportOptions.map(option => ({
      text: option.text,
      style: option.style,
      onPress: option.value ? async () => {
        const result = await reportMessage(messageId, messageType, option.value!)
        Alert.alert(
          result.success ? 'Thank You' : 'Error',
          result.success 
            ? 'Your report has been submitted. Our team will review it.' 
            : result.message
        )
        if (result.success && onComplete) {
          onComplete()
        }
      } : undefined
    }))
  )
}

/**
 * Get human-readable report type
 */
export const getReportTypeLabel = (reportType: ReportType | MessageReportType): string => {
  switch (reportType) {
    case 'inappropriate_messages': return 'Inappropriate Messages'
    case 'fake_profile': return 'Fake Profile'
    case 'harassment': return 'Harassment'
    case 'spam': return 'Spam'
    case 'inappropriate_photos': return 'Inappropriate Photos'
    case 'inappropriate_content': return 'Inappropriate Content'
    case 'hate_speech': return 'Hate Speech'
    case 'other': return 'Other'
    default: return 'Unknown'
  }
} 
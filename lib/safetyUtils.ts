import { Alert } from 'react-native'
import { leaveConfirmation } from './conversationReveal'
import { apiClient } from './apiClient'
import { Logger } from './logger'

export interface SafetyActionResult {
  success: boolean
  message: string
}

export interface BlockedUser {
  blocked_id: string
  blocked_user_name: string | null
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
  _reason?: string
): Promise<SafetyActionResult> => {
  try {
    const result = await apiClient.blockUser(userId)
    if (!result.success) {
      Logger.error('general', 'Error blocking user', { error: result.error })
      return { success: false, message: result.error || 'Failed to block user' }
    }
    return { success: true, message: 'User blocked' }
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
    const result = await apiClient.unblockUser(userId)
    if (!result.success) {
      Logger.error('general', 'Error unblocking user', { error: result.error })
      return { success: false, message: result.error || 'Failed to unblock user' }
    }
    return { success: true, message: 'User unblocked' }
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
    const result = await apiClient.reportUser(userId, reportType, description)
    if (!result.success) {
      Logger.error('general', 'Error reporting user', { error: result.error })
      return { success: false, message: result.error || 'Failed to submit report' }
    }
    return { success: true, message: 'Report submitted' }
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
    const result = await apiClient.reportMessage(messageId, messageType, reportType, description)
    if (!result.success) {
      Logger.error('general', 'Error reporting message', { error: result.error })
      return { success: false, message: result.error || 'Failed to report message' }
    }
    return { success: true, message: 'Report submitted' }
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
    const result = await apiClient.getBlockedUsers()
    if (!result.success || !result.data) {
      Logger.error('general', 'Error fetching blocked users', { error: result.error })
      return []
    }
    return result.data.users
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
    const blocked = await getBlockedUsers()
    return blocked.some((b) => b.blocked_id === userId)
  } catch (error) {
    Logger.error('general', 'Error checking if user is blocked', { error })
    return false
  }
}

/**
 * Show user safety action sheet
 */
/**
 * Leaving a conversation: unmatch, block, or either one with a report.
 *
 * Distinct from `showUserSafetyActions`, which is the general "this person is a
 * problem" sheet available from a profile. This one is about *this
 * conversation*, and the difference that matters is that it can close it.
 *
 * ## Report is bundled, not offered afterwards
 *
 * "Unmatch and report" is one tap and one request. Composing them -- close,
 * then report -- can half-fail into exactly the state the whole design exists
 * to prevent: a closed thread whose evidence is out of reach, or a report with
 * no safety action. The server does both in one transaction.
 *
 * It also matters psychologically. The safest-feeling act is "make it go
 * away", and if that is the button that loses the case, the people most in
 * need of the report are the least likely to file one.
 *
 * ## The copy changes once they have seen your face
 *
 * `leaveConfirmation` says so. Before a reveal, unmatching genuinely ends it.
 * After, the app can close the channel and nothing more, and a sheet implying
 * otherwise sells a protection it cannot provide.
 */
export const showLeaveConversationActions = (
  conversationId: string,
  displayName: string,
  theyKnowYou: boolean,
  onLeft?: () => void,
  fromMatch = true
): void => {
  const copy = leaveConfirmation(displayName, theyKnowYou, fromMatch)
  const verb = fromMatch ? 'Unmatch' : 'End conversation'

  const leave = async (action: 'unmatch' | 'block', withReport: boolean) => {
    const result = await apiClient.leaveConversation(conversationId, {
      action,
      ...(withReport ? { report: { reason: 'other' } } : {}),
    })
    if (result.success) {
      onLeft?.()
    } else {
      Alert.alert('Could not do that', result.error || 'Try again in a moment.')
    }
  }

  Alert.alert(copy.title, copy.body, [
    { text: verb, style: 'destructive', onPress: () => void leave('unmatch', false) },
    { text: `${verb} and report`, style: 'destructive', onPress: () => void leave('unmatch', true) },
    {
      // Block is the stronger option, surfaced here rather than buried,
      // because somebody who wants to be *unseen* rather than merely
      // disconnected needs the other button and may not know it exists.
      text: 'Block and report',
      style: 'destructive',
      onPress: () => void leave('block', true),
    },
    { text: 'Cancel', style: 'cancel' },
  ])
}

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
/**
 * Why somebody would report an **event**, which is not why they would report a
 * person.
 *
 * `showReportOptions` offers "Fake Profile" and "Inappropriate Photos" — both
 * meaningless about a listing — and omits every reason that matters here. The
 * server's route names the three that do: an unsafe venue, a misleading
 * listing, and a dangerous organiser. `event_reports.reason` is free text, so
 * this list is the vocabulary.
 *
 * **"Doesn't look real" is separate from "misleading" on purpose.** A curated
 * event is added by somebody who has never stood at the venue, so a listing
 * that is simply wrong is a different failure from one written to deceive, and
 * a moderator wants to tell them apart before deciding whether an organiser is
 * the problem or the pin is.
 */
export type EventReportType =
  | 'misleading_listing'
  | 'unsafe_venue'
  | 'organiser_conduct'
  | 'not_real'
  | 'other'

export const reportEvent = async (
  eventId: string,
  reportType: EventReportType,
  description?: string
): Promise<SafetyActionResult> => {
  try {
    const result = await apiClient.reportEvent(eventId, reportType, description)
    if (!result.success) {
      Logger.error('general', 'Error reporting event', { error: result.error })
      return { success: false, message: result.error || 'Failed to submit report' }
    }
    return { success: true, message: 'Report submitted' }
  } catch (error) {
    Logger.error('general', 'Error reporting event', { error })
    return { success: false, message: 'Something went wrong' }
  }
}

/**
 * The reason list, straight from the control.
 *
 * `showUserSafetyActions` puts an extra step in front of this — a menu whose
 * only options are Block and Report — because a person can be blocked. An event
 * cannot, so the same shape here would be a one-item menu, which is a tap
 * asking permission to show a list.
 */
export const showEventReportOptions = (
  eventTitle: string,
  eventId: string,
  onComplete?: () => void
): void => {
  const options: { text: string; value?: EventReportType; style?: 'cancel' }[] = [
    { text: 'Misleading or inaccurate listing', value: 'misleading_listing' },
    { text: "The venue doesn't feel safe", value: 'unsafe_venue' },
    { text: 'Concerns about the organiser', value: 'organiser_conduct' },
    { text: "This doesn't look like a real event", value: 'not_real' },
    { text: 'Something else', value: 'other' },
    { text: 'Cancel', style: 'cancel' },
  ]

  Alert.alert(
    'Report this event',
    `Why are you reporting ${eventTitle}?`,
    options.map((option) => ({
      text: option.text,
      style: option.style,
      onPress: option.value
        ? async () => {
            const result = await reportEvent(eventId, option.value!)
            Alert.alert(
              result.success ? 'Thank you' : 'Error',
              result.success
                ? /*
                   * No promise about what happens to the event. A report is
                   * read by a human who may decide it is fine, and copy
                   * implying removal would make every unchanged listing look
                   * like the report was ignored.
                   */
                  'Your report has been submitted. Our team will review it.'
                : result.message
            )
            if (result.success) onComplete?.()
          }
        : undefined,
    }))
  )
}

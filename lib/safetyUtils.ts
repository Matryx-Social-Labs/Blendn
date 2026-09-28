import { leaveConfirmation } from './conversationReveal'
import { apiClient } from './apiClient'
import { Logger } from './logger'
import { showSheet, type Sheet, type SheetOutcome } from './sheet'

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


/*
 * Every sheet below goes through `lib/sheet.ts`, not `Alert.alert`.
 *
 * These were alerts with four to seven buttons, and Android draws three: the
 * leave sheet lost "Block and report", the user report lost everything after
 * "Harassment", and the message report lost "Hate speech" and "Other" — on
 * half the phones, the reasons most likely to be needed were the ones cut.
 * A sheet draws every option on both platforms, and each report now takes a
 * reason *and* an optional note, which every report endpoint accepts.
 *
 * The call shapes did not change: these are still plain functions a screen
 * calls, with the same arguments, and `components/SheetHost.tsx` draws them.
 */

/** Why somebody reports a person. The server stores the value as given. */
const USER_REPORT_REASONS: { value: ReportType; label: string }[] = [
  { value: 'harassment', label: 'Harassment or threats' },
  { value: 'inappropriate_messages', label: 'Inappropriate messages' },
  { value: 'inappropriate_photos', label: 'Inappropriate photos' },
  { value: 'fake_profile', label: 'Fake profile' },
  { value: 'spam', label: 'Spam or scam' },
  { value: 'other', label: 'Something else' },
]

/** Why somebody reports one message. */
const MESSAGE_REPORT_REASONS: { value: MessageReportType; label: string }[] = [
  { value: 'harassment', label: 'Harassment or threats' },
  { value: 'hate_speech', label: 'Hate speech' },
  { value: 'inappropriate_content', label: 'Inappropriate content' },
  { value: 'spam', label: 'Spam or scam' },
  { value: 'other', label: 'Something else' },
]

/*
 * No promise about what happens next. A report is read by a human who may
 * decide it is fine, and copy implying removal would make every unchanged
 * profile or message look like the report was ignored.
 */
const REPORTED = 'Report sent. Our team will review it.'

/** A step that failed, in the server's sentence when it wrote one. */
const failed = (serverSays: string | undefined, fallback: string): SheetOutcome => {
  const said = serverSays || fallback
  return { ok: false, error: `${said}${/[.!?]$/.test(said) ? '' : '.'} Try again.` }
}

/**
 * Leaving a conversation: unmatch, or unmatch/block with a report.
 *
 * Distinct from `showUserSafetyActions`, which is the general "this person is a
 * problem" sheet available from a profile. This one is about *this
 * conversation*, and the difference that matters is that it can close it.
 *
 * ## Report is bundled, not offered afterwards
 *
 * "Unmatch and report" is one request. Composing them -- close, then report --
 * can half-fail into exactly the state the whole design exists to prevent: a
 * closed thread whose evidence is out of reach, or a report with no safety
 * action. The server does both in one transaction.
 *
 * It also matters psychologically. The safest-feeling act is "make it go
 * away", and if that is the button that loses the case, the people most in
 * need of the report are the least likely to file one.
 *
 * ## The reason is asked, not assumed
 *
 * This used to send `{ reason: 'other' }` for every report, so a moderator
 * opened each one knowing nothing. The report step now asks why, with the same
 * reasons a profile report offers, and an optional note.
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
  const done = fromMatch ? `Unmatched ${displayName}` : 'Conversation ended'

  const leave = async (
    action: 'unmatch' | 'block',
    report?: { reason: string; description?: string }
  ): Promise<SheetOutcome> => {
    const result = await apiClient.leaveConversation(conversationId, {
      action,
      ...(report ? { report } : {}),
    })
    if (!result.success) return failed(result.error, "Couldn't do that.")
    onLeft?.()
    return { ok: true, toast: report ? `${done}. ${REPORTED}` : done }
  }

  const reportStep = (action: 'unmatch' | 'block', title: string): Sheet => ({
    kind: 'reasons',
    title,
    message: `Why are you reporting ${displayName}?`,
    reasons: USER_REPORT_REASONS,
    submitLabel: action === 'block' ? 'Block and report' : `${verb} and report`,
    run: (reason, description) => leave(action, { reason, ...(description ? { description } : {}) }),
  })

  showSheet({
    kind: 'actions',
    title: copy.title,
    message: copy.body,
    actions: [
      { label: verb, variant: 'destructive', run: () => leave('unmatch') },
      { label: `${verb} and report`, next: () => reportStep('unmatch', `${verb} and report`) },
      {
        // Block is the stronger option, surfaced here rather than buried,
        // because somebody who wants to be *unseen* rather than merely
        // disconnected needs the other button and may not know it exists.
        label: 'Block and report',
        next: () => reportStep('block', `Block and report ${displayName}`),
      },
      { label: 'Cancel', cancel: true },
    ],
  })
}

/**
 * The general "this person is a problem" sheet, from a profile, a friend, a
 * person card in the Room. Block or report, each one step further in.
 */
export const showUserSafetyActions = (
  userName: string,
  userId: string,
  onBlock?: () => void,
  onReport?: () => void
): void => {
  showSheet({
    kind: 'actions',
    title: userName,
    message: 'Blocking hides you from each other. A report goes to our team, and they are not told who sent it.',
    actions: [
      { label: 'Block', variant: 'destructive', next: () => blockStep(userName, userId, onBlock) },
      { label: 'Report', next: () => userReportStep(userName, userId, onReport) },
      { label: 'Cancel', cancel: true },
    ],
  })
}

const blockStep = (userName: string, userId: string, onComplete?: () => void): Sheet => ({
  kind: 'actions',
  title: `Block ${userName}?`,
  message: "They won't be able to see your profile or message you, and you won't see each other in rooms.",
  actions: [
    {
      label: 'Block',
      variant: 'destructive',
      run: async () => {
        const result = await blockUser(userId)
        if (!result.success) return failed(result.message, "Couldn't block them.")
        onComplete?.()
        return { ok: true, toast: `${userName} is blocked` }
      },
    },
    { label: 'Cancel', cancel: true },
  ],
})

/** A person's report step, for a sheet that is already open (a message request's "More"). */
export const userReportStep = (userName: string, userId: string, onComplete?: () => void): Sheet => ({
  kind: 'reasons',
  title: `Report ${userName}`,
  message: `Why are you reporting ${userName}?`,
  reasons: USER_REPORT_REASONS,
  submitLabel: 'Send report',
  run: async (reason, description) => {
    const result = await reportUser(userId, reason as ReportType, description)
    if (!result.success) return failed(result.message, "Couldn't send your report.")
    onComplete?.()
    return { ok: true, toast: REPORTED }
  },
})

/** The block confirmation on its own, for a screen that already asked. */
export const showBlockConfirmation = (
  userName: string,
  userId: string,
  onComplete?: () => void
): void => {
  showSheet(blockStep(userName, userId, onComplete))
}

/** The user report reasons on their own. */
export const showReportOptions = (
  userName: string,
  userId: string,
  onComplete?: () => void
): void => {
  showSheet(userReportStep(userName, userId, onComplete))
}

/** Report one message, from a chat's long-press menu. */
export const showMessageReportOptions = (
  messageId: string,
  messageType: 'group' | 'private',
  onComplete?: () => void
): void => {
  showSheet(messageReportStep(messageId, messageType, onComplete))
}

/**
 * The same step, for a menu that is already a sheet: it replaces the menu in
 * place rather than closing one and opening another.
 */
export const messageReportStep = (
  messageId: string,
  messageType: 'group' | 'private',
  onComplete?: () => void
): Sheet => ({
  kind: 'reasons',
  title: 'Report message',
  message: 'Why are you reporting this message?',
  reasons: MESSAGE_REPORT_REASONS,
  submitLabel: 'Send report',
  run: async (reason, description) => {
    const result = await reportMessage(messageId, messageType, reason as MessageReportType, description)
    if (!result.success) return failed(result.message, "Couldn't send your report.")
    onComplete?.()
    return { ok: true, toast: REPORTED }
  },
})


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
  const reasons: { value: EventReportType; label: string }[] = [
    { value: 'misleading_listing', label: 'Misleading or inaccurate listing' },
    { value: 'unsafe_venue', label: "The venue doesn't feel safe" },
    { value: 'organiser_conduct', label: 'Concerns about the organiser' },
    { value: 'not_real', label: "This doesn't look like a real event" },
    { value: 'other', label: 'Something else' },
  ]

  showSheet({
    kind: 'reasons',
    title: 'Report this event',
    message: `Why are you reporting ${eventTitle}?`,
    reasons,
    submitLabel: 'Send report',
    run: async (reason, description) => {
      const result = await reportEvent(eventId, reason as EventReportType, description)
      if (!result.success) return failed(result.message, "Couldn't send your report.")
      onComplete?.()
      /*
       * No promise about what happens to the event. A report is read by a
       * human who may decide it is fine, and copy implying removal would make
       * every unchanged listing look like the report was ignored.
       */
      return { ok: true, toast: 'Report sent. Our team will review it.' }
    },
  })
}

/**
 * Why somebody would report a **room** — what no single message shows.
 *
 * A message can be reported and so can a person; a room gone bad is neither.
 * It is a pile-on across twenty messages, or a host letting it happen, and
 * reporting one message of it hands a moderator a fragment. The server stores
 * these beside event reports (`event_reports.chat_group_id`) and shows them as
 * "Room", so the reason is free text and this list is the vocabulary.
 */
export type RoomReportType = 'pile_on' | 'hate_speech' | 'unsafe' | 'host_conduct' | 'spam' | 'other'

export const ROOM_REPORT_REASONS: { value: RoomReportType; label: string }[] = [
  { value: 'pile_on', label: 'People are ganging up on someone' },
  { value: 'hate_speech', label: 'Hate speech or slurs' },
  { value: 'unsafe', label: 'Someone could get hurt' },
  { value: 'host_conduct', label: 'The host is letting it happen' },
  { value: 'spam', label: 'Spam or scams' },
  { value: 'other', label: 'Something else' },
]

/** Report a whole room, from Room info. Straight to the reasons, like an event. */
export const showRoomReportOptions = (chatGroupId: string, onComplete?: () => void): void => {
  showSheet({
    kind: 'reasons',
    title: 'Report this room',
    message: "What's going on in here? Our team reads the room, not just one message, and nobody is told who reported it.",
    reasons: ROOM_REPORT_REASONS,
    submitLabel: 'Send report',
    run: async (reason, description) => {
      try {
        const result = await apiClient.reportChatGroup(chatGroupId, reason, description)
        if (!result.success) return failed(result.error, "Couldn't send your report.")
      } catch (error) {
        Logger.error('general', 'Error reporting room', { error })
        return failed(undefined, "Couldn't send your report.")
      }
      onComplete?.()
      return { ok: true, toast: REPORTED }
    },
  })
}

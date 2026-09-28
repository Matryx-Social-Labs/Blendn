import AsyncStorage from '@react-native-async-storage/async-storage'

import { Logger } from './logger'

/** The published guidelines. Settings and the room chat's banner both link here. */
export const COMMUNITY_GUIDELINES_URL = 'https://www.blendn.app/community-guidelines'

/**
 * Whether this person has put away the guidelines banner in this room.
 *
 * Per room, because the ask belongs to walking into a new room of strangers: a
 * "Got it" at Friday's event says nothing about Saturday's. A chat group is one
 * event's room (`chat_groups.event_id` is unique on the server), so the room id
 * is the event. Per user as well, for the same reason as the check-in warning
 * (`lib/roomVisibilityStorage.ts`): two accounts on one phone is every tester's
 * phone, and the second one has not read anything.
 *
 * Local, and nothing throws. A lost record shows the banner again, which is the
 * safe direction for a safety prompt.
 */
const KEY_PREFIX = 'blendn.roomGuidelines.'

export const roomGuidelinesKey = (userId: string, chatRoomId: string) =>
  `${KEY_PREFIX}${userId}.${chatRoomId}`

export async function hasDismissedRoomGuidelines(userId: string, chatRoomId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(roomGuidelinesKey(userId, chatRoomId))) === 'dismissed'
  } catch (error) {
    Logger.warn('chat', 'Could not read the room guidelines flag', { error })
    return false
  }
}

export async function dismissRoomGuidelines(userId: string, chatRoomId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(roomGuidelinesKey(userId, chatRoomId), 'dismissed')
  } catch (error) {
    Logger.warn('chat', 'Could not persist the room guidelines flag', { error })
  }
}

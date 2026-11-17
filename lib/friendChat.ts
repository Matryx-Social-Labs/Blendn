import { router } from 'expo-router'

import { apiClient } from './apiClient'
import type { FriendPerson } from './friends'

/** Said when the DM did not open: the same words on a friend's profile and on the list's Message button. */
export const CHAT_FAILED = 'The conversation didn’t open. Try again.'

/**
 * Message a friend: the open DM if one is known, else the server finds or opens one (no shared event needed), then the chat.
 * False when it did not open, for the caller to say so.
 */
export async function openFriendChat(friend: Pick<FriendPerson, 'userId' | 'name'>, conversationId?: string | null): Promise<boolean> {
  const id = conversationId ?? (await apiClient.openFriendConversation(friend.userId)).data?.conversationId
  if (!id) return false
  router.push({ pathname: '/private-chat/[conversationId]', params: { conversationId: id, otherUserName: friend.name, otherUserId: friend.userId } })
  return true
}

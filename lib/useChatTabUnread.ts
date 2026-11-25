import { useEffect, useState } from 'react'

import { useRoomMembership } from './roomMembership'
import type { RoomTab } from './roomTab'
import { watchRoomUnread } from './roomUnread'
import { subscribeToChatMessage } from './socketClient'
import { useLatest } from './useLatest'

/**
 * The Chat tab's badge (Flow 5 R-A): the server's unread for the room as the Room opens, then one for each message
 * from someone else while People shows; nothing while Chat shows, and nothing again once you have been there. The
 * socket is the one the Room already listens on (the chat is mounted with it), so this joins nothing more. A room you
 * left is not listened to: the server refuses the socket.
 */
export function useChatTabUnread({ chatGroupId, eventId, tab, myId }: { chatGroupId: string | null; eventId: string | null; tab: RoomTab; myId?: string }) {
  const [unread, setUnread] = useState(0)
  const onPeople = useLatest(tab === 'people')
  const left = useRoomMembership().left.has(chatGroupId ?? '')
  if (tab === 'chat' && unread !== 0) setUnread(0)

  useEffect(() => {
    if (!eventId) return
    const watch = watchRoomUnread({ eventId, onChange: (n) => onPeople.current && setUnread(n) })
    void watch.refresh(true)
    return () => watch.stop()
  }, [eventId, onPeople])

  useEffect(() => {
    if (!chatGroupId || left) return
    return subscribeToChatMessage(chatGroupId, (data) => {
      if (data.chatGroupId !== chatGroupId || data.message.userId === myId || !onPeople.current) return
      setUnread((n) => n + 1)
    })
  }, [chatGroupId, left, myId, onPeople])

  return unread
}

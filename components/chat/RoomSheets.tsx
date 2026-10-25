import { useState } from 'react'

import { apiClient } from '../../lib/apiClient'
import { H } from '../../lib/haptics'
import { queryCache } from '../../lib/queryCache'
import { isMuted, markRoomLeft, MUTE_OPTIONS, muteLabel, muteUntil, rememberRoomMute, useRoomMute, type MuteOption } from '../../lib/roomMembership'
import { useAuth } from '../../lib/useAuth'
import { userMessage } from '../../lib/userMessage'
import { Sheet } from '../ds/Sheet'
import { OptionRows } from '../SheetHost'
import { useToast } from '../Toast'

/**
 * Mute a room's notifications (Room info #03, the Banter's swipe, R3-D5
 * 5.11): 1 hour, 8 hours, until tomorrow, or until you turn it back on —
 * `H.select` on the pick. Yours alone; nobody is told. Muted already, it
 * offers Unmute first and says until when.
 */
export function MuteSheet({ chatGroupId, onClose }: { chatGroupId: string | null; onClose: () => void }) {
  const { showToast } = useToast()
  const mute = useRoomMute(chatGroupId)
  const muted = isMuted(mute)
  const [busy, setBusy] = useState(false)

  const muteTo = async (option: MuteOption) => {
    if (!chatGroupId) return
    H.select()
    setBusy(true)
    const result = await apiClient.muteChatGroup(chatGroupId, muteUntil(option))
    setBusy(false)
    if (!result.success || !result.data) return showToast(userMessage(result, "Couldn’t mute this room. Try again."), 'error', { haptic: 'error' })
    rememberRoomMute(chatGroupId, result.data.mute)
    onClose()
    showToast(muteLabel(result.data.mute) ?? 'Room muted', 'success')
  }
  const unmute = async () => {
    if (!chatGroupId) return
    setBusy(true)
    const result = await apiClient.unmuteChatGroup(chatGroupId)
    setBusy(false)
    if (!result.success || !result.data) return showToast(userMessage(result, "Couldn’t unmute this room. Try again."), 'error', { haptic: 'error' })
    rememberRoomMute(chatGroupId, result.data.mute)
    onClose()
    showToast('Room unmuted', 'success')
  }

  return (
    <Sheet
      visible={!!chatGroupId}
      onClose={onClose}
      icon="bell-off"
      title={muted ? 'Notifications' : 'Mute notifications'}
      body={
        muted
          ? `${muteLabel(mute)}. You still see every message here; the room just doesn’t notify you.`
          : 'The room stops notifying you. You can still read and post, and nobody’s told.'
      }
      actions={[
        ...(muted ? [{ label: 'Unmute', kind: 'lit' as const, onPress: () => void unmute(), loading: busy }] : []),
        { label: 'Cancel', kind: 'tertiary', onPress: onClose },
      ]}
      testID="mute-sheet"
    >
      <OptionRows rows={MUTE_OPTIONS.map((o) => ({ key: o.value, label: o.label, disabled: busy, onPress: () => void muteTo(o.value) }))} />
    </Sheet>
  )
}

/**
 * Leave a room (Room info #04, the Banter's swipe): undoable by checking in
 * again, and the confirm says so before the tap. Leave room is the
 * destructive button (`H.destructive` on its press); the room goes from the
 * Banter at once.
 */
export function LeaveRoomSheet({
  chatGroupId,
  place,
  onClose,
  onLeft,
}: {
  chatGroupId: string | null
  /** A place's room (R4-D5 5-2): the way back is going live there, not checking in. */
  place?: string
  onClose: () => void
  onLeft: () => void
}) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)

  const leave = async () => {
    if (!chatGroupId) return
    setBusy(true)
    const result = await apiClient.leaveChatGroup(chatGroupId)
    setBusy(false)
    if (!result.success) return showToast(userMessage(result, "Couldn’t leave this room. Try again."), 'error', { haptic: 'error' })
    markRoomLeft(chatGroupId)
    if (user?.id) queryCache.invalidate(`group_chats_${user.id}`)
    onClose()
    onLeft()
    showToast('You left the room', 'success')
  }

  return (
    <Sheet
      visible={!!chatGroupId}
      onClose={onClose}
      title="Leave this room?"
      body={
        place
          ? leavePlaceLine(place)
          : 'You’ll stop getting its messages and notifications, and it leaves your Banter. You can rejoin by checking in at the event again.'
      }
      actions={[
        { label: 'Leave room', kind: 'destructive', onPress: () => void leave(), loading: busy },
        { label: 'Cancel', kind: 'tertiary', onPress: onClose },
      ]}
      testID="leave-sheet"
    />
  )
}

/** R4-D5 5-2: leaving a place's room is for tonight, and going live again is the way back. */
export const leavePlaceLine = (place: string) => `You leave ${place}’s room for tonight. Go live again any time you’re here.`

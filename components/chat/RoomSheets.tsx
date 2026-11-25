import { useState } from 'react'

import { apiClient } from '../../lib/apiClient'
import { H } from '../../lib/haptics'
import { isMuted, MUTE_OPTIONS, muteLabel, muteUntil, rememberRoomMute, useRoomMute, type MuteOption } from '../../lib/roomMembership'
import { CHECK_OUT_CONSEQUENCE, CHECK_OUT_LABEL, CHECKING_OUT_LABEL, checkedOutLine, checkOutCaption, checkOutQuestion, STAY_LABEL } from '../../lib/switchCopy'
import { useCheckOut } from '../../lib/useRoomControls'
import { userMessage } from '../../lib/userMessage'
import { HoldToConfirm } from '../ds/HoldToConfirm'
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
      title={muted ? 'Notifications' : 'Mute this room'}
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
 * Check out of the room's event (I-A: one exit; staying in the chat without its pushes is Mute this room). The question
 * and its consequence are the shared words (`lib/switchCopy.ts`), as the room's ⋯ and the event page ask them, and the commit
 * is the event page's: the neutral hold (buttons board C, owner 2026-11-17: leaving is not a yes, one look for Check out).
 * The confirm closes first, so a refusal's toast is seen; `useCheckOut` is single-flight.
 */
export function CheckOutSheet({
  eventId,
  name,
  onClose,
  onCheckedOut,
}: {
  /** The event (or the place's venue day) to check out of; null closes the sheet. */
  eventId: string | null
  /** The room's event or place, for the question; missing reads "this event". */
  name?: string | null
  onClose: () => void
  onCheckedOut?: () => void
}) {
  const { showToast } = useToast()
  const { checkOut, checkOutBusy } = useCheckOut(eventId)
  const out = async () => {
    onClose()
    if (!(await checkOut())) return
    showToast(checkedOutLine(name), 'success')
    onCheckedOut?.()
  }

  return (
    <Sheet
      visible={!!eventId}
      onClose={onClose}
      title={checkOutQuestion(name)}
      body={CHECK_OUT_CONSEQUENCE}
      actions={[{ label: STAY_LABEL, kind: 'tertiary', onPress: onClose }]}
      testID="check-out-confirm"
    >
      <HoldToConfirm
        kind="neutral"
        label={CHECK_OUT_LABEL}
        busyLabel={CHECKING_OUT_LABEL}
        srLabel="Check out"
        consequence={checkOutCaption(name)}
        onConfirm={() => void out()}
        busy={checkOutBusy}
        testID="check-out-confirm-hold"
      />
    </Sheet>
  )
}

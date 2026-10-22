import { useEffect, useState } from 'react'

import { checkInChanged } from './checkIn'
import { subscribeToLiveEnded } from './socketClient'
import { useLatest } from './useLatest'

/** The server's word for a check-in ended because the organiser cancelled the event (`live:ended`, Flow 4 R4.1 4.6). */
export const CANCELLED_REASON = 'cancelled'

/**
 * "The event was cancelled while you're inside" (Flow 4 R4.1 4.6 #25).
 *
 * The server cancels everyone's check-in and says so with
 * `live:ended { eventId, reason: 'cancelled' }`. An older server says nothing,
 * and then nothing happens here: the room is read again at its next natural
 * time and finds itself empty.
 *
 * Kept as the title it was, not the room: the check-in is gone, and the room
 * clears under the card. Only the event you are inside counts; another event's
 * end is not this room's.
 */
export function useRoomCancelled(event: { id: string; title: string } | null): { cancelled: { title: string } | null; dismiss: () => void } {
  const [cancelled, setCancelled] = useState<{ eventId: string; title: string } | null>(null)
  const current = useLatest(event)

  useEffect(
    () =>
      subscribeToLiveEnded((data) => {
        const inside = current.current
        if (data.reason !== CANCELLED_REASON || !inside || data.eventId !== inside.id) return
        setCancelled({ eventId: inside.id, title: inside.title })
        // The disc drains live to idle now, not at its next poll.
        checkInChanged(inside.id)
      }),
    [current]
  )

  // A different room is a clean slate: the card is only ever for the event it was cancelled in.
  const shown = cancelled && (!event || event.id === cancelled.eventId) ? cancelled : null

  return { cancelled: shown ? { title: shown.title } : null, dismiss: () => setCancelled(null) }
}

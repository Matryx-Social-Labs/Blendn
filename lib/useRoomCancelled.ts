import { useCallback, useEffect, useState } from 'react'

import { checkInChanged } from './checkIn'
import { subscribeToEventCancelled } from './socketClient'
import { useLatest } from './useLatest'

/**
 * "The event was cancelled while you're inside" (Flow 4 R4.1 4.6 #25).
 *
 * The server checks everyone inside out and says so with the socket event
 * `event:cancelled { eventId }`, to the event's rooms (one emit, however many are
 * inside; admin `emitEventCancelled`), and a push and bell row of kind
 * `event_cancelled`. (`live:ended` is a Go Live's end and never says this.) A
 * server that does not send it changes nothing here: the room is read again at
 * its next natural time and finds itself empty.
 *
 * Kept as the title it was, not the room: the check-in is gone, and the room
 * clears under the card. Only the event you are inside counts; another event's
 * end is not this room's.
 */
export function useRoomCancelled(event: { id: string; title: string } | null): { cancelled: { title: string } | null; dismiss: () => void } {
  const [cancelled, setCancelled] = useState<{ eventId: string; title: string } | null>(null)
  const current = useLatest(event)

  const eventId = event?.id ?? null
  const fire = useCallback(
    (id: string) => {
      const inside = current.current
      if (!inside || inside.id !== id) return
      setCancelled({ eventId: inside.id, title: inside.title })
      // The disc drains live to idle now, not at its next poll.
      checkInChanged(inside.id)
    },
    [current]
  )

  useEffect(() => (eventId ? subscribeToEventCancelled(eventId, (d) => fire(d.eventId)) : undefined), [eventId, fire])

  // A different room is a clean slate: the card is only ever for the event it was cancelled in.
  const shown = cancelled && (!event || event.id === cancelled.eventId) ? cancelled : null

  return { cancelled: shown ? { title: shown.title } : null, dismiss: () => setCancelled(null) }
}

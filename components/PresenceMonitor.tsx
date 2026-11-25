import { useEffect, useState } from 'react'
import { AppState } from 'react-native'

import { apiClient } from '../lib/apiClient'
import { checkInChanged, subscribeCheckInChanged } from '../lib/checkIn'
import { Logger } from '../lib/logger'
import { usePresence } from '../lib/usePresence'
import { useCheckOut } from '../lib/useRoomControls'
import { PresenceSheets } from './PresenceSheets'

/**
 * The app's one presence loop, for whatever event you are checked in at (SCRUM-1327).
 *
 * The event is the one `/checkins/active` names, re-read on every return to the app and on every check-in or check-out
 * (`checkInChanged`), the read that answers last winning. A Go Live's venue day is LiveAtVenue's. It pings that event
 * through `usePresence` and the server judges: the same fence and accuracy rule as the door, so a fix the door would
 * refuse places nobody (`unknown`). The server checks people out, after 20 minutes outside; the app never does on its
 * own, only when "Check me out" is tapped.
 *
 * "Still at the event?" is asked once per departure, when the server has had two good outside readings a grace period
 * apart (`outside` / `grace_expired`): one reading at the gate is not a departure. "I'm still here" changes nothing on
 * the server; the next reading inside clears it. A check-out by the server for leaving is said (`left_area`); the end
 * of the event (end + 60, the presence sweeper) is not.
 *
 * Foreground only, mounted at the root while signed in: no background location (DECISIONS). Leaving with the app
 * closed is closed at the event's end.
 */
export function PresenceMonitor() {
  const [eventId, setEventId] = useState<string | null>(null)
  const presence = usePresence(eventId)
  // Answered for this departure; a reading inside (anything but `outside`) ends the departure, and the next one asks again.
  const [answered, setAnswered] = useState(false)
  const departing = presence.state === 'outside'
  if (!departing && answered) setAnswered(false)
  const asking = departing && presence.reason === 'grace_expired' && !answered
  // Checked out by the server for leaving: said once, and kept on screen after the loop has moved on (React's
  // "information from previous renders" pattern, so no effect sets state).
  const leftFor = presence.finished && presence.reason === 'left_area' ? eventId : null
  const [seenLeftFor, setSeenLeftFor] = useState<string | null>(null)
  const [notice, setNotice] = useState(false)
  if (leftFor !== seenLeftFor) {
    setSeenLeftFor(leftFor)
    if (leftFor) setNotice(true)
  }
  const { checkOut } = useCheckOut(eventId)

  useEffect(() => {
    let latest = 0
    const resolve = async () => {
      const mine = ++latest
      try {
        const active = await apiClient.getActiveCheckins({ force: true })
        if (mine !== latest) return
        // A failed read keeps the event it had: offline at the venue must not stop the loop. The server says when it is over.
        if (!active.success) return
        setEventId(active.data?.checkIns?.find((c) => c.kind !== 'venue_day')?.eventId ?? null)
      } catch (e) {
        Logger.warn('presence', 'could not read the active check-in', { error: e })
      }
    }
    void resolve()
    const app = AppState.addEventListener('change', (next) => {
      if (next === 'active') void resolve()
    })
    const off = subscribeCheckInChanged(() => void resolve())
    return () => {
      latest = -1
      app.remove()
      off()
    }
  }, [])

  useEffect(() => {
    if (presence.finished && eventId) checkInChanged(eventId)
  }, [presence.finished, eventId])

  return (
    <PresenceSheets
      asking={asking}
      onStay={() => setAnswered(true)}
      // Closed only once it worked: a refusal is toasted by `useCheckOut` and the question stays.
      onLeave={async () => {
        if (await checkOut()) setAnswered(true)
      }}
      notice={notice}
      onNoticeDone={() => setNotice(false)}
    />
  )
}

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
/** A failed read of the active check-in is tried again after this. */
const RESOLVE_RETRY_MS = 60_000

export function PresenceMonitor() {
  // The check-in, not only its event: checking out and back in to the same event starts a new loop.
  const [active, setActive] = useState<{ eventId: string; id: string } | null>(null)
  const eventId = active?.eventId ?? null
  const presence = usePresence(eventId, active?.id)
  // Answered for this departure, of this event (a late answer cannot carry over to the next one). Only a reading inside
  // ends it: a blurry `unknown` in between is no news, so "I'm still here" is not asked again on the next outside one.
  const [answeredFor, setAnsweredFor] = useState<string | null>(null)
  if (answeredFor && presence.state === 'inside') setAnsweredFor(null)
  const asking = presence.state === 'outside' && presence.reason === 'grace_expired' && answeredFor !== eventId
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
    let retry: ReturnType<typeof setTimeout> | undefined
    const resolve = async () => {
      const mine = ++latest
      clearTimeout(retry)
      try {
        const read = await apiClient.getActiveCheckins({ force: true })
        if (mine !== latest) return
        if (!read.success) throw new Error(read.error ?? 'active check-ins unavailable')
        const checkIn = read.data?.checkIns?.find((c) => c.kind !== 'venue_day')
        setActive(checkIn?.eventId ? { eventId: checkIn.eventId, id: checkIn.id } : null)
      } catch (e) {
        if (mine !== latest) return
        // Keeps the check-in it had (offline at the venue must not stop the loop), and tries again: launched offline,
        // there is none yet, and nothing else would ask before the next return to the app.
        Logger.warn('presence', 'could not read the active check-in', { error: String(e) })
        retry = setTimeout(() => void resolve(), RESOLVE_RETRY_MS)
      }
    }
    void resolve()
    const app = AppState.addEventListener('change', (next) => {
      if (next === 'active') void resolve()
    })
    const off = subscribeCheckInChanged(() => void resolve())
    return () => {
      latest = -1
      clearTimeout(retry)
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
      onStay={() => setAnsweredFor(eventId)}
      // Closed only once it worked: a refusal is toasted by `useCheckOut` and the question stays.
      onLeave={async () => {
        const leaving = eventId
        if (await checkOut()) setAnsweredFor(leaving)
      }}
      notice={notice}
      onNoticeDone={() => setNotice(false)}
    />
  )
}

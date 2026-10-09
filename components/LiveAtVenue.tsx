import { useCallback, useEffect, useState } from 'react'
import { AppState } from 'react-native'

import { apiClient } from '../lib/apiClient'
import { checkInChanged, subscribeCheckInChanged } from '../lib/checkIn'
import {
  EXTEND_CHOICE,
  liveEndedMessage,
  markLivePrompted,
  promptDelayMs,
  readLiveSession,
  type LiveSession,
} from '../lib/goLive'
import { Logger } from '../lib/logger'
import { subscribeToLiveEnded } from '../lib/socketClient'
import { showPlusPlaceholder, useGoLive } from '../lib/useGoLive'
import { useLatest } from '../lib/useLatest'
import { usePresence } from '../lib/usePresence'
import ActionTray, { type ActionTrayButton } from './ActionTray'
import { useToast } from './Toast'

type ActiveLive = { venueDayId: string; expiresAt: string | null; stay: boolean; venueName: string | null }

/**
 * Your Go Live, wherever you are in the app (plan v2 step 5). Mounted at the
 * root beside `PresenceMonitor`, because the window ends whether or not the
 * place screen is open — most likely while you are in its room.
 *
 * - **Pings** the venue day's presence (`usePresence`), which is what carries
 *   a "stay" window on while you are inside, and tells the server you left.
 * - **The expiry prompt**, five minutes before a fixed window ends, at most
 *   once a night (PL-M02): extend for free, "Stay with Blendn+" as a locked
 *   placeholder until the paywall exists (step 11), or let it end.
 * - **`live:ended`**: says what happened, and tells the tab bar (`checkInChanged`).
 *
 * Renders nothing until it has something to say.
 */
export function LiveAtVenue() {
  const { showToast } = useToast()
  const [active, setActive] = useState<ActiveLive | null>(null)
  const [session, setSession] = useState<LiveSession | null>(null)
  const [tray, setTray] = useState<{ title: string; message: string; buttons: ActionTrayButton[] } | null>(null)
  const closeTray = useCallback(() => setTray(null), [])
  const showTray = useCallback(
    (title: string, message: string, buttons?: ActionTrayButton[]) =>
      setTray({ title, message, buttons: buttons?.length ? buttons : [{ label: 'Done', variant: 'primary', onPress: () => setTray(null) }] }),
    []
  )
  const nameRef = useLatest(active?.venueName ?? session?.venueName ?? null)

  /*
   * Re-read on mount, on foreground, and whenever a check-in changes anywhere
   * (`checkInChanged`: a Go Live, an extend, a check-out, `live:ended`, the
   * presence ping saying it is over).
   */
  useEffect(() => {
    let cancelled = false
    const read = async () => {
      try {
        const res = await apiClient.getActiveCheckins({ force: true })
        const live = res.success ? res.data?.checkIns?.find((c) => c.kind === 'venue_day') : undefined
        const remembered = await readLiveSession()
        if (cancelled) return
        setActive(
          live
            ? { venueDayId: live.eventId, expiresAt: live.expiresAt ?? null, stay: live.stay === true, venueName: live.event?.venueName ?? null }
            : null
        )
        setSession(remembered)
      } catch (error) {
        Logger.debug('presence', 'live read failed', { error: String(error) })
      }
    }
    void read()
    const offCheckIn = subscribeCheckInChanged(() => void read())
    const offEnded = subscribeToLiveEnded((data) => {
      const message = liveEndedMessage(data.reason, nameRef.current)
      if (message) showToast(message, 'info')
      // The tab bar and every cached "are you in" read; this re-reads too, through the listener.
      checkInChanged(data.eventId)
    })
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') void read()
    })
    return () => {
      cancelled = true
      offCheckIn()
      offEnded()
      app.remove()
    }
  }, [nameRef, showToast])

  const venueDayId = active?.venueDayId ?? null
  const presence = usePresence(venueDayId)
  // The server said the window is over on a ping: everything that shows it re-reads.
  useEffect(() => {
    if (presence.finished && venueDayId) checkInChanged(venueDayId)
  }, [presence.finished, venueDayId])

  // The place this phone went live at — needed to extend (the active check-in names the day, not the venue).
  const mine = active && session?.venueDayId === active.venueDayId ? session : null
  const place = mine ? { id: mine.venueId, name: mine.venueName, latitude: null, longitude: null } : null
  const { goLive } = useGoLive({
    place,
    showTray,
    closeTray,
    // `useGoLive` has already said so through `checkInChanged`, which re-reads here.
    onLive: (result) =>
      showToast(`You're live until ${new Date(result.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`, 'success'),
  })
  const goLiveRef = useLatest(goLive)

  useEffect(() => {
    // ponytail: only a session started on this phone is prompted; one started elsewhere has no venue to extend at.
    if (!active || !mine) return
    const delay = promptDelayMs(active, Date.now(), mine.prompted)
    if (delay === null) return
    const timer = setTimeout(() => {
      void markLivePrompted(active.venueDayId)
      setSession({ ...mine, prompted: true })
      const ends = active.expiresAt ? new Date(active.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'soon'
      setTray({
        title: `Still at ${mine.venueName}?`,
        message: `You stop being live at ${ends}.`,
        buttons: [
          {
            label: 'Extend 45 min · free',
            variant: 'primary',
            onPress: () => {
              setTray(null)
              void goLiveRef.current(EXTEND_CHOICE)
            },
          },
          // Locked: "stay" with Blendn+ is a placeholder until the paywall (step 11).
          { label: 'Stay with Blendn+ · locked', onPress: () => showPlusPlaceholder(showTray, closeTray) },
          { label: 'Let it end', onPress: () => setTray(null) },
        ],
      })
    }, delay)
    return () => clearTimeout(timer)
  }, [active, mine, showTray, closeTray, goLiveRef])

  return (
    <ActionTray
      visible={tray !== null}
      title={tray?.title ?? ''}
      message={tray?.message}
      buttons={tray?.buttons ?? []}
      onClose={closeTray}
      layout="stack"
    />
  )
}

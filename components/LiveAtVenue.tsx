import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'

import { apiClient } from '../lib/apiClient'
import { checkInChanged, subscribeCheckInChanged } from '../lib/checkIn'
import {
  EXTEND_CHOICE,
  liveEndedMessage,
  STAY_CHOICE,
  markLivePrompted,
  noteLiveDayEnd,
  promptDelayMs,
  readLiveSession,
  type GoLiveChoice,
  type LiveSession,
} from '../lib/goLive'
import { Logger } from '../lib/logger'
import { serverNow } from '../lib/serverClock'
import { subscribeToLiveEnded } from '../lib/socketClient'
import { useGoLive } from '../lib/useGoLive'
import { useAuth } from '../lib/useAuth'
import { useLatest } from '../lib/useLatest'
import { usePresence } from '../lib/usePresence'
import ActionTray, { type ActionTrayButton } from './ActionTray'
import { useToast } from './Toast'

type ActiveLive = { venueDayId: string; expiresAt: string | null; stay: boolean; venueName: string | null }

type Tray =
  | { kind: 'prompt'; venueDayId: string; expiresAt: string | null; venueName: string }
  | { kind: 'other'; title: string; message: string; buttons: ActionTrayButton[] }

/** A failed read of `/checkins/active` is tried again this soon — it is not "not live" (H1). */
export const LIVE_READ_RETRY_MS = 15_000

const timeOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'soon'

/**
 * Your Go Live, wherever you are in the app (plan v2 step 5). Mounted at the
 * root beside `PresenceMonitor`, because the window ends whether or not the
 * place screen is open — most likely while you are in its room.
 *
 * - **Pings** the venue day's presence (`usePresence`), which is what carries
 *   a "stay" window on while you are inside, and tells the server you left.
 * - **The expiry prompt**, five minutes before a fixed window ends, at most
 *   once a night (PL-M02): extend for free, "Stay live till I leave", or let
 *   it end. Staying is Blendn+'s where the server gates it: a `PLUS_REQUIRED`
 *   opens the paywall through its policy (`useGoLive`, step 11); in a city's
 *   launch season it just works.
 * - **`live:ended`**: says what happened, closes the prompt, and tells the
 *   tab bar (`checkInChanged`).
 *
 * Only a successful read says you are not live: a failed one keeps what is
 * known and tries again (H1), and an older read that answers last is dropped
 * (H2). Renders nothing until it has something to say.
 */
export function LiveAtVenue() {
  const { showToast } = useToast()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [active, setActive] = useState<ActiveLive | null>(null)
  const [session, setSession] = useState<LiveSession | null>(null)
  const [tray, setTray] = useState<Tray | null>(null)
  const closeTray = useCallback(() => setTray(null), [])
  const showTray = useCallback(
    (title: string, message: string, buttons?: ActionTrayButton[]) =>
      setTray({ kind: 'other', title, message, buttons: buttons?.length ? buttons : [{ label: 'Done', variant: 'primary', onPress: () => setTray(null) }] }),
    []
  )
  const nameRef = useLatest(active?.venueName ?? session?.venueName ?? null)
  /** Asked tonight, on this run — before the asking is on disk. */
  const askedRef = useRef(new Set<string>())

  useEffect(() => {
    let cancelled = false
    let seq = 0
    let retry: ReturnType<typeof setTimeout> | null = null
    const read = async () => {
      const mine = ++seq
      if (retry) {
        clearTimeout(retry)
        retry = null
      }
      try {
        const res = await apiClient.getActiveCheckins({ force: true })
        const remembered = await readLiveSession(userId)
        // A newer read has started since: its answer is the truth (H2).
        if (cancelled || mine !== seq) return
        if (!res.success || !res.data) {
          // Not "not live": keep the window, the pings and the prompt, and ask again (H1).
          retry = setTimeout(() => void read(), LIVE_READ_RETRY_MS)
          return
        }
        const live = res.data.checkIns?.find((c) => c.kind === 'venue_day')
        const next = live
          ? { venueDayId: live.eventId, expiresAt: live.expiresAt ?? null, stay: live.stay === true, venueName: live.event?.venueName ?? null }
          : null
        setActive(next)
        setSession(remembered)
        // A prompt about a window that has moved (extended elsewhere) or ended says something false.
        setTray((t) => (t?.kind === 'prompt' && (t.venueDayId !== next?.venueDayId || t.expiresAt !== next?.expiresAt) ? null : t))
        if (live && userId && live.event?.endTime) void noteLiveDayEnd(userId, live.eventId, live.event.endTime)
      } catch (error) {
        Logger.debug('presence', 'live read failed', { error: String(error) })
        if (!cancelled && mine === seq) retry = setTimeout(() => void read(), LIVE_READ_RETRY_MS)
      }
    }
    void read()
    const offCheckIn = subscribeCheckInChanged(() => void read())
    const offEnded = subscribeToLiveEnded((data) => {
      const message = liveEndedMessage(data.reason, nameRef.current)
      if (message) showToast(message, 'info')
      setTray((t) => (t?.kind === 'prompt' ? null : t))
      // The tab bar and every cached "are you in" read; this re-reads too, through the listener.
      checkInChanged(data.eventId)
    })
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') void read()
    })
    return () => {
      cancelled = true
      if (retry) clearTimeout(retry)
      offCheckIn()
      offEnded()
      app.remove()
    }
  }, [userId, nameRef, showToast])

  const venueDayId = active?.venueDayId ?? null
  const presence = usePresence(venueDayId)
  // The server said the window is over on a ping: everything that shows it re-reads.
  useEffect(() => {
    if (presence.finished && venueDayId) checkInChanged(venueDayId)
  }, [presence.finished, venueDayId])

  // The place this phone went live at — needed to extend (the active check-in names the day, not the venue).
  const mine = active && session?.venueDayId === active.venueDayId ? session : null
  const place = mine ? { id: mine.venueId, name: mine.venueName, latitude: null, longitude: null } : null
  const { goLive, busy } = useGoLive({
    place,
    showTray,
    closeTray,
    onLive: (result) =>
      showToast(result.stay ? "You're live for as long as you're here" : `You're live until ${timeOf(result.expiresAt)}`, 'success'),
  })

  useEffect(() => {
    // ponytail: only a session started on this phone is prompted; one started elsewhere has no venue to extend at.
    if (!active || !mine) return
    const asked = mine.prompted || askedRef.current.has(active.venueDayId)
    const delay = promptDelayMs(active, serverNow(), asked)
    if (delay === null) return
    const timer = setTimeout(() => {
      askedRef.current.add(active.venueDayId)
      setTray({ kind: 'prompt', venueDayId: active.venueDayId, expiresAt: active.expiresAt, venueName: mine.venueName })
    }, delay)
    return () => clearTimeout(timer)
  }, [active, mine])

  // Marked asked once the prompt is on screen, not when it was scheduled (M6).
  const promptedDay = tray?.kind === 'prompt' ? tray.venueDayId : null
  useEffect(() => {
    if (promptedDay && userId) void markLivePrompted(userId, promptedDay)
  }, [promptedDay, userId])

  const goLiveWith = (choice: GoLiveChoice) => () => {
    void goLive(choice).then((ok) => {
      if (ok) setTray((t) => (t?.kind === 'prompt' ? null : t))
    })
  }

  const visible: { title: string; message: string; buttons: ActionTrayButton[] } | null =
    tray?.kind === 'prompt'
      ? {
          title: `Still at ${tray.venueName}?`,
          message: `You stop being live at ${timeOf(tray.expiresAt)}.`,
          buttons: [
            { label: 'Extend 45 min · free', variant: 'primary', onPress: goLiveWith(EXTEND_CHOICE), loading: busy, disabled: busy },
            // Blendn+ where the server gates it (PLUS_REQUIRED → the paywall); everyone's in launch season.
            { label: 'Stay live till I leave · Blendn+', onPress: goLiveWith(STAY_CHOICE), disabled: busy },
            { label: 'Let it end', onPress: closeTray, disabled: busy },
          ],
        }
      : tray

  return (
    <ActionTray
      visible={visible !== null}
      title={visible?.title ?? ''}
      message={visible?.message}
      buttons={visible?.buttons ?? []}
      onClose={closeTray}
      layout="stack"
      // Three actions under a two-line title: room for all of them without scrolling.
      size="expanded"
    />
  )
}

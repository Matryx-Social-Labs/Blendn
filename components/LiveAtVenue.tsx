import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { usePathname } from 'expo-router'

import { apiClient } from '../lib/apiClient'
import { isBlendnOpen } from '../lib/blendnOverlay'
import { checkInChanged, subscribeCheckInChanged } from '../lib/checkIn'
import {
  EXTEND_CHOICE,
  opensAtWords,
  resetHourOf,
  liveEndedMessage,
  STAY_CHOICE,
  markLivePrompted,
  noteLiveDayEnd,
  readLiveSession,
  type GoLiveChoice,
  type LiveSession,
} from '../lib/goLive'
import { Logger } from '../lib/logger'
import type { TrayButton } from '../lib/locationFix'
import { trayKind } from '../lib/sheet'
import { serverNow } from '../lib/serverClock'
import { afterSheetDismissed } from '../lib/sheetDismissed'
import { subscribeToLiveEnded } from '../lib/socketClient'
import { useGoLive } from '../lib/useGoLive'
import { useAuth } from '../lib/useAuth'
import { useLatest } from '../lib/useLatest'
import { usePresence } from '../lib/usePresence'
import { ExpiryPrompt } from './ds/ExpiryPrompt'
import { Sheet } from './ds/Sheet'
import { useToast } from './Toast'
import { clockTime } from '../lib/time'

type ActiveLive = { venueDayId: string; expiresAt: string | null; stay: boolean; venueName: string | null }

/** A window that ended: the sheet that asks "Still here?" (or says the room closed) and the place it is about. */
type Ended = { kind: 'ended' | 'reset'; venueDayId: string; venueId: string; venueName: string; visible: boolean; opensAt?: string }

type Tray = { title: string; message: string; buttons: TrayButton[] }

/** A failed read of `/checkins/active` is tried again this soon — it is not "not live" (H1). */
export const LIVE_READ_RETRY_MS = 15_000

/** An end found this long after it happened (the app was away) is old news: no toast for it (review LOW-5). */
export const STALE_END_MS = 10 * 60_000

/** "Reset" is told by the venue day's own end: the window ran out within this long of it. */
const RESET_SLACK_MS = 60_000

const timeOf = (iso: string | null) => (iso ? clockTime(iso) || 'soon' : 'soon')

/** Whether an `expired` end was the venue day resetting (06:00), not the window running out. */
export function endedByReset(session: Pick<LiveSession, 'dayEndsAt'> | null, now: number): boolean {
  const dayEnd = session?.dayEndsAt ? Date.parse(session.dayEndsAt) : NaN
  return Number.isFinite(dayEnd) && now >= dayEnd - RESET_SLACK_MS
}

/** Where the expiry prompt offers no Stay row, only Extend and Done: onboarding, an event's door, a chat, the room. */
const NO_STAY_ROW_PATHS = /^\/(onboarding|chat|private-chat|room|event)(\/|$)/

/**
 * Your Go Live, wherever you are in the app (plan v2 step 5). Mounted at the
 * root beside `PresenceMonitor`, because the window ends whether or not the
 * place screen is open — most likely while you are in its room.
 *
 * - **Pings** the venue day's presence (`usePresence`), which is what carries
 *   a "stay" window on while you are inside, and tells the server you left.
 * - **The expiry prompt** (`ExpiryPrompt`, Flow 11 · 11.4), when a fixed window
 *   has run out, at most once a night: "Your live time at ‹place› is up · Still
 *   here?" — extend 45 minutes for free, stay while you're here, or done for now.
 *   At the 06:00 reset it says the room closed. The warning five minutes
 *   before is the pill's last-5 state (and, later, a local notification).
 * - **`live:ended`**: says what happened (the prompt for `expired`, a toast for
 *   the rest), and tells the tab bar (`checkInChanged`).
 *
 * Only a successful read says you are not live: a failed one keeps what is
 * known and tries again (H1), and an older read that answers last is dropped
 * (H2). Renders nothing until it has something to say.
 */
export function LiveAtVenue() {
  const { showToast } = useToast()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const pathname = usePathname()
  const [active, setActive] = useState<ActiveLive | null>(null)
  const [session, setSession] = useState<LiveSession | null>(null)
  const [tray, setTray] = useState<Tray | null>(null)
  const [ended, setEnded] = useState<Ended | null>(null)
  const closeTray = useCallback(() => setTray(null), [])
  /** The ended sheet away, kept drawn while it leaves (`ended` stays: it is what the sheet is saying). */
  const hideEnded = useCallback(() => setEnded((e) => (e ? { ...e, visible: false } : e)), [])
  const endedRef = useLatest(ended)
  const showTray = useCallback(
    (title: string, message: string, buttons?: TrayButton[]) => {
      const next: Tray = { title, message, buttons: buttons?.length ? buttons : [{ label: 'Done', variant: 'primary', onPress: () => setTray(null) }] }
      // One sheet at a time: iOS drops a modal presented while another is still leaving.
      if (endedRef.current?.visible) {
        hideEnded()
        void afterSheetDismissed().then(() => setTray(next))
      } else setTray(next)
    },
    [hideEnded, endedRef]
  )
  const nameRef = useLatest(active?.venueName ?? session?.venueName ?? null)
  const pathRef = useLatest(pathname)
  /** Which of the prompt's Go Live buttons was pressed: its spinner, not the other's. */
  const [pressed, setPressed] = useState<'extend' | 'stay' | null>(null)
  /** Seen on this run (the prompt's onShown) — before the asking is on disk. */
  const askedRef = useRef(new Set<string>())

  useEffect(() => {
    let cancelled = false
    let seq = 0
    let retry: ReturnType<typeof setTimeout> | null = null
    /** The last window a read showed: if the next read finds nobody live and that one has run out, the end was missed (backgrounded). */
    let last: ActiveLive | null = null
    /** Windows whose end has been said (the prompt or the toast), by day and end: the socket and the read after it say it once. */
    const said = new Set<string>()
    /** A window's key: the venue day and its end, as the last read showed it. None when no read had: nothing to say twice. */
    const windowOf = (eventId: string, expiresAt: string | null | undefined) => (expiresAt ? `${eventId}|${expiresAt}` : null)
    /**
     * A window ran out at `eventId`: ask "Still here?" (or say the room closed), once. Told by the server's `live:ended`
     * and, if the socket was away, by the read that finds the window gone. Only a window this phone started has a place
     * to extend at.
     */
    const askEnded = async (eventId: string, reason: string, remembered: LiveSession | null) => {
      const here = remembered?.venueDayId === eventId ? remembered : null
      const reset = reason === 'expired' && endedByReset(here, Date.now())
      // On the room the room says it itself ("Today's room has closed"); the sheet would say it twice.
      const inRoom = pathRef.current?.startsWith('/chat') === true
      const askKey = `${reset ? 'reset' : 'ended'}:${eventId}`
      const ask = reason === 'expired' && here !== null && !askedRef.current.has(askKey) && (reset ? !inRoom : !here.prompted)
      if (!ask || !here) return { asked: false, reset, inRoom }
      const resetHour = resetHourOf(here)
      // Tonight's one prompt is spent when it is on screen (`onShown` below), not when it is asked for: a prompt that
      // waited for another sheet and was withdrawn, or that iOS refused, was never seen (review MED-2).
      if (!cancelled) setEnded({ kind: reset ? 'reset' : 'ended', venueDayId: eventId, venueId: here.venueId, venueName: here.venueName, visible: true, opensAt: reset && resetHour !== null ? opensAtWords(resetHour) : undefined })
      return { asked: true, reset, inRoom }
    }
    /**
     * The end, said once: "Still here?" the first time a night (by design, PLACEHOLDER_SCREENS §11 "Once a night"), and
     * after that the toast "You're no longer live at ‹place›." — whether the socket told this phone or a read found it.
     * A read used to say nothing at all for a window it found over after the night's one prompt (RC drive 4 D-8).
     */
    const sayEnded = async (eventId: string, reason: string, remembered: LiveSession | null, window: string | null, endedAt: string | null = null) => {
      if (window && said.has(window)) return
      if (window) said.add(window)
      const asked = await askEnded(eventId, reason, remembered)
      if (asked.asked || cancelled) return
      if (endedAt && serverNow() - Date.parse(endedAt) > STALE_END_MS) return
      const message = liveEndedMessage(reason, nameRef.current ?? remembered?.venueName ?? null)
      if (message && !(asked.reset && asked.inRoom)) showToast(message, 'info')
    }
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
          // Not "not live": keep the window and the pings, and ask again (H1).
          retry = setTimeout(() => void read(), LIVE_READ_RETRY_MS)
          return
        }
        const live = res.data.checkIns?.find((c) => c.kind === 'venue_day')
        const next = live
          ? { venueDayId: live.eventId, expiresAt: live.expiresAt ?? null, stay: live.stay === true, venueName: live.event?.venueName ?? null }
          : null
        setActive(next)
        setSession(remembered)
        const before = last
        last = next
        // The window ran out while the socket was away: `live:ended` never came, and the read is what finds out.
        if (!next && before && !before.stay && before.expiresAt && Date.parse(before.expiresAt) <= serverNow()) {
          void sayEnded(before.venueDayId, 'expired', remembered, windowOf(before.venueDayId, before.expiresAt), before.expiresAt)
        }
        // Live again (an extension, here or elsewhere): "your live time is up" says something false. A read that
        // still shows the window that just ended (it lands beside the end) is not that.
        const liveAgain = next && (next.stay || !next.expiresAt || Date.parse(next.expiresAt) > serverNow())
        if (liveAgain) setEnded((e) => (e?.visible ? { ...e, visible: false } : e))
        if (live && userId && live.event?.endTime) void noteLiveDayEnd(userId, live.eventId, live.event.endTime)
      } catch (error) {
        Logger.debug('presence', 'live read failed', { error: String(error) })
        if (!cancelled && mine === seq) retry = setTimeout(() => void read(), LIVE_READ_RETRY_MS)
      }
    }
    void read()
    const offCheckIn = subscribeCheckInChanged(() => void read())
    const offEnded = subscribeToLiveEnded((data) => {
      void (async () => {
        const window = windowOf(data.eventId, last?.venueDayId === data.eventId ? last.expiresAt : null)
        await sayEnded(data.eventId, data.reason, await readLiveSession(userId), window)
        // The tab bar and every cached "are you in" read; this re-reads too, through the listener.
        checkInChanged(data.eventId)
      })()
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
  }, [userId, nameRef, pathRef, showToast])

  const venueDayId = active?.venueDayId ?? null
  const presence = usePresence(venueDayId)
  // The server said the window is over on a ping: everything that shows it re-reads.
  useEffect(() => {
    if (presence.finished && venueDayId) checkInChanged(venueDayId)
  }, [presence.finished, venueDayId])

  // The place this phone went live at — needed to extend (the active check-in names the day, not the venue). After the end it is what the sheet says.
  const mine = active && session?.venueDayId === active.venueDayId ? session : null
  const place = mine
    ? { id: mine.venueId, name: mine.venueName, latitude: null, longitude: null }
    : ended
      ? { id: ended.venueId, name: ended.venueName, latitude: null, longitude: null }
      : null

  const { goLive, busy } = useGoLive({
    place,
    showTray,
    closeTray: () => {
      closeTray()
      hideEnded()
    },
    onLive: (result) => {
      showToast(result.stay ? "You’re live for as long as you’re here" : `You’re live until ${timeOf(result.expiresAt)}`, 'success')
    },
  })

  const goLiveWith = (choice: GoLiveChoice, which: 'extend' | 'stay') => () => {
    setPressed(which)
    void goLive(choice)
      .then((ok) => {
        if (ok) hideEnded()
      })
      .finally(() => setPressed(null))
  }

  /** The Stay row, once a window has run out: none at the 06:00 reset, nor over a chat, the room or an event's door. */
  const stayRow =
    ended?.kind === 'ended' && !isBlendnOpen() && !NO_STAY_ROW_PATHS.test(pathname ?? '') ? { onPress: goLiveWith(STAY_CHOICE, 'stay') } : undefined

  /*
   * The tray (a location refusal, a weak fix) holds what it last said while it slides out, so closing does not blank its
   * final frames. Held by what it says (the words and how many buttons), not by identity: `tray` is a new object each time.
   */
  const sig = tray ? `${tray.title}|${tray.message}|${tray.buttons.length}` : null
  const [held, setHeld] = useState<{ sig: string; content: Tray } | null>(null)
  if (tray && sig && held?.sig !== sig) setHeld({ sig, content: tray })
  const current = tray ?? held?.content ?? null

  return (
    <>
      <ExpiryPrompt
        kind={ended?.kind ?? 'ended'}
        visible={ended?.visible === true}
        venue={ended?.venueName ?? ''}
        onExtend={goLiveWith(EXTEND_CHOICE, 'extend')}
        stay={stayRow}
        opensAt={ended?.opensAt}
        extending={busy && pressed === 'extend'}
        staying={busy && pressed === 'stay'}
        onDone={hideEnded}
        onShown={() => {
          if (!ended) return
          // Asked on this run once it is seen: a prompt withdrawn unseen (it waited, iOS refused it) can be asked again (review LOW).
          askedRef.current.add(`${ended.kind}:${ended.venueDayId}`)
          if (userId && ended.kind === 'ended') void markLivePrompted(userId, ended.venueDayId)
        }}
      />
      <Sheet
        visible={tray !== null}
        onClose={closeTray}
        title={current?.title ?? ''}
        body={current?.message}
        testID="live-sheet"
        actions={(current?.buttons ?? []).map((b) => ({
          label: b.label,
          kind: trayKind(b),
          loading: b.loading,
          disabled: b.disabled,
          onPress: b.onPress,
        }))}
      />
    </>
  )
}

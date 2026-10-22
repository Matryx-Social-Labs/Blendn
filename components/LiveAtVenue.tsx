import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { usePathname } from 'expo-router'

import { apiClient } from '../lib/apiClient'
import { isBlendnOpen } from '../lib/blendnOverlay'
import { checkInChanged, subscribeCheckInChanged } from '../lib/checkIn'
import {
  EXTEND_CHOICE,
  hasGoneLiveBefore,
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
import { openTonight, subscribePaywallClosed } from '../lib/paywall'
import { isQuietSurface } from '../lib/paywallPolicy'
import { notifyPlusChanged, usePlusStatus } from '../lib/plus'
import { serverNow } from '../lib/serverClock'
import { afterSheetDismissed } from '../lib/sheetDismissed'
import { subscribeToLiveEnded } from '../lib/socketClient'
import { lowestPrice } from '../lib/tonight'
import { loadPlusOffers } from '../lib/purchases'
import { useGoLive } from '../lib/useGoLive'
import { useAuth } from '../lib/useAuth'
import { useLatest } from '../lib/useLatest'
import { usePresence } from '../lib/usePresence'
import { ExpiryPrompt } from './ds/ExpiryPrompt'
import { Sheet } from './ds/Sheet'
import { TonightHost } from './plus/TonightHost'
import { useToast } from './Toast'

type ActiveLive = { venueDayId: string; expiresAt: string | null; stay: boolean; venueName: string | null }

/** A window that ended: the sheet that asks "Still here?" (or says the room closed) and the place it is about. */
type Ended = { kind: 'ended' | 'reset'; venueDayId: string; venueId: string; venueName: string; visible: boolean; firstGoLive: boolean }

type Tray = { title: string; message: string; buttons: TrayButton[] }

/** A failed read of `/checkins/active` is tried again this soon — it is not "not live" (H1). */
export const LIVE_READ_RETRY_MS = 15_000

/** "Reset" is told by the venue day's own end: the window ran out within this long of it. */
const RESET_SLACK_MS = 60_000

const timeOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'soon'

/** Whether an `expired` end was the venue day resetting (06:00), not the window running out. */
export function endedByReset(session: Pick<LiveSession, 'dayEndsAt'> | null, now: number): boolean {
  const dayEnd = session?.dayEndsAt ? Date.parse(session.dayEndsAt) : NaN
  return Number.isFinite(dayEnd) && now >= dayEnd - RESET_SLACK_MS
}

/**
 * Your Go Live, wherever you are in the app (plan v2 step 5). Mounted at the
 * root beside `PresenceMonitor`, because the window ends whether or not the
 * place screen is open — most likely while you are in its room.
 *
 * - **Pings** the venue day's presence (`usePresence`), which is what carries
 *   a "stay" window on while you are inside, and tells the server you left.
 * - **The expiry prompt** (`ExpiryPrompt`, Flow 11 · 11.4), when a fixed window
 *   has run out, at most once a night: "Your live time at ‹place› is up · Still
 *   here?" — extend 45 minutes for free, stay while you're here (Blendn+'s
 *   where the server gates it: the row opens the Tonight sheet, never the
 *   paywall page, and never on a person's first Go Live), or done for now.
 *   At the 06:00 reset it says the room closed. The warning five minutes
 *   before is the pill's last-5 state (and, later, a local notification).
 * - **`live:ended`**: says what happened (the prompt for `expired`, a toast for
 *   the rest), and tells the tab bar (`checkInChanged`).
 * - **The Tonight sheet** (`TonightHost`): drawn here, once, for every lock.
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
  /** What the store would charge least: "from ₹49" on the Stay row. Null until the store has said. */
  const [from, setFrom] = useState<string | null>(null)
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
  const { status: plus } = usePlusStatus()
  /** Which of the prompt's Go Live buttons was pressed: its spinner, not the other's. */
  const [pressed, setPressed] = useState<'extend' | 'stay' | null>(null)
  /** Asked on this run — before the asking is on disk. */
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
        const remembered = await readLiveSession(userId)
        const here = remembered?.venueDayId === data.eventId ? remembered : null
        const reset = data.reason === 'expired' && endedByReset(here, Date.now())
        // On the room the room says it itself ("Today's room has closed"); the sheet would say it twice.
        const inRoom = pathRef.current?.startsWith('/chat') === true
        const askKey = `${reset ? 'reset' : 'ended'}:${data.eventId}`
        const ask = data.reason === 'expired' && here && !askedRef.current.has(askKey) && (reset ? !inRoom : !here.prompted)
        if (ask && here) {
          askedRef.current.add(askKey)
          const firstGoLive = userId ? !(await hasGoneLiveBefore(userId, data.eventId)) : true
          if (!cancelled) setEnded({ kind: reset ? 'reset' : 'ended', venueDayId: data.eventId, venueId: here.venueId, venueName: here.venueName, visible: true, firstGoLive })
          if (userId && !reset) void markLivePrompted(userId, data.eventId)
        } else {
          const message = liveEndedMessage(data.reason, nameRef.current)
          if (message && !(reset && inRoom)) showToast(message, 'info')
        }
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

  /*
   * "Stay" refused as Blendn+'s (a stale status): the Tonight sheet opens for it,
   * and the ended sheet comes back after it unless something was done there —
   * declining Plus must not cost the free extension for the night.
   */
  const reshowAfterTonight = useCallback(() => {
    const off = subscribePaywallClosed((how) => {
      off()
      if (how === 'dismissed') setEnded((e) => (e ? { ...e, visible: true } : e))
    })
  }, [])
  const onPlusRequired = useCallback(
    (paywallOpened: boolean) => {
      // The server refused what the status said was free: the status is stale, so everything that reads it re-reads now.
      notifyPlusChanged()
      if (!paywallOpened) return setEnded((e) => (e ? { ...e, visible: true } : e))
      reshowAfterTonight()
    },
    [reshowAfterTonight]
  )
  const { goLive, busy } = useGoLive({
    place,
    showTray,
    closeTray: () => {
      closeTray()
      hideEnded()
    },
    onPlusRequired,
    onLive: (result) =>
      showToast(result.stay ? "You're live for as long as you're here" : `You're live until ${timeOf(result.expiresAt)}`, 'success'),
  })

  const goLiveWith = (choice: GoLiveChoice, which: 'extend' | 'stay') => () => {
    setPressed(which)
    void goLive(choice)
      .then((ok) => {
        if (ok) hideEnded()
      })
      .finally(() => setPressed(null))
  }

  /** Blendn+ is sold to this person (their city is gated, they have none): Stay is the Tonight sheet's, not the server's. */
  const sold = plus?.gated === true && !plus.active
  // The store's lowest price, only when the row would show it: once the prompt is up and Plus is for sale.
  const wantsPrice = sold && ended?.kind === 'ended' && ended.visible
  useEffect(() => {
    if (!wantsPrice) return
    let cancelled = false
    void loadPlusOffers()
      .then((offers) => !cancelled && setFrom(lowestPrice(offers)))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [wantsPrice])

  /**
   * The row: Blendn+'s with a price from the store; plain "Stay" where staying is free; none where Plus is sold but the
   * store has no price to name, and none over a chat or the room (never a paywall there, MN-CU01): Extend and Done only.
   */
  const stayRow = (() => {
    if (!ended || ended.kind !== 'ended' || isQuietSurface(pathname, isBlendnOpen())) return undefined
    if (!sold) return { onPress: goLiveWith(STAY_CHOICE, 'stay') }
    if (!from) return undefined
    return {
      from,
      onPress: () => {
        const e = endedRef.current
        if (!e) return
        hideEnded()
        void afterSheetDismissed().then(() => {
          reshowAfterTonight()
          void openTonight(
            { trigger: 'expiry', venue: e.venueName, onFree: () => void goLive(EXTEND_CHOICE), onUnlocked: () => void goLive(STAY_CHOICE) },
            { userInitiated: true }
          )
        })
      },
    }
  })()

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
        plus={stayRow}
        firstGoLiveTonight={ended?.firstGoLive ?? true}
        extending={busy && pressed === 'extend'}
        staying={busy && pressed === 'stay'}
        onDone={hideEnded}
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
      <TonightHost />
    </>
  )
}

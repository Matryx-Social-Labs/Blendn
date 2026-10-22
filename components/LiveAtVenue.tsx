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
import type { TrayButton } from '../lib/locationFix'
import { trayKind } from '../lib/sheet'
import { subscribePaywallClosed } from '../lib/paywall'
import { usePlusStatus } from '../lib/plus'
import { serverNow } from '../lib/serverClock'
import { subscribeToLiveEnded } from '../lib/socketClient'
import { useGoLive } from '../lib/useGoLive'
import { useAuth } from '../lib/useAuth'
import { useLatest } from '../lib/useLatest'
import { usePresence } from '../lib/usePresence'
import { Sheet } from './ds/Sheet'
import { useToast } from './Toast'
import { clockTime } from '../lib/time'

type ActiveLive = { venueDayId: string; expiresAt: string | null; stay: boolean; venueName: string | null }

type Tray =
  | { kind: 'prompt'; venueDayId: string; expiresAt: string | null; venueName: string; noStay?: boolean }
  | { kind: 'other'; title: string; message: string; buttons: TrayButton[] }

/** A failed read of `/checkins/active` is tried again this soon — it is not "not live" (H1). */
export const LIVE_READ_RETRY_MS = 15_000

const timeOf = (iso: string | null) => (iso ? clockTime(iso) || 'soon' : 'soon')

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
    (title: string, message: string, buttons?: TrayButton[]) =>
      setTray({ kind: 'other', title, message, buttons: buttons?.length ? buttons : [{ label: 'Done', variant: 'primary', onPress: () => setTray(null) }] }),
    []
  )
  const nameRef = useLatest(active?.venueName ?? session?.venueName ?? null)
  const { status: plus } = usePlusStatus()
  /** Which of the prompt's two Go Live buttons was pressed: its spinner, not the other's. */
  const [pressed, setPressed] = useState<'extend' | 'stay' | null>(null)
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
  /*
   * "Stay" refused as Blendn+'s: the prompt comes back WITHOUT Stay, so the
   * free Extend is still a tap away — at once if the paywall did not open, or
   * as soon as it closes if it did (review: declining Plus must not cost the
   * free extension for the night).
   */
  const promptRef = useLatest(active && mine ? { venueDayId: active.venueDayId, expiresAt: active.expiresAt, venueName: mine.venueName } : null)
  const onPlusRequired = useCallback(
    (paywallOpened: boolean) => {
      const prompt = promptRef.current
      if (!prompt) return
      const reshow = () => setTray({ kind: 'prompt', ...prompt, noStay: true })
      if (!paywallOpened) return reshow()
      const off = subscribePaywallClosed(() => {
        off()
        reshow()
      })
    },
    [promptRef]
  )
  const { goLive, busy } = useGoLive({
    place,
    showTray,
    closeTray,
    onPlusRequired,
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

  const goLiveWith = (choice: GoLiveChoice, which: 'extend' | 'stay') => () => {
    setPressed(which)
    void goLive(choice)
      .then((ok) => {
        if (ok) setTray((t) => (t?.kind === 'prompt' ? null : t))
      })
      .finally(() => setPressed(null))
  }

  // "· Blendn+" only where it is sold and you don't have it: in a launch season, or to a holder, staying is just staying.
  const stayLabel = plus?.gated && !plus.active ? 'Stay live till I leave · Blendn+' : 'Stay live till I leave'
  const visible: { title: string; message: string; buttons: TrayButton[] } | null =
    tray?.kind === 'prompt'
      ? {
          title: `Still at ${tray.venueName}?`,
          message: tray.noStay
            ? `Staying live is part of Blendn+ here. You stop being live at ${timeOf(tray.expiresAt)} — extend for free?`
            : `You stop being live at ${timeOf(tray.expiresAt)}.`,
          buttons: [
            {
              label: 'Extend 45 min · free',
              variant: 'primary',
              onPress: goLiveWith(EXTEND_CHOICE, 'extend'),
              loading: busy && pressed === 'extend',
              disabled: busy,
            },
            // Blendn+ where the server gates it (PLUS_REQUIRED → the paywall); everyone's in launch season.
            ...(tray.noStay
              ? []
              : [{ label: stayLabel, onPress: goLiveWith(STAY_CHOICE, 'stay'), loading: busy && pressed === 'stay', disabled: busy }]),
            { label: 'Let it end', kind: 'tertiary', onPress: closeTray, disabled: busy },
          ],
        }
      : tray

  /*
   * The last sheet stays drawn while it slides out, so closing does not blank its final frames. Held by what it says
   * (the words and how many buttons), not by identity: `visible` is a new object every render.
   */
  const sig = visible ? `${visible.title}|${visible.message}|${visible.buttons.length}` : null
  const [held, setHeld] = useState<{ sig: string; content: NonNullable<typeof visible> } | null>(null)
  if (visible && sig && held?.sig !== sig) setHeld({ sig, content: visible })
  const current = visible ?? held?.content ?? null

  return (
    <Sheet
      visible={visible !== null}
      onClose={closeTray}
      icon={tray?.kind === 'prompt' ? 'hourglass' : undefined}
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
  )
}

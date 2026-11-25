import { useEffect, useRef, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import * as Location from 'expo-location'

import { apiClient, type PresencePing } from './apiClient'
import { validAccuracy } from './geo'
import { LOCATION_FIX_TIMEOUT_MS, withDeadline } from './locationFix'
import { Logger } from './logger'
import { FIX_REUSE } from './useFixRefresh'

/**
 * Keep the organiser's live occupancy number honest.
 *
 * ## The bug this closes
 *
 * Check-in was a one-shot gate. It proved you were at the venue once and
 * nothing ever revisited the claim, so anyone who left without pressing "check
 * out" stayed counted for the rest of the night. Occupancy climbed all evening
 * and never fell, on the screen an organiser uses to decide whether to open a
 * second bar or hold the door.
 *
 * The endpoint has existed since API v0.42.0 and nothing has ever called it.
 *
 * ## Rules
 *
 * **The server judges.** We send coordinates; it decides inside, outside, or
 * gone. Reimplementing the geofence here would give two answers to one
 * question, and the client's is the one an attacker controls.
 *
 * **Stop when told.** `checked_out` and `not_checked_in` are terminal: the
 * sweeper or the user has already ended it, and continuing to ping asserts a
 * presence that is over.
 *
 * **Pause in the background.** iOS suspends timers anyway, and a ping fired on
 * resume with a stale fix would claim presence at a place and time that have
 * both passed. Better to skip a beat and send fresh truth.
 *
 * **Never block the UI.** Location or network failure just means no ping this
 * tick. Silence never checks anybody out; the presence sweeper closes the
 * check-in at the event's end + 60 minutes.
 */

/** Fallback if the server does not say. It always does; this is belt and braces. */
const DEFAULT_INTERVAL_SECONDS = 300
/** The floor under the server's `nextPingInSeconds`: a bad value must not spin the GPS. */
const MIN_INTERVAL_SECONDS = 60

const intervalOf = (seconds: number | undefined) =>
  typeof seconds === 'number' && Number.isFinite(seconds) ? Math.max(MIN_INTERVAL_SECONDS, seconds) : DEFAULT_INTERVAL_SECONDS

const IDLE: PresenceStatus = { state: 'idle', reason: null, shortfallMetres: null, finished: false }

export interface PresenceStatus {
  state: PresencePing['status'] | 'idle'
  /** The server's why (`left_area`, `grace_expired`, `occurrence_ended`…), for what to say about it. */
  reason: string | null
  shortfallMetres: number | null
  /** True once the server says this check-in is over, so callers can stop asking. */
  finished: boolean
}

/** `checkInId`, when known, restarts the loop for a new check-in at the same event (one that ended stops it for good). */
export function usePresence(eventId: string | null | undefined, checkInId?: string): PresenceStatus {
  const [status, setStatus] = useState<PresenceStatus>(IDLE)
  // A new check-in starts from nothing: "finished" was about the last one (M9).
  const statusKey = `${eventId ?? ''}|${checkInId ?? ''}`
  const [statusFor, setStatusFor] = useState(statusKey)
  if (statusFor !== statusKey) {
    setStatusFor(statusKey)
    setStatus(IDLE)
  }

  // Refs, not state: changing these must not re-run the effect and restart the
  // timer, which would reset the interval on every ping.
  const stopped = useRef(false)
  const appState = useRef<AppStateStatus>(AppState.currentState)

  useEffect(() => {
    if (!eventId) return

    stopped.current = false
    // What the app is doing now, not when the last loop ended (it may have gone to the background with no loop running).
    appState.current = AppState.currentState
    let cancelled = false
    // Effect-local: a late ping from the last event must not clear this one's timer.
    let timer: ReturnType<typeof setTimeout> | null = null
    // One ping at a time: a return to the app while one waits for its fix must not send a second.
    let busy = false

    const clear = () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    }

    const schedule = (seconds: number) => {
      if (cancelled || stopped.current) return
      clear()
      timer = setTimeout(ping, seconds * 1000)
    }

    const ping = async () => {
      if (cancelled || stopped.current || busy) return

      // Backgrounded: skip this tick rather than send a stale fix. Resuming
      // reschedules from the AppState listener below.
      if (appState.current !== 'active') {
        schedule(DEFAULT_INTERVAL_SECONDS)
        return
      }

      busy = true
      try {
        const permission = await withDeadline(Location.getForegroundPermissionsAsync(), LOCATION_FIX_TIMEOUT_MS)
        if (!permission.granted) {
          // Without location we cannot prove presence. Ask again next tick
          // rather than never: permission can be granted in Settings while the
          // check-in is still open (M9). The sweeper ends it if it never is.
          Logger.info('presence', 'Location permission not granted, skipping this ping')
          schedule(DEFAULT_INTERVAL_SECONDS)
          return
        }

        // The Pulse's budget (`FIX_REUSE`): a last-known fix ≤ 2 min / 150 m first, else one Balanced ask, both capped.
        const position =
          (await withDeadline(Location.getLastKnownPositionAsync(FIX_REUSE), LOCATION_FIX_TIMEOUT_MS).catch(() => null)) ??
          (await withDeadline(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), LOCATION_FIX_TIMEOUT_MS))

        const result = await apiClient.sendPresencePing(eventId, {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: validAccuracy(position.coords.accuracy),
        })

        if (cancelled) return

        if (!result.success || !result.data) {
          // Not shown to the person; logged, and tried again next tick.
          Logger.warn('presence', 'Ping refused', { error: result.error })
          schedule(DEFAULT_INTERVAL_SECONDS)
          return
        }

        const data = result.data
        const finished = data.status === 'checked_out' || data.status === 'not_checked_in'

        setStatus({
          state: data.status,
          reason: data.reason ?? null,
          shortfallMetres: data.shortfallMetres ?? null,
          finished,
        })

        if (finished) {
          // Terminal. The check-in is over; asserting presence past this point
          // would be a lie the organiser's number believes.
          stopped.current = true
          clear()
          return
        }

        schedule(intervalOf(data.nextPingInSeconds))
      } catch (error) {
        if (cancelled) return
        Logger.warn('presence', 'Ping failed', { error: String(error) })
        schedule(DEFAULT_INTERVAL_SECONDS)
      } finally {
        busy = false
      }
    }

    const onAppStateChange = (next: AppStateStatus) => {
      const wasActive = appState.current === 'active'
      appState.current = next
      // Coming back to the foreground: ping now rather than waiting out the
      // remainder of a timer that iOS probably suspended anyway.
      if (!wasActive && next === 'active' && !stopped.current) {
        void ping()
      }
    }

    const subscription = AppState.addEventListener('change', onAppStateChange)

    // First ping immediately: the interesting case is someone who checked in
    // and walked straight back out.
    void ping()

    return () => {
      cancelled = true
      clear()
      subscription.remove()
    }
  }, [eventId, checkInId])

  return status
}

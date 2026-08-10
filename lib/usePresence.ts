import { useEffect, useRef, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import * as Location from 'expo-location'

import { apiClient, type PresencePing } from './apiClient'
import { Logger } from './logger'

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
 * tick. The sweeper checks people out who go quiet, so the number self-heals.
 */

/** Fallback if the server does not say. It always does; this is belt and braces. */
const DEFAULT_INTERVAL_SECONDS = 300

export interface PresenceStatus {
  state: PresencePing['status'] | 'idle'
  shortfallMetres: number | null
  /** True once the server says this check-in is over, so callers can stop asking. */
  finished: boolean
}

export function usePresence(eventId: string | null | undefined): PresenceStatus {
  const [status, setStatus] = useState<PresenceStatus>({
    state: 'idle',
    shortfallMetres: null,
    finished: false,
  })

  // Refs, not state: changing these must not re-run the effect and restart the
  // timer, which would reset the interval on every ping.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopped = useRef(false)
  const appState = useRef<AppStateStatus>(AppState.currentState)

  useEffect(() => {
    if (!eventId) return

    stopped.current = false
    let cancelled = false

    const clear = () => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
    }

    const schedule = (seconds: number) => {
      clear()
      if (cancelled || stopped.current) return
      timer.current = setTimeout(ping, seconds * 1000)
    }

    const ping = async () => {
      if (cancelled || stopped.current) return

      // Backgrounded: skip this tick rather than send a stale fix. Resuming
      // reschedules from the AppState listener below.
      if (appState.current !== 'active') {
        schedule(DEFAULT_INTERVAL_SECONDS)
        return
      }

      try {
        const permission = await Location.getForegroundPermissionsAsync()
        if (!permission.granted) {
          // Without location we cannot prove presence. The sweeper will check
          // them out, which is the correct outcome, so stop rather than spin.
          Logger.info('presence', 'Location permission not granted, stopping pings')
          stopped.current = true
          return
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        })

        const result = await apiClient.sendPresencePing(eventId, {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy ?? null,
        })

        if (cancelled) return

        if (!result.success || !result.data) {
          // A failed ping is not an error worth surfacing. Try again next tick.
          schedule(DEFAULT_INTERVAL_SECONDS)
          return
        }

        const data = result.data
        const finished = data.status === 'checked_out' || data.status === 'not_checked_in'

        setStatus({
          state: data.status,
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

        schedule(data.nextPingInSeconds ?? DEFAULT_INTERVAL_SECONDS)
      } catch (error) {
        if (cancelled) return
        Logger.warn('presence', 'Ping failed', { error: String(error) })
        schedule(DEFAULT_INTERVAL_SECONDS)
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
  }, [eventId])

  return status
}

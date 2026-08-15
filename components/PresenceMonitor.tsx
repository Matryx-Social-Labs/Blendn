import * as Location from 'expo-location'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'

import { apiClient } from '../lib/apiClient'
import { getDistanceMetres } from '../lib/geo'
import { Logger } from '../lib/logger'
import {
  PRESENCE_COPY,
  SAMPLE_INTERVAL_MS,
  presenceAction,
  trimSamples,
  type PresenceSample,
} from '../lib/presence'
import ActionTray from './ActionTray'

interface Fence {
  eventId: string
  latitude: number
  longitude: number
  radiusM: number
}

/**
 * Checks somebody out when they have actually left, and almost never otherwise.
 *
 * `lib/presence.ts` has held this policy — with tests — since it was written,
 * and nothing ran it. The geofence was enforced once, at check-in, and after
 * that a person who went home stayed on the roster and in the match pool for the
 * rest of the night.
 *
 * ## Everything here is biased toward doing nothing
 *
 * A stale check-in is mildly wrong: the count is a few too high. A false
 * check-out removes somebody **standing in the venue** from the room and the
 * chat because their phone lost GPS in a basement. Those are not close, so the
 * policy needs six readings across ten minutes before it will even ask, and half
 * an hour of continued absence after a human says "I'm still here" before it
 * overrides them.
 *
 * The most important rule is in `presenceAction` rather than here: **no fix is
 * not the same as outside.** A phone that cannot see satellites is a phone in a
 * building, which is where the event is.
 *
 * ## Foreground only, and mounted at the root
 *
 * No background location. That needs iOS's *always* permission — an App Review
 * liability, a battery cost people notice — and it buys least exactly where a
 * false eviction is least recoverable, because nobody is looking at the phone to
 * say "no, I'm still here". Someone who leaves and never reopens the app is
 * checked out when the event ends, by the chat lifecycle sweeper.
 *
 * Mounted at the root rather than inside The Room, because leaving the venue
 * should be noticed whether or not the room happens to be the screen you have
 * open. It renders nothing until it has something to ask.
 */
export function PresenceMonitor() {
  const [fence, setFence] = useState<Fence | null>(null)
  const [asking, setAsking] = useState(false)
  const [autoNotice, setAutoNotice] = useState(false)

  const samplesRef = useRef<PresenceSample[]>([])
  const saidStillHereAtRef = useRef<number | null>(null)
  /*
   * Guards the prompt against the timer.
   *
   * Once asked, further ticks must not re-open the tray underneath the answer
   * somebody is in the middle of giving. `presenceAction` would keep returning
   * `'ask'` for as long as the run continues, which is correct of it — the
   * decision is stateless and the "have we asked" part belongs here.
   */
  const askingRef = useRef(false)

  /*
   * Which room, and how big its fence is.
   *
   * Two calls, because `/checkins/active` returns the event's title and cover
   * but not its coordinates or radius — a shape that made sense when nothing
   * needed the geometry after check-in.
   */
  const loadFence = useCallback(async () => {
    try {
      const active = await apiClient.getActiveCheckins({ force: true })
      const checkIn = active.success ? active.data?.checkIns?.[0] : null
      if (!checkIn?.eventId) {
        setFence(null)
        return
      }

      const event = await apiClient.getEvent(checkIn.eventId)
      const data = event.data as
        | { latitude?: number | null; longitude?: number | null; checkInRadius?: number | null }
        | undefined
      if (
        !event.success ||
        typeof data?.latitude !== 'number' ||
        typeof data?.longitude !== 'number'
      ) {
        // An event without coordinates cannot be geofenced, and inventing a
        // centre would evict on the first reading. Online events land here.
        setFence(null)
        return
      }

      setFence({
        eventId: checkIn.eventId,
        latitude: data.latitude,
        longitude: data.longitude,
        radiusM: typeof data.checkInRadius === 'number' ? data.checkInRadius : 100,
      })
    } catch (e) {
      Logger.warn('presence', 'could not resolve the fence', { error: e })
      setFence(null)
    }
  }, [])

  useEffect(() => {
    void loadFence()
    /*
     * Re-resolve on foreground.
     *
     * Check-in and check-out both happen on other screens, and a monitor that
     * only looked once would keep watching a room somebody had left or ignore
     * one they had just joined.
     */
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void loadFence()
    })
    return () => sub.remove()
  }, [loadFence])

  const checkOut = useCallback(
    async (eventId: string, automatic: boolean) => {
      try {
        await apiClient.checkOut(eventId)
      } catch (e) {
        Logger.error('presence', 'check-out failed', { error: e })
      }
      samplesRef.current = []
      saidStillHereAtRef.current = null
      setFence(null)
      // Never silent. Somebody finding themselves out of the chat with no
      // explanation and no idea how to get back is the worst version of this.
      if (automatic) setAutoNotice(true)
    },
    []
  )

  useEffect(() => {
    if (!fence) {
      samplesRef.current = []
      saidStillHereAtRef.current = null
      askingRef.current = false
      return
    }

    let cancelled = false

    const tick = async () => {
      // Foreground only, and this is the check that enforces it. A timer can
      // still fire during the moment an app is going to sleep.
      if (cancelled || AppState.currentState !== 'active') return

      const now = Date.now()
      let distanceM: number | null = null
      try {
        const { status } = await Location.getForegroundPermissionsAsync()
        if (status === 'granted') {
          const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          })
          distanceM = getDistanceMetres(
            position.coords.latitude,
            position.coords.longitude,
            fence.latitude,
            fence.longitude
          )
        }
      } catch {
        /*
         * A failed fix is a `null` sample, not a skipped one.
         *
         * Recording it matters: `presenceAction` breaks a run of outside
         * readings on a null rather than extending it, so a phone losing signal
         * *stops* the clock toward eviction. Skipping the sample entirely would
         * leave the previous outside readings adjacent to the next one and let
         * a basement look like a walk home.
         */
      }

      if (cancelled) return
      samplesRef.current = trimSamples([...samplesRef.current, { at: now, distanceM }], now)

      const action = presenceAction({
        samples: samplesRef.current,
        now,
        fenceRadiusM: fence.radiusM,
        saidStillHereAt: saidStillHereAtRef.current,
      })

      if (action === 'ask' && !askingRef.current) {
        askingRef.current = true
        setAsking(true)
      } else if (action === 'checkOut') {
        askingRef.current = false
        setAsking(false)
        await checkOut(fence.eventId, true)
      }
    }

    void tick()
    const id = setInterval(() => void tick(), SAMPLE_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [fence, checkOut])

  return (
    <>
      <ActionTray
        visible={asking}
        title={PRESENCE_COPY.ask.title}
        message={PRESENCE_COPY.ask.body}
        // Not dismissible. Tapping the backdrop to make it go away would read as
        // "I'm still here" while recording nothing, so the reprieve would never
        // start and the same prompt would return two minutes later.
        dismissible={false}
        onClose={() => {}}
        buttons={[
          {
            label: PRESENCE_COPY.ask.stay,
            variant: 'primary',
            onPress: () => {
              saidStillHereAtRef.current = Date.now()
              askingRef.current = false
              setAsking(false)
            },
          },
          {
            label: PRESENCE_COPY.ask.leave,
            variant: 'secondary',
            onPress: () => {
              askingRef.current = false
              setAsking(false)
              // Not automatic: they said so, so they do not need telling.
              if (fence) void checkOut(fence.eventId, false)
            },
          },
        ]}
      />

      <ActionTray
        visible={autoNotice}
        title={PRESENCE_COPY.autoCheckedOut.title}
        message={PRESENCE_COPY.autoCheckedOut.body}
        onClose={() => setAutoNotice(false)}
        buttons={[
          { label: 'Got it', variant: 'primary', onPress: () => setAutoNotice(false) },
        ]}
      />
    </>
  )
}

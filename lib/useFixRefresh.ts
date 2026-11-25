import * as Location from 'expo-location'
import { useCallback, useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { getDistanceKm } from './geo'
import { LOCATION_FIX_TIMEOUT_MS, withDeadline } from './locationFix'
import { Logger } from './logger'
import { fixOf, type PreciseFix } from './roomButton'
import { useLatest } from './useLatest'

/**
 * The foreground budget (launch research r-background-presence §4): one Balanced ask at most every five minutes, a
 * last-known fix up to two minutes old and 150 m reused first, a 15 s cap, never a continuous watch. Five minutes keeps
 * the map's "Last seen" (ten, `STALE_AFTER_MS`) from ever showing while the Pulse is open.
 */
export const FIX_REFRESH_MS = 5 * 60_000
export const FIX_REUSE = { maxAge: 120_000, requiredAccuracy: 150 } as const
/** A return to the app this soon after a fix asks nothing (a notification shade pulled down and back). */
export const FIX_RETURN_DEBOUNCE_MS = 10_000
/** What the feed is keyed on moves only past this (m): a phone standing still never refetches, resets a page or scrolls. */
export const PLACE_MOVE_M = 150

/** The data key: the same object until the fix has really moved, so every read keyed on it stays put. */
export const keepPlace = (current: PreciseFix | null, next: PreciseFix): PreciseFix =>
  current && getDistanceKm(current.latitude, current.longitude, next.latitude, next.longitude) * 1000 < PLACE_MOVE_M ? current : next

/**
 * The Pulse's own fix, kept current while the app is in front of you (SCRUM-1324).
 *
 * It was read once at mount; a return to the app read the last-known position and kept the OLD fix when the new one was
 * within a kilometre, so its time never moved and the map's "Last seen here N min ago · updating" counted up for ever.
 *
 * Now one ask at mount, one on every return (unless a fix landed in the last 10 s), and every `FIX_REFRESH_MS` while
 * `periodic` (the Pulse on screen with sharing on; off, no periodic ask at all). Every fix goes through the one `ask`:
 * one at a time (an ask while one is pending is skipped), the permission read just before the fix (so nothing is applied
 * after a refusal), and a position older than the last applied one dropped. A failed or hung ask keeps the fix before
 * (the map says how old it is) and the next ask tries again. Foreground only: no background location.
 *
 * Returns `ask`, for the paths that want a fix now ("my location" once the OS has said yes).
 */
export function useFixRefresh(
  periodic: boolean,
  on: { permission: (status: string) => void; fix: (fix: PreciseFix) => void }
): () => Promise<void> {
  const onRef = useLatest(on)
  const pending = useRef(false)
  const lastAt = useRef(0)
  const mounted = useRef(true)

  const ask = useCallback(async () => {
    if (pending.current) return
    pending.current = true
    try {
      const { status } = await withDeadline(Location.getForegroundPermissionsAsync(), LOCATION_FIX_TIMEOUT_MS)
      if (!mounted.current) return
      onRef.current.permission(status)
      if (status !== 'granted') return
      const last = await withDeadline(Location.getLastKnownPositionAsync(FIX_REUSE), LOCATION_FIX_TIMEOUT_MS).catch(() => null)
      const position =
        last ?? (await withDeadline(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), LOCATION_FIX_TIMEOUT_MS))
      if (!mounted.current || position.timestamp <= lastAt.current) return
      lastAt.current = position.timestamp
      onRef.current.fix(fixOf(position))
    } catch (error) {
      Logger.warn('events', 'location:fixRefresh:failed', { code: (error as { code?: string } | null)?.code })
    } finally {
      pending.current = false
    }
  }, [onRef])

  const askUnlessFresh = useCallback(() => {
    if (Date.now() - lastAt.current >= FIX_RETURN_DEBOUNCE_MS) void ask()
  }, [ask])

  useEffect(() => {
    mounted.current = true
    void ask()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') askUnlessFresh()
    })
    return () => {
      mounted.current = false
      sub.remove()
    }
  }, [ask, askUnlessFresh])

  useEffect(() => {
    if (!periodic) return
    askUnlessFresh()
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void ask()
    }, FIX_REFRESH_MS)
    return () => clearInterval(timer)
  }, [periodic, ask, askUnlessFresh])

  return ask
}

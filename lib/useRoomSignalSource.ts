import { useEffect } from 'react'
import { AppState } from 'react-native'

import { getEvents } from './api'
import { subscribeCheckInChanged } from './checkIn'
import { readStoredCity } from './cityStorage'
import { getDistanceKm, roundCoord } from './geo'
import { subscribeDirtyDomains } from './liveSyncState'
import { Logger } from './logger'
import { type PreciseFix, type RoomButtonEvent } from './roomButton'
import { publishRoomSignal } from './roomSignal'
import { PULSE_PAGE, quietLocation, type QuietCoords } from './useTonight'

/**
 * The centre button's one source (BAR-04). It used to be published by whichever screen had just fetched, so a search on the Pulse
 * ("coffee") judged the fence from the filtered page and dropped the disc out of (c), and nothing re-judged a fix that moved or
 * a door that opened. Now one unfiltered "tonight near me" read (the `useTonight` query: city, lat/lon, no search or filters,
 * so it is also the cache entry Tonight reads) is judged again on every tick, foreground and fix.
 *
 * Never asks for location (`quietLocation`): no permission, no fix, and the going-tonight half still works from the city feed.
 */
export const SOURCE_TICK_MS = 60_000
/** The feed is read again only when the fix has moved this far, or the read is this old. */
export const REFETCH_KM = 1
export const REFETCH_AGE_MS = 5 * 60_000

export type SourceDeps = {
  readFix(): Promise<QuietCoords | null>
  fetchEvents(fix: QuietCoords | null): Promise<RoomButtonEvent[] | null>
  publish(events: readonly RoomButtonEvent[], now: number, at: QuietCoords | null): void
  now(): number
}

/** One judge at a time; `run(true)` re-reads the feed too (a check-in, a save: something the cached page predates). */
export function createRoomSignalSource(deps: SourceDeps) {
  let events: readonly RoomButtonEvent[] | null = null
  let readAt = 0
  let readFrom: PreciseFix | null = null
  let inflight: Promise<void> | null = null

  const stale = (fix: QuietCoords | null, force: boolean) =>
    force ||
    events === null ||
    deps.now() - readAt >= REFETCH_AGE_MS ||
    (fix !== null && (readFrom === null || getDistanceKm(readFrom.latitude, readFrom.longitude, fix.latitude, fix.longitude) > REFETCH_KM))

  const step = async (force: boolean) => {
    const fix = await deps.readFix()
    if (stale(fix, force)) {
      const next = await deps.fetchEvents(fix)
      // A failed read keeps the last page: "could not look" is not "nothing on".
      if (next) {
        events = next
        readAt = deps.now()
        readFrom = fix
      }
    }
    if (events) deps.publish(events, deps.now(), fix)
  }

  return {
    run(force = false): Promise<void> {
      if (inflight) return inflight
      inflight = step(force)
        .catch((error) => Logger.warn('events', 'room signal source failed', { error: error as never }))
        .finally(() => {
          inflight = null
        })
      return inflight
    },
  }
}

const liveDeps: SourceDeps = {
  readFix: async () => (await quietLocation()).coords,
  fetchEvents: async (fix) => {
    const stored = await readStoredCity()
    const result = await getEvents(
      {
        page: 0,
        limit: PULSE_PAGE,
        city: stored?.city ?? undefined,
        lat: roundCoord(fix?.latitude),
        lon: roundCoord(fix?.longitude),
        include: 'checkins,activeCheckins,profile',
      },
      { force: false }
    )
    return result.data ?? null
  },
  publish: publishRoomSignal,
  now: Date.now,
}

/** Mount once, in the tab layout. */
export function useRoomSignalSource(): void {
  useEffect(() => {
    const source = createRoomSignalSource(liveDeps)
    void source.run()
    const id = setInterval(() => void source.run(), SOURCE_TICK_MS)
    const app = AppState.addEventListener('change', (s) => s === 'active' && void source.run())
    const unCheckIn = subscribeCheckInChanged(() => void source.run(true))
    const unDirty = subscribeDirtyDomains((d) => d === 'events' && void source.run(true))
    return () => {
      clearInterval(id)
      app.remove()
      unCheckIn()
      unDirty()
    }
  }, [])
}

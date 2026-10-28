import { useEffect } from 'react'
import { AppState } from 'react-native'

import { getEvents } from './api'
import { apiClient } from './apiClient'
import { subscribeCheckInChanged } from './checkIn'
import { getDistanceKm, roundCoord } from './geo'
import { Logger } from './logger'
import { type PreciseFix, type RoomButtonEvent } from './roomButton'
import { subscribeEventStatusChanged } from './eventStatusSignal'
import { publishRoomSignal } from './roomSignal'
import { rsvpEventRows, savedEventRows, type SavedEventRow } from './savedEvents'
import { quietLocation, type QuietCoords } from './useTonight'

/**
 * The centre button's one source (BAR-04). It used to be published by whichever screen had just fetched, so a search on the Pulse
 * ("coffee") judged the fence from the filtered page and dropped the disc out of (c), and nothing re-judged a fix that moved or
 * a door that opened. Now two reads, neither of them a screen's filtered page:
 *
 * - **Where you are standing:** the nearest events to the fix (`sortBy=distance`, one page of 20), so a fence you are inside is
 *   always among them in any city, however many events it has. Judged again on every tick, foreground and fix.
 * - **What is yours:** your saved events and your "going" RSVPs, so tonight's plan does not depend on the page the city feed
 *   happened to return.
 *
 * Never asks for location (`quietLocation`). The feed is read again only when the fix has moved 1 km, the read is 5 minutes old,
 * or a check-in forces it (a save or an RSVP reads only what is yours).
 */
export const SOURCE_TICK_MS = 60_000
/** The feed is read again only when the fix has moved this far, or the read is this old. */
export const REFETCH_KM = 1
export const REFETCH_AGE_MS = 5 * 60_000
export const NEAREST_PAGE = 20
const MINE_PAGE = 50

export type SourceDeps = {
  readFix(): Promise<QuietCoords | null>
  /** The nearest events to `where`; null when the read failed. */
  fetchNearest(where: PreciseFix, force: boolean): Promise<RoomButtonEvent[] | null>
  /** Your saved events and going RSVPs, one row per event; null when the read failed. */
  fetchMine(): Promise<RoomButtonEvent[] | null>
  publish(events: readonly RoomButtonEvent[], now: number, at: QuietCoords | null): void
  now(): number
}

/**
 * The nearest page with your own events folded in. An event in both carries both halves (its fence and your flags). One that is
 * only yours has no coordinates here: it was not among the nearest, so it cannot be the fence you are standing in, and a list
 * row's missing radius must not be judged as the 100 m default.
 */
export function mergeSignalEvents(near: readonly RoomButtonEvent[], mine: readonly RoomButtonEvent[]): RoomButtonEvent[] {
  const yours = new Map(mine.map((m) => [m.id, m]))
  const seen = new Set<string>()
  const merged = near.map((e) => {
    seen.add(e.id)
    const m = yours.get(e.id)
    return m ? { ...e, is_favorited: e.is_favorited || m.is_favorited, rsvp_status: m.rsvp_status ?? e.rsvp_status } : e
  })
  for (const m of mine) if (!seen.has(m.id)) merged.push({ ...m, latitude: null, longitude: null, distance: null })
  return merged
}

export function createRoomSignalSource(deps: SourceDeps) {
  let near: readonly RoomButtonEvent[] | null = null
  let mine: readonly RoomButtonEvent[] | null = null
  let readAt = 0
  /** Where the nearest page was read from: only ever a real fix, so a lost fix reads from the last place you were. */
  let readFrom: PreciseFix | null = null
  let inflight: Promise<void> | null = null
  let pendingForce: boolean | 'mine' = false
  let disposed = false

  const step = async (force: boolean | 'mine') => {
    const fix = await deps.readFix()
    const where: PreciseFix | null = fix ?? readFrom
    const moved = fix !== null && (readFrom === null || getDistanceKm(readFrom.latitude, readFrom.longitude, fix.latitude, fix.longitude) > REFETCH_KM)
    // `'mine'`: a save or an RSVP changed what is yours, not where the fence is, so only your own list is read again.
    const mineOnly = force === 'mine' && near !== null && mine !== null && !moved && deps.now() - readAt < REFETCH_AGE_MS
    if (mineOnly) {
      const nextMine = await deps.fetchMine()
      if (nextMine) mine = nextMine
    } else if (force || near === null || mine === null || deps.now() - readAt >= REFETCH_AGE_MS || moved) {
      const [nextNear, nextMine] = await Promise.all([where ? deps.fetchNearest(where, force === true) : Promise.resolve([]), deps.fetchMine()])
      // A failed read keeps the last page: "could not look" is not "nothing on".
      if (nextNear) {
        near = nextNear
        if (fix) readFrom = fix
      }
      if (nextMine) mine = nextMine
      if (nextNear && nextMine) readAt = deps.now()
    }
    if (disposed || (near === null && mine === null)) return
    deps.publish(mergeSignalEvents(near ?? [], mine ?? []), deps.now(), fix)
  }

  const run = (force: boolean | 'mine' = false): Promise<void> => {
    if (inflight) {
      // Something changed while a read was out: that read may predate it, so one more follows, forced (a full one beats a mine-only one).
      if (force) pendingForce = pendingForce === true || force === true ? true : 'mine'
      return inflight
    }
    const running = step(force)
      .catch((error) => Logger.warn('events', 'room signal source failed', { error: error as never }))
      .then(() => {
        inflight = null
        if (pendingForce && !disposed) {
          const again = pendingForce
          pendingForce = false
          return run(again)
        }
        pendingForce = false
      })
    inflight = running
    return running
  }

  return {
    run,
    /** Sign-out or unmount: nothing more is published for this account. */
    dispose() {
      disposed = true
    },
  }
}

const savedAsEvent = (row: SavedEventRow, flags: Pick<RoomButtonEvent, 'is_favorited' | 'rsvp_status'>): RoomButtonEvent => ({
  id: row.id,
  start_time: row.start_time,
  end_time: row.end_time,
  session: row.session ?? null,
  timezone: row.timezone ?? null,
  latitude: row.latitude,
  longitude: row.longitude,
  ...flags,
})

function liveDepsFor(userId: string): SourceDeps {
  return {
    readFix: async () => (await quietLocation()).coords,
    fetchNearest: async (where, force) => {
      const result = await getEvents(
        {
          page: 0,
          limit: NEAREST_PAGE,
          lat: roundCoord(where.latitude),
          lon: roundCoord(where.longitude),
          sortBy: 'distance',
          sortOrder: 'asc',
          include: 'checkins,activeCheckins,profile',
        },
        { force }
      )
      return result.data ?? null
    },
    fetchMine: async () => {
      const [saved, going] = await Promise.all([apiClient.getUserFavorites(userId, 1, MINE_PAGE), apiClient.getMyRsvps()])
      // A server older than the RSVP route answers 404: there is no "going" to read, not a failure.
      if (!saved.success) return null
      const byId = new Map<string, RoomButtonEvent>()
      for (const row of savedEventRows(saved.data)) {
        if (row.status !== 'cancelled') byId.set(row.id, savedAsEvent(row, { is_favorited: true, rsvp_status: null }))
      }
      for (const row of going.success ? rsvpEventRows(going.data) : []) {
        if (row.rsvpStatus !== 'going' || row.status === 'cancelled') continue
        byId.set(row.id, savedAsEvent(row, { is_favorited: byId.get(row.id)?.is_favorited === true, rsvp_status: 'going' }))
      }
      return [...byId.values()]
    },
    publish: publishRoomSignal,
    now: Date.now,
  }
}

let active: ReturnType<typeof createRoomSignalSource> | null = null

/** Sign-out: nothing more is published for this account, whatever read is still out. */
export function stopRoomSignalSource(): void {
  active?.dispose()
  active = null
}

/** Mount once, in the tab layout. */
export function useRoomSignalSource(userId: string | null | undefined): void {
  useEffect(() => {
    if (!userId) return
    const source = createRoomSignalSource(liveDepsFor(userId))
    active = source
    void source.run()
    // A phone in a pocket does not need its fence judged every minute: the foreground does it when it comes back.
    const id = setInterval(() => AppState.currentState === 'active' && void source.run(), SOURCE_TICK_MS)
    const app = AppState.addEventListener('change', (s) => s === 'active' && void source.run())
    const unCheckIn = subscribeCheckInChanged(() => void source.run(true))
    // An RSVP or a save (every writer goes through `apiClient`'s `eventStatusChanged`).
    const unStatus = subscribeEventStatusChanged(() => void source.run('mine'))
    return () => {
      source.dispose()
      if (active === source) active = null
      clearInterval(id)
      app.remove()
      unCheckIn()
      unStatus()
    }
  }, [userId])
}

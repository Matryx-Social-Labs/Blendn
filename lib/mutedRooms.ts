import { useCallback, useEffect, useRef, useState } from 'react'

import { apiClient, type RoomMute } from './apiClient'
import { crewRoomsFrom, crewRoomTitle } from './crews'
import { Logger } from './logger'
import { roomDisplayTitle } from './placeRoom'
import { isMuted, muteFrom, muteLabel, useRoomMembership } from './roomMembership'

/**
 * The rooms you silenced (Flow 9 · 9.6, Settings › Notifications › Muted rooms).
 *
 * There is no "muted" read on the server: each row of `GET /chat/groups` carries your mute of it, so this reads the
 * rooms the Banter already reads, page by page, and keeps the muted ones. Page 1 is the Banter's cached read (event
 * rooms, plus your crew and Blend rooms, which come with page 1 only); a later page is one request more. The scan stops
 * at `MUTED_SCAN_PAGES`, so a list can never cost an unbounded number of reads, and says so when it stopped short.
 *
 * A mute made or lifted while this is open (Room info writes the store, `lib/roomMembership.ts`) is taken from the
 * store, so a room unmuted one screen over leaves the list at once and no refetch is asked for it.
 */

export type MutedRoom = {
  id: string
  title: string
  kind: 'event' | 'crew' | 'blend'
  crewId?: string
  blendId?: string
  /** The event's own title when the room is called something else; Room info opens on it. */
  eventTitle?: string
  mute: RoomMute
}

/** Pages of 20 rooms: 500 rooms, a few times more than anyone is in. */
export const MUTED_SCAN_PAGES = 25

type Row = Record<string, any>

/** The muted rooms in one `GET /chat/groups` answer, newest first as the server sent them. A lapsed mute is not one. */
export function mutedRoomsFrom(payload: unknown, now: Date = new Date()): MutedRoom[] {
  const data = payload as Row | null
  const groups: Row[] = Array.isArray(data) ? data : data?.groups || data?.data || []
  const out: MutedRoom[] = []
  for (const g of Array.isArray(groups) ? groups : []) {
    const mute = muteFrom(g?.mute)
    const id = String(g?.id || g?.chat_room_id || g?.chatRoomId || '')
    if (!id || !mute || !isMuted(mute, now)) continue
    const eventTitle = g?.event?.title ? String(g.event.title) : undefined
    const title = roomDisplayTitle(g) || g.event_title || g.eventTitle || g.title || g.name || 'Event chat'
    out.push({ id, title: String(title), kind: 'event', eventTitle, mute })
  }
  for (const r of crewRoomsFrom(payload)) {
    const mute = muteFrom(r.mute)
    if (!mute || !isMuted(mute, now)) continue
    out.push({ id: r.id, title: crewRoomTitle(r), kind: r.kind, crewId: r.crewId ?? undefined, blendId: r.blendId ?? undefined, mute })
  }
  return out
}

/** Another page after this answer (`pagination.hasMore`). Absent says no: never loop on a server that does not say. */
export function hasMorePages(payload: unknown): boolean {
  return (payload as { pagination?: { hasMore?: unknown } } | null)?.pagination?.hasMore === true
}

/** The line under a muted room: "until 9:30 PM", "until you turn it back on". */
export function muteEnds(mute: RoomMute, now: Date = new Date()): string {
  return muteLabel(mute, now)?.replace(/^Muted /, '') ?? ''
}

/** What the Notifications row in Settings says: the muted count when there is one, else whether pushes are on (frame 02, 01). */
export function notificationsHint(mutedCount: number, pushOn: boolean | null): string | undefined {
  if (mutedCount > 0) return `${mutedCount} ${mutedCount === 1 ? 'room' : 'rooms'} muted`
  return pushOn === null ? undefined : pushOn ? 'On' : 'Off'
}

export type MutedRoomsState = {
  rooms: MutedRoom[]
  /** Reading the first page. */
  loading: boolean
  /** The first page did not come; nothing is known. */
  failed: boolean
  /** A later page is on its way, or the scan stopped at its cap with pages left. */
  scanning: boolean
  capped: boolean
  refresh: () => void
}

/** Pages 2.. by the server's own default page size, matching the cached first page. */
const pageUrl = (page: number) => `/api/mobile/chat/groups?page=${page}`

export function useMutedRooms(): MutedRoomsState {
  const membership = useRoomMembership()
  const [scanned, setScanned] = useState<MutedRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [capped, setCapped] = useState(false)
  const run = useRef(0)

  const scan = useCallback(async (force: boolean) => {
    const mine = ++run.current
    const live = () => run.current === mine
    try {
      const first = await apiClient.getChatGroups({ force })
      if (!live()) return
      if (!first.success) {
        Logger.warn('chat', 'Could not read the rooms for the muted list', { error: first.error })
        setFailed(true)
        return
      }
      setFailed(false)
      let found = mutedRoomsFrom(first.data)
      setScanned(found)
      setLoading(false)
      let more = hasMorePages(first.data)
      let page = 2
      setCapped(false)
      setScanning(more)
      while (more && live()) {
        if (page > MUTED_SCAN_PAGES) {
          setCapped(true)
          break
        }
        const next = await apiClient.queuedRequest<unknown>(pageUrl(page))
        if (!live()) return
        // A page that does not come ends the scan with what was found: the rooms read so far are still true.
        if (!next.success) break
        const have = new Set(found.map((r) => r.id))
        found = [...found, ...mutedRoomsFrom(next.data).filter((r) => !have.has(r.id))]
        setScanned(found)
        more = hasMorePages(next.data)
        page += 1
      }
    } catch (error) {
      Logger.warn('chat', 'The muted rooms scan failed', { error: error as never })
      if (live()) setFailed(true)
    } finally {
      if (live()) {
        setLoading(false)
        setScanning(false)
      }
    }
  }, [])

  useEffect(() => {
    // `scan` sets state only after its first await; the rule cannot see through the async function.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void scan(false)
    return () => {
      run.current += 1
    }
  }, [scan])

  const refresh = useCallback(() => {
    setLoading(true)
    void scan(true)
  }, [scan])

  /** What the store has heard since the scan wins: a room unmuted one screen over is gone, one muted there is not missing. */
  const rooms = scanned.filter((r) => !membership.left.has(r.id) && isMuted(membership.mutes.get(r.id) ?? r.mute))
  return { rooms, loading, failed, scanning, capped, refresh }
}

/**
 * Where a muted room's row goes: the room's info for an event's or a place's room (frame 04: "the room's info"), the
 * crew's page for a crew's, and the room itself for a Blend, whose menu is in its header. Typed for `router.push`.
 */
export function mutedRoomRoute(room: MutedRoom): { pathname: string; params: Record<string, string> } {
  if (room.kind === 'crew' && room.crewId) return { pathname: '/crews/[crewId]', params: { crewId: room.crewId } }
  if (room.kind === 'event') return { pathname: '/chat-info/[id]', params: { id: room.id, roomName: room.title, eventTitle: room.eventTitle ?? '' } }
  return {
    pathname: '/chat/[id]',
    params: { id: room.id, roomName: room.title, kind: room.kind, ...(room.crewId ? { crewId: room.crewId } : {}), ...(room.blendId ? { blendId: room.blendId } : {}) },
  }
}

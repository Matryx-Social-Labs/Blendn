import { useCallback, useEffect, useSyncExternalStore } from 'react'

import { apiClient, type RoomMute } from './apiClient'
import { crewRoomsFrom, crewRoomTitle } from './crews'
import { Logger } from './logger'
import { roomDisplayTitle } from './placeRoom'
import { isMuted, muteFrom, muteLabel, useRoomMembership } from './roomMembership'
import { useAuth } from './useAuth'

/**
 * The rooms you silenced (Flow 9 · 9.6, Settings › Notifications › Muted rooms).
 *
 * Where the rooms come from, best first:
 *
 * 1. `GET /me/muted-rooms` (rows shaped as `GET /chat/groups` rows, `nextCursor` to go on) and a `mutedRooms` count on
 *    `GET /me/notification-preferences`. The server is adding both; each is read when it is there.
 * 2. Until then, `GET /chat/groups`, whose every row carries your mute of it: page 1 is the Banter's cached read (event
 *    rooms, plus your crew and Blend rooms, which come with page 1 only), a later page is one request more.
 *    ponytail: a scan of the Banter's pages, capped at `MUTED_SCAN_PAGES`; drop it once `/me/muted-rooms` is live.
 *
 * One scan per session, shared by Settings, Notifications and See all (`useMutedRooms`): the second screen to ask is
 * handed the first's answer for `SCAN_FRESH_MS`. A scan that ends short says so (`partial`, `capped`): a count is never
 * quietly smaller than the truth.
 *
 * A mute made or lifted while a list is open (Room info writes the store, `lib/roomMembership.ts`) is taken from the
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

/** The page size of the Banter's list, and what a later page asks for when the first did not say. */
export const MUTED_PAGE_SIZE = 20
/** Pages of `MUTED_PAGE_SIZE` rooms: 500 rooms, a few times more than anyone is in. */
export const MUTED_SCAN_PAGES = 25
/** A scan is reused for this long before the next screen to ask reads again. */
const SCAN_FRESH_MS = 60_000

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

/**
 * What the Notifications row in Settings says: the muted count when there is one ("N+" when the count is only what was
 * read so far), else whether pushes are on (frames 02, 01).
 */
export function notificationsHint(mutedCount: number, pushOn: boolean | null, atLeast = false): string | undefined {
  if (mutedCount > 0) return `${mutedCount}${atLeast ? '+' : ''} ${mutedCount === 1 && !atLeast ? 'room' : 'rooms'} muted`
  return pushOn === null ? undefined : pushOn ? 'On' : 'Off'
}

/** The muted rooms in a `GET /me/muted-rooms` answer: rows as a chat list's, event rooms and crew and Blend rooms together. */
export function mutedRoomsFromServer(data: unknown, now: Date = new Date()): MutedRoom[] | null {
  const rows = (data as { rooms?: unknown } | null)?.rooms
  if (!Array.isArray(rows)) return null
  const crewOrBlend = (r: Row) => r?.kind === 'crew' || r?.kind === 'blend'
  return mutedRoomsFrom({ groups: rows.filter((r) => !crewOrBlend(r)), rooms: rows.filter(crewOrBlend) }, now)
}

const cursorOf = (data: unknown): string | null => {
  const c = (data as { nextCursor?: unknown } | null)?.nextCursor
  return typeof c === 'string' && c ? c : null
}

/** The page size the server's first answer used, so a later page is the same size; else the Banter's default. */
function pageSizeOf(payload: unknown): number {
  const limit = (payload as { pagination?: { limit?: unknown } } | null)?.pagination?.limit
  return typeof limit === 'number' && limit > 0 ? limit : MUTED_PAGE_SIZE
}

/** The server's own count (`mutedRooms` on the notification preferences), when it sends one. */
export function mutedCountFrom(data: unknown): number | null {
  const n = (data as { mutedRooms?: unknown } | null)?.mutedRooms
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null
}

// ---------------------------------------------------------------------------
// The shared scan
// ---------------------------------------------------------------------------

type Scan = {
  userId: string | null
  rooms: MutedRoom[]
  /** Reading the first page. */
  loading: boolean
  /** The first page did not come; nothing is known. */
  failed: boolean
  /** A later page is on its way. */
  scanning: boolean
  /** The scan stopped at its page cap with pages left. */
  capped: boolean
  /** A later page did not come: what is here is true, but not all of it. */
  partial: boolean
  /** The server's own count, when it sends one. */
  serverCount: number | null
  at: number
}

const EMPTY: Scan = { userId: null, rooms: [], loading: true, failed: false, scanning: false, capped: false, partial: false, serverCount: null, at: 0 }
let scan: Scan = EMPTY
let run = 0
/** `GET /me/muted-rooms` answered 404 or the like: not there yet, so do not ask again this session. */
let endpointMissing = false
const listeners = new Set<() => void>()

function put(next: Partial<Scan>) {
  scan = { ...scan, ...next }
  listeners.forEach((l) => l())
}

/** Forget everything: a different account, and tests. */
export function resetMutedRooms(userId: string | null = null) {
  run += 1
  endpointMissing = false
  scan = { ...EMPTY, userId }
  listeners.forEach((l) => l())
}

async function readServerCount(mine: number) {
  try {
    const result = await apiClient.queuedRequest<unknown>('/api/mobile/me/notification-preferences')
    if (run === mine && result.success) put({ serverCount: mutedCountFrom(result.data) })
  } catch {
    // The count is a courtesy; the list is the truth.
  }
}

/** Pages of `GET /me/muted-rooms`. Returns false when the endpoint is not there, so the caller falls back to the scan. */
async function scanServerList(mine: number): Promise<boolean> {
  if (endpointMissing) return false
  let cursor: string | null = null
  let found: MutedRoom[] = []
  for (let page = 1; page <= MUTED_SCAN_PAGES; page += 1) {
    const url: string = `/api/mobile/me/muted-rooms?limit=${MUTED_PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    const result = await apiClient.queuedRequest<unknown>(url)
    if (run !== mine) return true
    const rooms = result.success ? mutedRoomsFromServer(result.data) : null
    if (!rooms) {
      if (page === 1) {
        // Only "not there" is remembered; a dropped connection falls back for this read and asks again next time.
        if (result.errorCode === 'NOT_FOUND') endpointMissing = true
        return false
      }
      return put({ partial: true, scanning: false }), true
    }
    const have = new Set(found.map((r) => r.id))
    found = [...found, ...rooms.filter((r) => !have.has(r.id))]
    cursor = cursorOf(result.data)
    put({ rooms: found, loading: false, failed: false, scanning: !!cursor })
    if (!cursor) return true
  }
  put({ capped: true, scanning: false })
  return true
}

/** The fallback: the Banter's own pages, keeping the muted rooms. */
async function scanBanter(mine: number, force: boolean) {
  const first = await apiClient.getChatGroups({ force })
  if (run !== mine) return
  if (!first.success) {
    Logger.warn('chat', 'Could not read the rooms for the muted list', { error: first.error })
    return put({ failed: true, loading: false, scanning: false })
  }
  let found = mutedRoomsFrom(first.data)
  let more = hasMorePages(first.data)
  const limit = pageSizeOf(first.data)
  put({ rooms: found, loading: false, failed: false, scanning: more })
  for (let page = 2; more; page += 1) {
    if (page > MUTED_SCAN_PAGES) return put({ capped: true, scanning: false })
    const next = await apiClient.queuedRequest<unknown>(`/api/mobile/chat/groups?page=${page}&limit=${limit}`)
    if (run !== mine) return
    // A page that does not come ends the scan with what was found, and says so: the rooms read are true, not all of them.
    if (!next.success) return put({ partial: true, scanning: false })
    const have = new Set(found.map((r) => r.id))
    found = [...found, ...mutedRoomsFrom(next.data).filter((r) => !have.has(r.id))]
    more = hasMorePages(next.data)
    put({ rooms: found, scanning: more })
  }
}

async function startScan(userId: string | null, force: boolean) {
  const mine = ++run
  const same = scan.userId === userId
  // A refresh keeps the rooms on screen while it reads (`loading` is then a refresh, not an empty first read).
  scan = { ...EMPTY, userId, rooms: force && same ? scan.rooms : [], loading: true, serverCount: same ? scan.serverCount : null, at: Date.now() }
  listeners.forEach((l) => l())
  void readServerCount(mine)
  try {
    if (!(await scanServerList(mine))) await scanBanter(mine, force)
  } catch (error) {
    Logger.warn('chat', 'The muted rooms scan failed', { error: error as never })
    if (run === mine) put({ failed: scan.rooms.length === 0, partial: scan.rooms.length > 0, loading: false, scanning: false })
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export type MutedRoomsState = {
  rooms: MutedRoom[]
  loading: boolean
  failed: boolean
  scanning: boolean
  capped: boolean
  partial: boolean
  /** The count to say: the server's when it sent one, else the rooms read (`atLeast` when that is not all of them). */
  count: number
  atLeast: boolean
  refresh: () => void
}

/**
 * The muted rooms, from the one scan every screen shares. The first screen to ask starts it; a later one is handed the
 * answer while it is fresh, and starts it again when it is stale, when the account changed, or on `refresh`.
 */
export function useMutedRooms(): MutedRoomsState {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const state = useSyncExternalStore(subscribe, () => scan, () => scan)
  const membership = useRoomMembership()

  useEffect(() => {
    const fresh = scan.userId === userId && scan.at > 0 && Date.now() - scan.at < SCAN_FRESH_MS && !scan.failed
    // `startScan` sets the store only after it has been called; the rule cannot see through the async function.
    if (!fresh) void startScan(userId, false)
  }, [userId])

  /*
   * A room muted since the scan (Room info writes the store) is a room the scan does not have: read again, once per
   * change to the store. A muted room the scan could not reach (capped) is in the store too, and asks for the same
   * read; it is cheap (page 1 is cached) and happens on a change, not on a render.
   */
  useEffect(() => {
    if (scan.userId !== userId || scan.loading || scan.scanning) return
    const known = new Set(scan.rooms.map((r) => r.id))
    const missing = [...membership.mutes].some(([id, m]) => isMuted(m) && !known.has(id) && !membership.left.has(id))
    if (missing) void startScan(userId, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a change to what the store holds asks
  }, [membership.mutes])

  const refresh = useCallback(() => void startScan(userId, true), [userId])

  /** What the store has heard since the scan wins: a room unmuted or left one screen over is gone at once. */
  const rooms = state.rooms.filter((r) => !membership.left.has(r.id) && isMuted(membership.mutes.get(r.id) ?? r.mute))
  const exact = state.serverCount !== null
  return {
    rooms,
    loading: state.loading,
    failed: state.failed,
    scanning: state.scanning,
    capped: state.capped,
    partial: state.partial,
    count: exact ? (state.serverCount as number) : rooms.length,
    atLeast: !exact && (state.capped || state.partial || state.scanning),
    refresh,
  }
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

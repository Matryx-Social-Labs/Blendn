import { useSyncExternalStore } from 'react'

import { apiClient } from './apiClient'
import type { FriendRequest } from './friends'
import { appendUnique, refreshFirstPage, requestsPageFrom, type RequestSide } from './friendsPaging'
import { Logger } from './logger'

const requestKey = (r: FriendRequest) => r.id

/** One side of the requests: what has been read, how many there are in all, and whether a later page is on its way or failed. */
type Side = { items: FriendRequest[]; total: number; cursor: string | null; loadingMore: boolean; moreFailed: boolean }
const EMPTY_SIDE: Side = { items: [], total: 0, cursor: null, loadingMore: false, moreFailed: false }

/** What a list's foot needs to know about its next page. */
export type RequestsPage = { hasMore: boolean; loadingMore: boolean; moreFailed: boolean }
export const pageOf = (side: Side): RequestsPage => ({ hasMore: side.cursor !== null, loadingMore: side.loadingMore, moreFailed: side.moreFailed })

/**
 * The friend requests, ONE list for every surface (requests placement A, SCRUM-1036): Friends, its Requests page, Add
 * friends, Me's row and Notifications · Waiting on you all read this, so an answer on any of them leaves all of them at
 * once, with no reload. Module state, like the bell's counts (`lib/inboxBadge`).
 */
export type FriendRequestsState = {
  incoming: Side
  outgoing: Side
  loaded: boolean
  failed: boolean
  /** The incoming requests answered this session, wherever: Notifications closes their rows whatever it has read. */
  answered: ReadonlySet<string>
}
const EMPTY: FriendRequestsState = { incoming: EMPTY_SIDE, outgoing: EMPTY_SIDE, loaded: false, failed: false, answered: new Set() }
let state = EMPTY
const listeners = new Set<() => void>()
const emit = (next: FriendRequestsState) => {
  state = next
  listeners.forEach((l) => l())
}
const put = (side: RequestSide, next: Side) => emit({ ...state, [side]: next })
/** Bumped by every first-page read and by sign-out: an older read, or a page of it, writes nothing. */
let ask = 0
const paging = { incoming: false, outgoing: false }
/** When each request left (answered, withdrawn): a read that began before then still lists it, and must not put it back. */
const leftAt = new Map<string, number>()
const stillThere = (started: number) => (r: FriendRequest) => (leftAt.get(r.id) ?? -1) < started

/**
 * The head of both sides, read again; what was read further down stays (`refreshFirstPage`, as Friends does), so coming back
 * to a list, or a pull, does not throw the person to the top of it. A failed read keeps what is drawn and says so (`failed`).
 */
export async function loadFriendRequests(): Promise<void> {
  const mine = ++ask
  const started = Date.now()
  paging.incoming = false
  paging.outgoing = false
  const result = await apiClient.getFriendRequests()
  if (mine !== ask) return
  const inc = result.success ? requestsPageFrom(result.data, 'incoming') : null
  const out = result.success ? requestsPageFrom(result.data, 'outgoing') : null
  // The incoming side is what every count reads; an answer without the outgoing one keeps what Add friends has.
  if (!inc) return emit({ ...state, failed: true })
  const meet = (side: RequestSide, page: NonNullable<typeof inc>): Side => {
    const fresh = page.items.filter(stillThere(started))
    const now = state[side]
    const merged = refreshFirstPage(now.items, { ...page, items: fresh }, requestKey)
    const total = Math.max(0, page.total - (page.items.length - fresh.length))
    return { items: merged.items, total, cursor: merged.keptTail ? now.cursor : page.nextCursor, loadingMore: false, moreFailed: false }
  }
  emit({ ...state, incoming: meet('incoming', inc), outgoing: out ? meet('outgoing', out) : state.outgoing, loaded: true, failed: false })
}

/** The next page of one side, never twice at once; a failed page keeps what is here (`moreFailed`) and asking again is its retry. */
export async function loadMoreFriendRequests(side: RequestSide): Promise<void> {
  const have = state[side]
  if (!have.cursor || paging[side]) return
  paging[side] = true
  const mine = ask
  const started = Date.now()
  put(side, { ...have, loadingMore: true, moreFailed: false })
  let next = (): Side => ({ ...state[side], loadingMore: false, moreFailed: true })
  try {
    const result = await apiClient.getFriendRequests({ side, cursor: have.cursor })
    if (mine !== ask) return
    const page = result.success ? requestsPageFrom(result.data, side) : null
    if (page) {
      const fresh = page.items.filter(stillThere(started))
      next = () => ({
        items: appendUnique(state[side].items, fresh, requestKey),
        total: Math.max(0, page.total - (page.items.length - fresh.length)),
        cursor: page.nextCursor,
        loadingMore: false,
        moreFailed: false,
      })
    }
  } catch (error) {
    Logger.warn('friends', 'requests next page failed', { error })
  } finally {
    if (mine === ask) {
      paging[side] = false
      put(side, next())
    }
  }
}

/** A request answered or withdrawn, wherever: it leaves the list and the count together, on every surface. */
export function friendRequestLeft(side: RequestSide, id: string): void {
  leftAt.set(id, Date.now())
  const now = state[side]
  // Counted if it is held, or may sit on a page not read yet.
  const counted = now.items.some((r) => r.id === id) || now.cursor !== null
  const answered = side === 'incoming' ? new Set(state.answered).add(id) : state.answered
  emit({ ...state, answered, [side]: { ...now, items: now.items.filter((r) => r.id !== id), total: counted ? Math.max(0, now.total - 1) : now.total } })
}

/** Sign-out: the next account starts from nothing, and a read still out for this one writes nothing. */
export function resetFriendRequests(): void {
  ask += 1
  paging.incoming = false
  paging.outgoing = false
  leftAt.clear()
  emit(EMPTY)
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** The list alone, for a surface that only shows it (Me's row, Notifications). */
export const useFriendRequestsState = (): FriendRequestsState => useSyncExternalStore(subscribe, () => state)

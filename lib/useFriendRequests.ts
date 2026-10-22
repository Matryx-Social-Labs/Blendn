import { useFocusEffect } from 'expo-router'
import { useCallback, useRef, useState } from 'react'

import { useToast } from '../components/Toast'
import { apiClient } from './apiClient'
import { friendRefusal, friendRefusalLine } from './friendRefusal'
import { askFriendsSeeMe, useStillHere } from './friendsSeeMeAsk'
import type { FriendRequest } from './friends'
import { appendUnique, requestsPageFrom, type RequestSide } from './friendsPaging'
import { Logger } from './logger'

const FAILED_LINE = "That didn’t go through. Try again."
const requestKey = (r: FriendRequest) => r.id

/** One side of the requests: what has been read, how many there are in all, and whether a later page is on its way or failed. */
type Side = { items: FriendRequest[]; total: number; cursor: string | null; loadingMore: boolean; moreFailed: boolean }
const EMPTY_SIDE: Side = { items: [], total: 0, cursor: null, loadingMore: false, moreFailed: false }

/** What a list's foot needs to know about its next page. */
export type RequestsPage = { hasMore: boolean; loadingMore: boolean; moreFailed: boolean }
const pageOf = (side: Side): RequestsPage => ({ hasMore: side.cursor !== null, loadingMore: side.loadingMore, moreFailed: side.moreFailed })

/**
 * Friend requests either way, and answering them.
 *
 * Shared by Add friends and the Requests list, so Accept means the same thing
 * — and says the same thing — wherever it is tapped. Loaded on focus: an answer
 * given on one screen should be gone from the other when you come back.
 *
 * Each side is read a page at a time by the server's cursor (admin #724: `?list=incoming|outgoing&cursor=`), and its
 * `total` is the server's count, never the length of what is loaded: the badge on Friends says how many are waiting,
 * not how many have been read. An answered request leaves the list and the count together.
 *
 * `failed` is kept apart from an empty list. A request that did not load is
 * "Try again", never "No requests".
 */
export function useFriendRequests() {
  const { showToast } = useToast()
  const stillHere = useStillHere()
  const [incoming, setIncoming] = useState<Side>(EMPTY_SIDE)
  const [outgoing, setOutgoing] = useState<Side>(EMPTY_SIDE)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  // What a later page reads: the latest list and cursor, not the render the scroll started in.
  const latest = useRef({ incoming: EMPTY_SIDE, outgoing: EMPTY_SIDE })
  const paging = useRef({ incoming: false, outgoing: false })
  const ask = useRef(0)

  const put = useCallback((side: RequestSide, next: Side) => {
    latest.current = { ...latest.current, [side]: next }
    return (side === 'incoming' ? setIncoming : setOutgoing)(next)
  }, [])

  /*
   * Per row, and checked synchronously. One shared id let a tap on another row
   * re-enable this one mid-request; and state alone is read from the render
   * the tap happened in, so a quick second tap before the re-render sent a
   * second answer. The ref decides; the state only greys the buttons.
   */
  const inFlight = useRef(new Set<string>())
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const once = async (id: string, work: () => Promise<void>) => {
    if (inFlight.current.has(id)) return
    inFlight.current.add(id)
    setBusy(new Set(inFlight.current))
    try {
      await work()
    } finally {
      inFlight.current.delete(id)
      setBusy(new Set(inFlight.current))
    }
  }

  const load = useCallback(async () => {
    const mine = ++ask.current
    paging.current = { incoming: false, outgoing: false }
    const result = await apiClient.getFriendRequests()
    if (mine !== ask.current) return
    const inc = result.success ? requestsPageFrom(result.data, 'incoming') : null
    const out = result.success ? requestsPageFrom(result.data, 'outgoing') : null
    if (inc && out) {
      put('incoming', { items: inc.items, total: inc.total, cursor: inc.nextCursor, loadingMore: false, moreFailed: false })
      put('outgoing', { items: out.items, total: out.total, cursor: out.nextCursor, loadingMore: false, moreFailed: false })
      setFailed(false)
      setLoaded(true)
    } else {
      // What is on screen stays; only the flag says the refresh didn't land.
      setFailed(true)
    }
  }, [put])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  /** The next page of one side, never twice at once; a failed page keeps what is here (`moreFailed`) and asking again is its retry. */
  const loadMore = useCallback(
    async (side: RequestSide) => {
      const have = latest.current[side]
      if (!have.cursor || paging.current[side]) return
      paging.current[side] = true
      const mine = ask.current
      put(side, { ...have, loadingMore: true, moreFailed: false })
      let next: Side = { ...latest.current[side], loadingMore: false, moreFailed: true }
      try {
        const result = await apiClient.getFriendRequests({ side, cursor: have.cursor })
        if (mine !== ask.current) return
        const page = result.success ? requestsPageFrom(result.data, side) : null
        if (page) {
          const now = latest.current[side]
          next = { items: appendUnique(now.items, page.items, requestKey), total: page.total, cursor: page.nextCursor, loadingMore: false, moreFailed: false }
        }
      } catch (error) {
        Logger.warn('friends', 'requests next page failed', { error })
      } finally {
        if (mine === ask.current) {
          paging.current[side] = false
          put(side, next)
        }
      }
    },
    [put]
  )

  const leave = (side: RequestSide, id: string) => {
    const now = latest.current[side]
    put(side, { ...now, items: now.items.filter((r) => r.id !== id), total: Math.max(0, now.total - 1) })
  }

  /** "Not now" is quiet: the person who sent it is never told. */
  const respond = (request: FriendRequest, action: 'accept' | 'dismiss') =>
    once(request.id, async () => {
      const result = await apiClient.respondToFriendRequest(request.id, action)
      if (!result.success) {
        // An unfinished profile or the rate limit says so; anything else is the one plain line.
        const refused = friendRefusal(result)
        showToast(refused ? friendRefusalLine(refused) : FAILED_LINE, 'error', { haptic: 'error' })
        return
      }
      leave('incoming', request.id)
      if (action === 'accept') {
        showToast(`You and ${request.person.name} are friends`, 'success', { haptic: 'success' })
        void askFriendsSeeMe({ stillHere })
      }
    })

  const withdraw = (request: FriendRequest) =>
    once(request.id, async () => {
      const result = await apiClient.withdrawFriendRequest(request.id)
      if (result.success) leave('outgoing', request.id)
      else showToast(FAILED_LINE, 'error', { haptic: 'error' })
    })

  return {
    incoming: incoming.items,
    outgoing: outgoing.items,
    incomingTotal: incoming.total,
    outgoingTotal: outgoing.total,
    incomingPage: pageOf(incoming),
    outgoingPage: pageOf(outgoing),
    loaded,
    failed,
    load,
    loadMore,
    respond,
    withdraw,
    busy,
  }
}

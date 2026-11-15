import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useToast } from '../components/Toast'
import { apiClient } from './apiClient'
import { friendRefusal, friendRefusalLine } from './friendRefusal'
import { friendRequestLeft, loadFriendRequests, loadMoreFriendRequests, pageOf, useFriendRequestsState } from './friendRequests'
import { askFriendsSeeMe, useStillHere } from './friendsSeeMeAsk'
import type { FriendRequest } from './friends'
import type { RequestSide } from './friendsPaging'
import { Logger } from './logger'
import { subscribeToBell } from './socketClient'

const FAILED_LINE = "That didn’t go through. Try again."

/**
 * Friend requests either way, and answering them.
 *
 * Shared by Add friends and the Requests list, so Accept means the same thing
 * — and says the same thing — wherever it is tapped. Loaded on focus, and
 * read again when a new request lands in the bell, so an open list shows it.
 *
 * Each side is read a page at a time by the server's cursor (admin #724: `?list=incoming|outgoing&cursor=`), and its
 * `total` is the server's count, never the length of what is loaded: the badge on Friends says how many are waiting,
 * not how many have been read.
 *
 * `failed` is kept apart from an empty list. A request that did not load is
 * "Try again", never "No requests".
 */
export function useFriendRequests() {
  const { showToast } = useToast()
  const stillHere = useStillHere()
  const { incoming, outgoing, loaded, failed } = useFriendRequestsState()

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
    } catch (error) {
      // A throw (the queue cleared under it) is said like any failure, never a silent stop (SCRUM-754).
      Logger.warn('friends', 'request answer threw', { error })
      showToast(FAILED_LINE, 'error', { haptic: 'error' })
    } finally {
      inFlight.current.delete(id)
      setBusy(new Set(inFlight.current))
    }
  }

  const load = useCallback(() => loadFriendRequests(), [])
  useFocusEffect(
    useCallback(() => {
      void loadFriendRequests()
    }, [])
  )
  // A request that lands while a list is open (SCRUM-1036): the bell's socket event says so, as it does for the Notifications feed.
  useEffect(() => subscribeToBell(({ kind }) => kind === 'friend_request' && void loadFriendRequests()), [])
  const loadMore = useCallback((side: RequestSide) => loadMoreFriendRequests(side), [])

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
      friendRequestLeft('incoming', request.id)
      if (action === 'accept') {
        showToast(`You and ${request.person.name} are friends`, 'success', { haptic: 'success' })
        void askFriendsSeeMe({ stillHere })
      }
    })

  const withdraw = (request: FriendRequest) =>
    once(request.id, async () => {
      const result = await apiClient.withdrawFriendRequest(request.id)
      if (result.success) friendRequestLeft('outgoing', request.id)
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

import { useFocusEffect } from 'expo-router'
import { useCallback, useRef, useState } from 'react'

import { useToast } from '../components/Toast'
import { apiClient } from './apiClient'
import type { FriendRequest } from './friends'

/**
 * Friend requests either way, and answering them.
 *
 * Shared by Add friends and the Requests list, so Accept means the same thing
 * — and says the same thing — wherever it is tapped. Loaded on focus: an answer
 * given on one screen should be gone from the other when you come back.
 *
 * `failed` is kept apart from an empty list. A request that did not load is
 * "Try again", never "No requests".
 */
export function useFriendRequests() {
  const { showToast } = useToast()
  const [incoming, setIncoming] = useState<FriendRequest[]>([])
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

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
    const result = await apiClient.getFriendRequests()
    if (result.success && result.data) {
      setIncoming(result.data.incoming)
      setOutgoing(result.data.outgoing)
      setFailed(false)
      setLoaded(true)
    } else {
      // What is on screen stays; only the flag says the refresh didn't land.
      setFailed(true)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  /** "Not now" is quiet: the person who sent it is never told. */
  const respond = (request: FriendRequest, action: 'accept' | 'dismiss') =>
    once(request.id, async () => {
      const result = await apiClient.respondToFriendRequest(request.id, action)
      if (!result.success) {
        showToast("That didn't go through. Try again.", 'error')
        return
      }
      setIncoming((list) => list.filter((r) => r.id !== request.id))
      if (action === 'accept') showToast(`You and ${request.person.name} are friends`, 'success')
    })

  const withdraw = (request: FriendRequest) =>
    once(request.id, async () => {
      const result = await apiClient.withdrawFriendRequest(request.id)
      if (result.success) setOutgoing((list) => list.filter((r) => r.id !== request.id))
      else showToast("That didn't go through. Try again.", 'error')
    })

  return { incoming, outgoing, loaded, failed, load, respond, withdraw, busy }
}

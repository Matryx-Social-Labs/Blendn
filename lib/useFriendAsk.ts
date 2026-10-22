import { useCallback, useRef, useState } from 'react'

import { useToast } from '../components/Toast'
import { apiClient } from './apiClient'
import { afterAsk, FRIEND_COPY, friendAskOutcome, isHandle, type FriendOffer } from './friendOffer'
import { Logger } from './logger'

/**
 * The one way to ask somebody to be friends from a match (SCRUM-750): the private chat's options and the profile's
 * dock both call it, so the haptic, the toasts and the refusal mapping are one thing.
 *
 * `ask(userId)` resolves to the offer to draw next, or `null` when nothing was sent or it did not go through (the
 * toast has said why). A handle is never sent. Success plays `H.success`; "Reveal yourself first" is the server's
 * refusal for a match not yet revealed on both sides; every other failure is the standard error toast.
 * `apiClient.request` is already bounded, so a hung server ends in a failure here too.
 */
export function useFriendAsk(name: string) {
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)

  const ask = useCallback(
    async (userId: string | null | undefined): Promise<FriendOffer | null> => {
      if (inFlight.current) return null
      if (!userId || isHandle(userId)) {
        showToast(FRIEND_COPY.failed, 'error', { haptic: 'error' })
        return null
      }
      inFlight.current = true
      setBusy(true)
      try {
        const outcome = friendAskOutcome(await apiClient.sendFriendRequest({ userId }))
        if (outcome.ok) {
          showToast(FRIEND_COPY[outcome.state](name), 'success', { haptic: 'success' })
          return afterAsk(outcome.state)
        }
        if (outcome.reason === 'reveal-first') showToast(FRIEND_COPY.revealFirst, 'info')
        else showToast(FRIEND_COPY.failed, 'error', { haptic: 'error' })
        return null
      } catch (error) {
        Logger.warn('friends', 'friend request from a match failed', { error })
        showToast(FRIEND_COPY.failed, 'error', { haptic: 'error' })
        return null
      } finally {
        inFlight.current = false
        setBusy(false)
      }
    },
    [name, showToast]
  )

  return { ask, busy }
}

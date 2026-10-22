import { useCallback, useRef, useState } from 'react'

import { useToast } from '../components/Toast'
import { apiClient } from './apiClient'
import { afterAsk, FRIEND_COPY, friendAskOutcome, isHandle, type FriendOffer } from './friendOffer'
import { Logger } from './logger'

/** What an ask came to: the offer to draw next, or the sentence for why not. */
export type FriendAskResult = { ok: true; offer: FriendOffer } | { ok: false; error: string }

/**
 * The one way to ask somebody to be friends from a match (SCRUM-750): the private chat's options and card and the
 * profile's dock all call it, so the haptic, the toasts and the refusal mapping are one thing.
 *
 * `ask(userId)` resolves to the offer to draw next or to `{ ok: false, error }`. A handle is never sent. Success is a
 * toast and `H.success`; "Reveal yourself first" is the server's refusal for a match not yet revealed on both sides; every
 * other failure is the standard error. A failure is a toast, unless the caller shows it itself (`inline`: the options
 * sheet keeps its row in place with the sentence under it, like every other row). `apiClient.request` is already bounded,
 * so a hung server ends in a failure here too.
 */
export function useFriendAsk(name: string) {
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)

  const ask = useCallback(
    async (userId: string | null | undefined, { inline = false }: { inline?: boolean } = {}): Promise<FriendAskResult> => {
      const fail = (error: string, variant: 'error' | 'info' = 'error'): FriendAskResult => {
        if (inline) return { ok: false, error }
        if (variant === 'error') showToast(error, 'error', { haptic: 'error' })
        else showToast(error, variant)
        return { ok: false, error }
      }
      if (inFlight.current) return { ok: false, error: FRIEND_COPY.failed }
      if (!userId || isHandle(userId)) return fail(FRIEND_COPY.failed)
      inFlight.current = true
      setBusy(true)
      try {
        const outcome = friendAskOutcome(await apiClient.sendFriendRequest({ userId }))
        if (outcome.ok) {
          showToast(FRIEND_COPY[outcome.state](name), 'success', { haptic: 'success' })
          return { ok: true, offer: afterAsk(outcome.state) }
        }
        return outcome.reason === 'reveal-first' ? fail(FRIEND_COPY.revealFirst, 'info') : fail(FRIEND_COPY.failed)
      } catch (error) {
        Logger.warn('friends', 'friend request from a match failed', { error })
        return fail(FRIEND_COPY.failed)
      } finally {
        inFlight.current = false
        setBusy(false)
      }
    },
    [name, showToast]
  )

  return { ask, busy }
}

import { useCallback, useEffect, useState } from 'react'

import { useToast } from '../components/Toast'
import { apiClient } from './apiClient'
import { checkOutOf } from './checkIn'
import { Logger } from './logger'
import { revealReadiness } from './reveal'
import { useAuth } from './useAuth'

const REVEAL_FAILED = "Couldn't change who can see you. Nothing has changed."
const CHECKOUT_FAILED = "Couldn't check you out. You're still in this room."

/**
 * Your own controls in a room: who can see you, whether you are listed, and
 * leaving. Lifted from `app/room.tsx` when the room became the Blend'n overlay,
 * with its reasoning intact.
 */
export function useRoomControls(eventId: string | null, initiallyRevealed: boolean) {
  /*
   * Is there anything to reveal?
   *
   * `User.image` mirrors `photos[0]` and is written only by the profile PUT, so
   * it is the same photo a reveal would show. Without this the banner offered a
   * switch that changed nothing anybody could see.
   */
  const { user } = useAuth()
  const readiness = revealReadiness({
    name: user?.name,
    photos: user?.image ? [user.image] : user?.profile?.photos ?? [],
  })
  const { showToast } = useToast()

  const [revealed, setRevealed] = useState(initiallyRevealed)
  const [revealBusy, setRevealBusy] = useState(false)
  // The server's value arrives after mount (and changes room to room): follow it.
  const [serverRevealed, setServerRevealed] = useState(initiallyRevealed)
  if (serverRevealed !== initiallyRevealed) {
    setServerRevealed(initiallyRevealed)
    setRevealed(initiallyRevealed)
  }

  /*
   * "Show online status" off means counted and not listed (SCRUM-141) — the
   * roster leaves you out. Read from the profile, which returns the setting to
   * its owner only, so the banner can say so rather than leaving someone to
   * wonder why nobody likes them.
   */
  const [listed, setListed] = useState(true)
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    apiClient
      .getProfile(user.id)
      .then((r) => {
        if (!cancelled && r.success) setListed(r.data?.profile?.show_online !== false)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [user?.id])

  /*
   * Flipping your visibility, from inside the room it applies to.
   *
   * Optimistic, and rolled back on failure. The banner is the only always-on
   * statement of which state you are in, so it must never show one thing while
   * the server holds the other — being told you are anonymous when you are
   * named is the one failure this whole safeguard exists to prevent.
   *
   * `rememberReveal` is deliberately absent: this is a decision about *this*
   * room, not how somebody enters every future one.
   */
  const toggleReveal = useCallback(async () => {
    if (!eventId || revealBusy) return
    const next = !revealed
    setRevealBusy(true)
    setRevealed(next)
    try {
      const result = await apiClient.setMatchPreferences(eventId, { revealed: next })
      if (!result.success) {
        setRevealed(!next)
        Logger.warn('match', 'reveal toggle refused', { error: result.error })
        showToast(result.error || REVEAL_FAILED, 'error')
      } else if (typeof result.data?.revealed === 'boolean') {
        // The server's answer wins over the optimistic one.
        setRevealed(result.data.revealed)
      }
    } catch (e) {
      setRevealed(!next)
      Logger.error('match', 'reveal toggle failed', { error: e })
      showToast(REVEAL_FAILED, 'error')
    } finally {
      setRevealBusy(false)
    }
  }, [eventId, revealed, revealBusy, showToast])

  /*
   * Leaving the room.
   *
   * No confirmation. Checking out ends your *presence* — off the roster and out
   * of the headcount — and presence is reversible: walk back in and check in
   * again. It does not touch attendance, so the room chat stays writable.
   *
   * Resolves true only on success. Closing first would be a lie about a
   * request that might still fail, and the failure worth catching is somebody
   * believing they left a roster they are still on.
   */
  const [checkOutBusy, setCheckOutBusy] = useState(false)
  const checkOut = useCallback(async (): Promise<boolean> => {
    if (!eventId || checkOutBusy) return false
    setCheckOutBusy(true)
    try {
      // `checkOutOf` also forgets the roster: reopening must not repaint the
      // room you just left.
      const result = await checkOutOf(eventId)
      if (result.success) return true
      Logger.warn('presence', 'check out refused', { error: result.error })
      showToast(result.error || CHECKOUT_FAILED, 'error')
      return false
    } catch (e) {
      Logger.error('presence', 'check out failed', { error: e })
      showToast(CHECKOUT_FAILED, 'error')
      return false
    } finally {
      setCheckOutBusy(false)
    }
  }, [eventId, checkOutBusy, showToast])

  return { readiness, revealed, revealBusy, toggleReveal, listed, checkOut, checkOutBusy }
}

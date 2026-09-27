import { useCallback, useEffect, useState } from 'react'
import { Share } from 'react-native'

import { apiClient } from './apiClient'
import { inviteMessage, type FriendInvite } from './friends'
import { Logger } from './logger'

/**
 * Your invite link: loaded once, shared through the OS sheet, reset on demand.
 *
 * Used by the screen after onboarding and by Add friends, so the two cannot
 * say different things about the same link.
 */
export function useFriendInvite() {
  const [invite, setInvite] = useState<FriendInvite | null>(null)
  const [failed, setFailed] = useState(false)

  const settle = useCallback((result: Awaited<ReturnType<typeof apiClient.getFriendInvite>>) => {
    setFailed(!(result.success && result.data))
    if (result.success && result.data) setInvite(result.data)
  }, [])

  // State is set only once the request has settled, and not after unmounting.
  useEffect(() => {
    let live = true
    apiClient.getFriendInvite().then((result) => {
      if (live) settle(result)
    })
    return () => {
      live = false
    }
  }, [settle])

  const load = useCallback(async () => settle(await apiClient.getFriendInvite()), [settle])

  /** True when the sheet reports it went somewhere; false for a dismiss or no link. */
  const share = useCallback(async (): Promise<boolean> => {
    if (!invite) return false
    try {
      const result = await Share.share({ message: inviteMessage(invite.url) })
      return result.action === Share.sharedAction
    } catch (error) {
      Logger.debug('friends', 'Share sheet failed', { error })
      return false
    }
  }, [invite])

  /** A new link; the old one stops working. False when it did not happen. */
  const reset = useCallback(async (): Promise<boolean> => {
    const result = await apiClient.resetFriendInvite()
    if (!result.success || !result.data) return false
    setInvite(result.data)
    return true
  }, [])

  return { invite, failed, reload: load, share, reset }
}

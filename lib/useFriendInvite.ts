import { useCallback, useEffect, useState } from 'react'

import { apiClient } from './apiClient'
import type { FriendInvite } from './friends'
import { inviteLink } from './shareLinks'
import { openShare } from './shareTray'

/**
 * Your invite link: loaded once, shared through the share tray (Flow 16 · 16.1, the invite card with no inviter on it),
 * reset on demand.
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

  /** True when the link went somewhere (WhatsApp, Story, Copy, More…); false for a dismiss or no link. */
  const share = useCallback(async (): Promise<boolean> => {
    if (!invite) return false
    return openShare({ kind: 'invite', url: inviteLink(invite.token) })
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

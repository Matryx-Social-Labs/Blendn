import { useEffect, useState } from 'react'

import { FRIEND_REFUSAL, type FriendRefusal } from '../../lib/friendRefusal'
import { formatCountdown } from '../../lib/rateLimited'
import { StateScreen } from '../ds/StateScreen'

/** The wait ticks once a second, and the person is not told each tick: a screen reader reads the button's name, not the count. */
const TICK_MS = 1000

/** Seconds left of a wait, counting down once a second to zero. A new wait restarts it (adjusted during render, so it never paints stale). */
export function useCountdown(seconds: number): number {
  const [left, setLeft] = useState(seconds)
  const [from, setFrom] = useState(seconds)
  if (from !== seconds) {
    setFrom(seconds)
    setLeft(seconds)
  }
  useEffect(() => {
    const timer = setInterval(() => setLeft((n) => Math.max(0, n - 1)), TICK_MS)
    return () => clearInterval(timer)
  }, [seconds])
  return left
}

/**
 * A friend link the server refused for a reason with a fix (Flow 15 15.19), in place of "This link didn't open":
 *
 *  - an unfinished profile: Finish my profile opens Edit profile (the link is held; the landing re-reads when you come back),
 *    and Not now closes. `H.primary` rides the primary, as the frame says;
 *  - a rate limit: Try again in 0:48, a secondary that counts down in Geist Mono and enables at zero, and Back. No haptic.
 *
 * Never names the other person: the refusal is about you and the clock.
 */
export function FriendRefusalScreen({
  refusal,
  onFinishProfile,
  onRetry,
  onClose,
  retrying = false,
}: {
  refusal: FriendRefusal
  onFinishProfile: () => void
  onRetry: () => void
  onClose: () => void
  retrying?: boolean
}) {
  const left = useCountdown(refusal.kind === 'ratelimit' ? refusal.seconds : 0)
  if (refusal.kind === 'profile') {
    const copy = FRIEND_REFUSAL.profile
    return (
      <StateScreen
        icon="user-round-pen"
        title={copy.title}
        body={copy.body}
        actions={[
          { label: copy.fix, onPress: onFinishProfile },
          { label: copy.later, kind: 'tertiary', onPress: onClose },
        ]}
        gutter
        testID="friend-refused-profile"
      />
    )
  }
  const copy = FRIEND_REFUSAL.ratelimit
  const waiting = left > 0
  return (
    <StateScreen
      icon="timer"
      title={copy.title}
      body={copy.body}
      actions={[
        waiting
          ? { label: copy.again, kind: 'secondary', onPress: onRetry, disabled: true, price: { amount: formatCountdown(left) }, accessibilityLabel: 'Try again, available when the wait ends' }
          : { label: 'Try again', kind: 'secondary', onPress: onRetry, loading: retrying },
        { label: copy.back, kind: 'tertiary', onPress: onClose },
      ]}
      gutter
      testID="friend-refused-ratelimit"
    />
  )
}

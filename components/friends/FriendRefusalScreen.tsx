import { useEffect, useState } from 'react'
import { AppState } from 'react-native'

import { FRIEND_REFUSAL, type FriendRefusal } from '../../lib/friendRefusal'
import { formatCountdown } from '../../lib/rateLimited'
import { StateScreen } from '../ds/StateScreen'

/** The wait ticks once a second, and the person is not told each tick: a screen reader reads the button's name, not the count. */
const TICK_MS = 1000

/**
 * Seconds left of a wait, counting down once a second to zero. It counts to a deadline (`Date.now() + seconds`), not by decrement:
 * a phone that was in the background, or whose timer was held, shows the wait that is really left when it comes back. A new wait
 * restarts it (adjusted during render, so it never paints stale).
 */
export function useCountdown(seconds: number, now: () => number = Date.now): number {
  const [from, setFrom] = useState(seconds)
  const [deadline, setDeadline] = useState(() => now() + seconds * 1000)
  const [, tick] = useState(0)
  if (from !== seconds) {
    setFrom(seconds)
    setDeadline(now() + seconds * 1000)
  }
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), TICK_MS)
    // Back from the background the interval may not have run: read the clock at once.
    const app = AppState.addEventListener('change', (state) => state === 'active' && tick((n) => n + 1))
    return () => {
      clearInterval(timer)
      app.remove()
    }
  }, [])
  return Math.max(0, Math.ceil((deadline - now()) / 1000))
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
          { label: copy.fix, kind: 'lit', onPress: onFinishProfile },
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
          ? { label: copy.again, kind: 'secondary', onPress: onRetry, disabled: true, price: { amount: formatCountdown(left) }, accessibilityLabel: `Try again in ${left} second${left === 1 ? '' : 's'}` }
          : { label: 'Try again', kind: 'secondary', onPress: onRetry, loading: retrying },
        { label: copy.back, kind: 'tertiary', onPress: onClose },
      ]}
      gutter
      testID="friend-refused-ratelimit"
    />
  )
}

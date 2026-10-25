import { useEffect, useState } from 'react'
import Animated from 'react-native-reanimated'

import { Banner } from '../ds/Banner'
import { bannerFadeIn, bannerIn, bannerOut } from '../motion/presence'
import { formatCountdown, RATE_LIMITED_TEXT } from '../../lib/rateLimited'
import { useReducedMotion } from '../../lib/motion'

/**
 * A read the server refused for asking too fast (guidelines/flow-15 `rateLimit`): a solid banner where the list would
 * refresh, the wait counting down in Geist Mono once a second, never "check your connection". The count changes without
 * animating and without being announced again; at zero it goes, and `onDone` reads again. It arrives on #44 (a 16 pt
 * slide and fade over `base`; Reduce Motion: the fade). No haptic: it is unsolicited.
 */
export function RateLimitedBanner({ seconds, onDone, testID }: { seconds: number; onDone?: () => void; testID?: string }) {
  const reduceMotion = useReducedMotion()
  const [left, setLeft] = useState(seconds)
  // A new refusal restarts the count (during render, so it never paints stale).
  const [from, setFrom] = useState(seconds)
  if (from !== seconds) {
    setFrom(seconds)
    setLeft(seconds)
  }
  useEffect(() => {
    const timer = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000)
    return () => clearInterval(timer)
  }, [seconds])
  useEffect(() => {
    if (left === 0) onDone?.()
  }, [left, onDone])

  if (left === 0) return null
  return (
    <Animated.View entering={reduceMotion ? bannerFadeIn : bannerIn} exiting={bannerOut}>
      <Banner kind="info" icon="timer" text={RATE_LIMITED_TEXT} mono={formatCountdown(left)} testID={testID} />
    </Animated.View>
  )
}

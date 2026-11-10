import { useEffect, useState } from 'react'
import { Easing, FadeIn, ReduceMotion } from 'react-native-reanimated'

import { SPINNER_GRACE_MS } from '../ds/shared'
import { EASING } from '../../lib/design/tokens'
import { motionTokens, useReducedMotion } from '../../lib/motion'

/**
 * The content's way in after a skeleton (DS #17: "crossfade to content over base"): the `entering` for the loaded
 * body's root, or `undefined` when no skeleton was ever drawn.
 *
 * A skeleton only appears after `SPINNER_GRACE_MS`, so the content only fades if the wait outlasted that: a load
 * that fast shows its content at once, with nothing to cross from. Reduce Motion keeps the fade (200 ms, and
 * `ReduceMotion.Never`: on the default System, Reanimated skips an entering outright, a hard cut): it is
 * opacity, not movement.
 *
 * It is the arrival only: once the fade has run its course it is `undefined` again, so a view that mounts later — a
 * list cell scrolled back into the window, the next page — appears as it is. That is what lets a list whose skeleton
 * sits in its empty slot (the chats) put `entering` on its cells.
 */
export function useSkeletonCrossfade(loading: boolean) {
  const reduceMotion = useReducedMotion()
  const duration = motionTokens(reduceMotion).duration.base
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => setDrawn(true), SPINNER_GRACE_MS)
      return () => clearTimeout(timer)
    }
    if (!drawn) return
    const timer = setTimeout(() => setDrawn(false), duration)
    return () => clearTimeout(timer)
  }, [loading, drawn, duration])
  return drawn ? FadeIn.duration(duration).easing(Easing.bezier(...EASING.gentle)).reduceMotion(ReduceMotion.Never) : undefined
}

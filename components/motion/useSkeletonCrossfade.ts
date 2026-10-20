import { useEffect, useState } from 'react'
import { Easing, FadeIn } from 'react-native-reanimated'

import { SPINNER_GRACE_MS } from '../ds/shared'
import { EASING } from '../../lib/design/tokens'
import { motionTokens, useReducedMotion } from '../../lib/motion'

/**
 * The content's way in after a skeleton (DS #17: "crossfade to content over base"): the `entering` for the loaded
 * body's root, or `undefined` when no skeleton was ever drawn.
 *
 * A skeleton only appears after `SPINNER_GRACE_MS`, so the content only fades if the wait outlasted that: a load
 * that fast shows its content at once, with nothing to cross from. Reduce Motion keeps the fade (200 ms): it is
 * opacity, not movement.
 */
export function useSkeletonCrossfade(loading: boolean) {
  const reduceMotion = useReducedMotion()
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    if (!loading) return
    const timer = setTimeout(() => setDrawn(true), SPINNER_GRACE_MS)
    return () => clearTimeout(timer)
  }, [loading])
  return drawn ? FadeIn.duration(motionTokens(reduceMotion).duration.base).easing(Easing.bezier(...EASING.gentle)) : undefined
}

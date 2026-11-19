import { useEffect, useState } from 'react'

import { litFade } from '../../lib/mapLit'
import { useReducedMotion } from '../../lib/motion'

/**
 * The lit layers' one fade-in (motion #42): 0 until there is something to light, then 1 for good, so the layer arrives
 * over `long` (200 ms under Reduce Motion) the first time and is never faded again. `opacity` is a constant a paint
 * transition can carry; a data-driven one is not transitioned by the map.
 */
export function useLitFade(hasData: boolean) {
  const reduceMotion = useReducedMotion()
  const [arrived, setArrived] = useState(false)
  // A frame after the first data is drawn at 0, so the transition has a start to run from.
  useEffect(() => {
    if (!hasData) return
    const frame = requestAnimationFrame(() => setArrived(true))
    return () => cancelAnimationFrame(frame)
  }, [hasData])
  return { opacity: arrived ? 1 : 0, transition: litFade(reduceMotion) }
}

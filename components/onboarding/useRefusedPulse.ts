import { useCallback, useEffect, useRef, useState } from 'react'

import { DURATION, SHAKE } from '../../lib/design/tokens'

/** The refusal lasts the shake and a beat over: long enough to be seen, short enough that the next one can fire. */
const PULSE_MS = SHAKE.duration + DURATION.quick

/**
 * A primary's `refused` as a moment, not a state (motion #20): `refuse()` turns it on for the length of the shake and then
 * off, so a second refusal later is a second shake. The Button owns what refusal means: its destructive edge, the shake
 * (Reduce Motion: none) and the one `H.error` at t0, so the screen plays no haptic of its own for the same failure.
 */
export function useRefusedPulse() {
  const [refused, setRefused] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), [])
  const refuse = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    setRefused(true)
    timer.current = setTimeout(() => setRefused(false), PULSE_MS)
  }, [])
  return { refused, refuse }
}

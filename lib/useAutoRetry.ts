import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'

import { AUTO_RETRY_MS, jittered } from './outage'

/**
 * The can't-reach screen's own retries (Flow 15 15.13): a chain of timeouts, each about `AUTO_RETRY_MS` away within ±20%,
 * never an interval. A try that is still running (by hand or by itself) is not stacked on; while the app is not in the
 * foreground the tick is skipped, so a backgrounded phone does not keep dialling. `attempt` is the screen's one guarded
 * retry, the same one its button presses.
 */
export function useAutoRetry(enabled: boolean, attempt: () => Promise<unknown>) {
  const latest = useRef(attempt)
  useEffect(() => {
    latest.current = attempt
  })
  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let live = true
    const schedule = () => {
      timer = setTimeout(async () => {
        if (AppState.currentState === 'active') await latest.current()
        if (live) schedule()
      }, jittered(AUTO_RETRY_MS))
    }
    schedule()
    return () => {
      live = false
      if (timer) clearTimeout(timer)
    }
  }, [enabled])
}

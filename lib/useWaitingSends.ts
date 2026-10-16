import { useCallback, useEffect, useRef } from 'react'

import { getNetworkState, subscribeNetworkState } from './networkStatus'
import { useLatest } from './useLatest'

/** R3-D5 5.8: an offline send waits this long for the connection, then is "Not sent". */
export const WAIT_FOR_CONNECTION_MS = 2 * 60 * 1000

/** Offline right now: a send waits rather than fails. */
export const isOffline = () => getNetworkState() === 'offline'

/**
 * Sends made offline (R3-D5 5.8): the bubble says "Waiting for connection"
 * (a clock, never a spinner), sends itself when the connection is back, and
 * becomes "Not sent · Tap to retry" after two minutes.
 *
 * `hold(id)` starts a send's two minutes; `waiting()` is what is still held
 * when the connection returns, and `resend` sends it; `expire(id)` marks one
 * failed.
 */
export function useWaitingSends<M>({
  waiting,
  resend,
  expire,
}: {
  waiting: () => M[]
  resend: (message: M) => void
  expire: (id: string) => void
}) {
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const latest = useLatest({ waiting, resend, expire })

  useEffect(() => {
    const held = timers.current
    const unsubscribe = subscribeNetworkState((net) => {
      if (net !== 'online') return
      held.forEach((t) => clearTimeout(t))
      held.clear()
      latest.current.waiting().forEach((m) => latest.current.resend(m))
    })
    return () => {
      unsubscribe()
      held.forEach((t) => clearTimeout(t))
      held.clear()
    }
  }, [latest])

  return useCallback(
    (id: string) => {
      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id)
          latest.current.expire(id)
        }, WAIT_FOR_CONNECTION_MS)
      )
    },
    [latest]
  )
}

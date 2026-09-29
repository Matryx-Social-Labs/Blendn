import { useCallback, useRef, useState } from 'react'

import { useLatest } from './useLatest'

/**
 * Runs an async action at most once at a time.
 *
 * A send button that is only `disabled` while a state flag is set is not a
 * guard: the flag reaches the button on the next render, and a second tap
 * dispatched before it does runs the action again. For an announcement that is a
 * second broadcast to everyone in the event chat (the iOS `Alert.prompt` had no
 * pending state at all, which is how it happened). The ref is set in the same
 * tick as the first call, so the second is refused whether or not anything has
 * re-rendered.
 *
 * `run` always calls the newest `fn`, so it can read the current form text
 * without being re-created on every keystroke. `pending` is for the spinner and
 * the disabled state; it is not what does the guarding.
 */
export function useSingleFlight<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  const inFlight = useRef(false)
  const latest = useLatest(fn)
  const [pending, setPending] = useState(false)

  const run = useCallback(
    async (...args: A): Promise<void> => {
      if (inFlight.current) return
      inFlight.current = true
      setPending(true)
      try {
        await latest.current(...args)
      } finally {
        inFlight.current = false
        setPending(false)
      }
    },
    [latest]
  )

  return { run, pending }
}

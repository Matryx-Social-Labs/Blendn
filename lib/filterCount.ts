import { useEffect, useState } from 'react'

/** A filter sheet's "Show n …" count settles this long after the last tap (BUILD-SPEC B9): a run of taps is one read. */
export const COUNT_DEBOUNCE_MS = 250

/**
 * The server's count for a sheet's draft, read once the draft has stopped changing. `key` names what the count depends on
 * (a draft change that cannot change the count, like a segment judged on the phone, leaves it alone); the number is
 * handed back only while it is the answer to the current `key`, so a stale count is never shown on a new draft.
 * `load` is the caller's own and changes with it, so it is not a dependency. Null: not known (yet, or the read failed).
 */
export function useDraftCount(visible: boolean, key: string, load: () => Promise<number | null>): number | null {
  const [counted, setCounted] = useState<{ key: string; n: number } | null>(null)
  useEffect(() => {
    if (!visible) return
    let live = true
    const timer = setTimeout(() => {
      load()
        .then((n) => live && n !== null && setCounted({ key, n }))
        .catch(() => undefined)
    }, COUNT_DEBOUNCE_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [visible, key]) // eslint-disable-line react-hooks/exhaustive-deps
  return counted?.key === key ? counted.n : null
}

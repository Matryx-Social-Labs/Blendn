import { useEffect, useState } from 'react'

/** A filter sheet's "Show n …" count settles this long after the last tap (BUILD-SPEC B9): a run of taps is one read. */
export const COUNT_DEBOUNCE_MS = 250

/**
 * The server's count for a sheet's draft, read once the draft has stopped changing. `key` names what the count depends on
 * (a draft change that cannot change the count, like a segment judged on the phone, leaves it alone). The last answer is
 * kept while the next is read, so the button's number rolls from one count to the next instead of blinking out; it is
 * dropped when the sheet closes, so a reopened sheet never shows the last visit's count.
 * `load` is the caller's own and changes with it, so it is not a dependency. `n` null: not known (yet, or the read failed).
 * `current` says the kept `n` was read for this very draft: only a current zero may disable Apply, or a stale zero would
 * block the next draft (Clear all included) until its read lands, and for good if that read fails.
 */
export function useDraftCount(
  visible: boolean,
  key: string,
  load: () => Promise<number | null>,
): { n: number | null; current: boolean } {
  const [counted, setCounted] = useState<{ key: string; n: number } | null>(null)
  useEffect(() => {
    if (!visible) {
      setCounted(null)
      return
    }
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
  return { n: counted?.n ?? null, current: counted?.key === key }
}

import { useCallback, useEffect, useRef } from 'react'

/** The Sheet's exit is ~220 ms; if the platform never reports it gone, what waited for it starts anyway. */
export const SHEET_GONE_FALLBACK_MS = 800

/**
 * Something that must wait for a Sheet to have left the screen. iOS will not
 * present a second modal over one that is still leaving, so a tray opened in
 * the same tick as the Sheet's closing is dismissed with it (the result tray
 * of "Event updated", "Couldn't send…").
 *
 * `after(next)` runs `next` once `dismissed()` is called (the Sheet's
 * `onDismissed`), or after `SHEET_GONE_FALLBACK_MS` if it never is; a second
 * `after` replaces the first, and `next` never runs twice. The caller hides
 * the Sheet itself, in the same event.
 */
export function useAfterSheet() {
  const pending = useRef<(() => void) | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismissed = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const next = pending.current
    pending.current = null
    next?.()
  }, [])

  const after = useCallback(
    (next: () => void) => {
      if (timer.current) clearTimeout(timer.current)
      pending.current = next
      timer.current = setTimeout(dismissed, SHEET_GONE_FALLBACK_MS)
    },
    [dismissed]
  )

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )
  return { after, dismissed }
}

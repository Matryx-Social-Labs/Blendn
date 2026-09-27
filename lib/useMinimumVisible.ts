import { useEffect, useRef, useState } from 'react'

export function useMinimumVisible(active: boolean, minVisibleMs: number = 650): boolean {
  const [visible, setVisible] = useState(active)
  // Stamped by the effect below, which runs on mount and on every change of `active`.
  const shownAtRef = useRef<number>(0)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Show in the same render `active` turns on, rather than one commit later from the effect.
  if (active && !visible) setVisible(true)

  useEffect(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }

    if (active) {
      shownAtRef.current = Date.now()
      return
    }

    if (!visible) return

    const elapsed = Date.now() - shownAtRef.current
    const remaining = Math.max(0, minVisibleMs - elapsed)
    if (remaining === 0) {
      setVisible(false)
      return
    }

    hideTimerRef.current = setTimeout(() => {
      setVisible(false)
      hideTimerRef.current = null
    }, remaining)

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
    }
  }, [active, minVisibleMs, visible])

  return visible
}

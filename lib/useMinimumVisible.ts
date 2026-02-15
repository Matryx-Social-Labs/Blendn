import { useEffect, useRef, useState } from 'react'

export function useMinimumVisible(active: boolean, minVisibleMs: number = 650): boolean {
  const [visible, setVisible] = useState(active)
  const shownAtRef = useRef<number>(active ? Date.now() : 0)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }

    if (active) {
      shownAtRef.current = Date.now()
      setVisible(true)
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

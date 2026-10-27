import { useFocusEffect } from 'expo-router'
import { useCallback, useRef } from 'react'

/**
 * Motion #29 (unread to read): rooms opened from a list are remembered, and `clear` runs with them when the list is
 * focused again, so the unread dot leaves where it is seen rather than behind the screen that covered it. A hook, so
 * the ref stays out of the screen's render.
 */
export function useReadOnReturn(clear: (opened: ReadonlySet<string>) => void): (id: string) => void {
  const opened = useRef<ReadonlySet<string>>(new Set())
  useFocusEffect(
    useCallback(() => {
      const ids = opened.current
      if (!ids.size) return
      opened.current = new Set()
      clear(ids)
    }, [clear])
  )
  return useCallback((id: string) => {
    opened.current = new Set(opened.current).add(id)
  }, [])
}

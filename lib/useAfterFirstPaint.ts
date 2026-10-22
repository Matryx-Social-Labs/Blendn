import { useEffect, useState } from 'react'
import { InteractionManager } from 'react-native'

/**
 * False for the first frames of a screen, true once they have been painted.
 *
 * A heavy native view (the home map's GL surface) created in the same commit as the screen holds the UI thread until it is
 * ready, and on a slow device the whole screen, skeleton included, stays blank behind it: Android sign-in showed ink for 15 s
 * between the form going and the home arriving. Mounting that view one paint later puts the skeleton on screen first.
 * Two animation frames pass (the commit, then its paint), then any running transition finishes.
 */
export function useAfterFirstPaint(): boolean {
  const [painted, setPainted] = useState(false)
  useEffect(() => {
    let cancelled = false
    let task: { cancel: () => void } | null = null
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        task = InteractionManager.runAfterInteractions(() => {
          if (!cancelled) setPainted(true)
        })
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      task?.cancel()
    }
  }, [])
  return painted
}

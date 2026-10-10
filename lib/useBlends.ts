import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'

import type { Blend } from './crews'
import { crewsApi } from './crewsApi'

/**
 * Your open Blends (`GET /blends`), read on focus.
 *
 * A Blend closes on the server's clock (12 h after the night ends), when a
 * side's crew dissolves or is hidden, or for one pair when a block lands —
 * so it is re-read whenever the screen showing it comes back, never kept.
 * A failed read keeps what is on screen: an empty list would say "no Blends"
 * about a network error.
 */
export function useBlends(): { blends: Blend[]; loaded: boolean; failed: boolean; reload: () => Promise<void> } {
  const [blends, setBlends] = useState<Blend[]>([])
  const [loaded, setLoaded] = useState(false)
  /** The last read failed: a screen must not read "closed" into a network error. */
  const [failed, setFailed] = useState(false)

  const reload = useCallback(async () => {
    const result = await crewsApi.blends()
    if (result.success && result.data) {
      setBlends(result.data.blends)
      setFailed(false)
    } else {
      setFailed(true)
    }
    setLoaded(true)
  }, [])

  useFocusEffect(
    useCallback(() => {
      void reload()
    }, [reload])
  )

  return { blends, loaded, failed, reload }
}

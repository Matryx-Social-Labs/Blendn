import { useEffect, useState } from 'react'

import { subscribePhoneZone } from './time'

/**
 * Re-render once a `period`, for labels that age ("In 25 min"), and at once when the phone's zone moves (R6-7): a clock
 * label in the phone's zone is stale the moment it does. A render never reads the clock itself.
 */
export function useNow(period: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), period)
    const unsubscribe = subscribePhoneZone(() => setNow(Date.now()))
    return () => {
      clearInterval(id)
      unsubscribe()
    }
  }, [period])
  return now
}

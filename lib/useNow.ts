import { useEffect, useState } from 'react'

/** Re-render once a `period`, for labels that age ("In 25 min"). A render never reads the clock itself. */
export function useNow(period: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), period)
    return () => clearInterval(id)
  }, [period])
  return now
}

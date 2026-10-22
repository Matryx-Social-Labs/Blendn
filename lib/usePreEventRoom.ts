import { opensInLabel } from './preEventRoom'
import { serverOffset } from './serverClock'
import { useNow } from './useNow'

const MINUTE = 60 * 1000
/** A room with no start (a crew's, a Blend's, a place's) never counts down: its clock is set so far out it never fires. */
const NEVER = 24 * 60 * MINUTE

/**
 * How long until this event's room opens ("3h 20m"), by the server's clock, ticking once a minute; null once it is
 * open or when the start is not known (Flow 15 #8: "Opens in" goes back to the count with no ceremony).
 * ponytail: ticks every minute for every event room, a render each; stop the interval when open if that ever shows up.
 */
export function usePreEventRoom(startTime: string | null | undefined): string | null {
  const now = useNow(startTime ? MINUTE : NEVER)
  return opensInLabel(startTime, now + serverOffset())
}

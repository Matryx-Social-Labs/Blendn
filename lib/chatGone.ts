import { BLEND_CLOSED_LINE, CREW_GONE_LINE, CREW_REMOVED_LINE } from './crews'
import type { GoneKind } from './goneCopy'

/**
 * A closed crew or Blend room is Flow 15 #11's card, never a read-only room (R4.1 10.3 · C4, C21): the server refuses
 * both once they close, so a stale link or push opens the card and "Back" goes to the Banter. `closedLine` is what
 * `roomClosedLine` answered; the removed-you line is a different state (you are gone, the crew is not) and stays its own.
 */
export function goneKindFor(closedLine: string): GoneKind | null {
  if (closedLine === BLEND_CLOSED_LINE) return 'blend'
  if (closedLine === CREW_GONE_LINE) return 'crew'
  return null
}

/** Whether a closed line is "you are no longer in this crew's chat" (USER_BANNED written into a crew room). */
export const isRemovedFromCrew = (closedLine: string) => closedLine === CREW_REMOVED_LINE

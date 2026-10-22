import { apiClient } from './apiClient'
import { eventTarget, type ShareSource } from './shareEvent'
import { shareability } from './shareLinks'
import { openShare } from './shareTray'
import { toast } from './toast'

const CANT_SHARE = "This one can’t be shared."
const CANT_OPEN = "Couldn’t open sharing. Try again."

/**
 * Shares an event from a place that has only a row: a Going card, the Pulse's peek. A row that says its visibility is
 * used as it is; one that does not (the favourites and RSVP lists) is asked of the event itself first, because
 * whether it may be shared is the event's, not the list's. Resolves like `openShare`.
 */
export async function shareEvent(source: ShareSource): Promise<boolean> {
  let known: ShareSource = source
  if (shareability(source) === 'unknown') {
    try {
      const result = await apiClient.getEvent(source.id)
      if (!result.success || !result.data) throw new Error(result.error || 'event not loaded')
      known = { ...source, ...result.data }
    } catch {
      toast(CANT_OPEN, 'error')
      return false
    }
  }
  const target = eventTarget(known)
  if (!target) {
    toast(CANT_SHARE, 'info')
    return false
  }
  return openShare(target)
}

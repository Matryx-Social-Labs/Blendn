import { useEffect, useRef, useSyncExternalStore } from 'react'

import { blockEpoch, subscribeBlocks } from './blockEpoch'
import { useLatest } from './useLatest'

/**
 * Runs `onBlock` each time this phone blocks somebody, from anywhere (`lib/blockEpoch.ts`), but not on mount. A screen
 * that holds pages it has already drawn uses it to start over from the server, which now leaves that person out: a
 * block made on another screen (Room info, a profile) must purge this one too, though it never saw the tap.
 */
export function useOnBlock(onBlock: () => void): void {
  const epoch = useSyncExternalStore(subscribeBlocks, blockEpoch)
  const seen = useRef(epoch)
  const latest = useLatest(onBlock)
  useEffect(() => {
    if (seen.current === epoch) return
    seen.current = epoch
    latest.current()
  }, [epoch, latest])
}

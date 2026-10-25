/**
 * Moves each time this phone blocks somebody. A list that is loaded a page at a time keeps the older pages it has
 * drawn; a block anywhere (a room's card, a profile, a request) must take that person out of them, which the next
 * refresh of the newest page cannot do. Such a list watches this and starts over from the server, which now leaves
 * them out (`useBanterInbox`).
 */
let epoch = 0
const listeners = new Set<() => void>()

export const blockEpoch = () => epoch

export function noteBlocked(): void {
  epoch += 1
  listeners.forEach((listener) => listener())
}

export function subscribeBlocks(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Your status on an event changed (an RSVP, a cancelled RSVP, a save): the one place the writers announce it, so what is
 * built on that status judges again right away (the centre button's fence and plan, `useRoomSignalSource`). A leaf module,
 * because `apiClient` announces and the listeners import `apiClient`.
 */
const listeners = new Set<() => void>()

export function emitEventStatusChanged(): void {
  for (const fn of listeners) fn()
}

export function subscribeEventStatusChanged(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

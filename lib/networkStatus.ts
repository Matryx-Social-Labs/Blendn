/**
 * Lightweight network status tracker.
 * Updated by apiClient on network errors/successes — no native modules needed.
 */

export type NetworkState = 'online' | 'offline' | 'unknown'

let _state: NetworkState = 'unknown'
const _listeners = new Set<(s: NetworkState) => void>()

function _emit(next: NetworkState) {
  if (_state === next) return
  _state = next
  _listeners.forEach((fn) => {
    try { fn(next) } catch {}
  })
}

/** Timeouts in a row with no answer between: airplane mode held in the foreground times out instead of failing fast (SCRUM-898). */
export const OFFLINE_AFTER_TIMEOUTS = 2
let _timeoutsInARow = 0

export function markOnline() {
  _timeoutsInARow = 0
  _emit('online')
}

/**
 * A request gave up on its deadline. One is a slow endpoint and says nothing about the network; `OFFLINE_AFTER_TIMEOUTS` in a row
 * with no answer between is a network that carries nothing. The next success (`markOnline`) clears it.
 * ponytail: counts every request alike, so two hung calls at once also mark offline; the next answer puts it right.
 */
export function markTimeout() {
  _timeoutsInARow += 1
  if (_timeoutsInARow >= OFFLINE_AFTER_TIMEOUTS) _emit('offline')
}

export function markOffline() {
  _emit('offline')
}

export function getNetworkState(): NetworkState {
  return _state
}

export function subscribeNetworkState(fn: (s: NetworkState) => void): () => void {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}

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

export function markOnline() {
  _emit('online')
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

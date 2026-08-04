/**
 * Lightweight pub/sub so apiClient can announce an involuntary session end
 * (refresh token rejected/expired) without importing useAuth — useAuth
 * imports apiClient, so the reverse import would be circular.
 */

const _listeners = new Set<() => void>()

export function markSessionExpired() {
  _listeners.forEach((fn) => {
    try { fn() } catch {}
  })
}

export function subscribeSessionExpired(fn: () => void): () => void {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}

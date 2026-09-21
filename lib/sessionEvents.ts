/**
 * Lightweight pub/sub so apiClient can announce an involuntary session end
 * (refresh token rejected/expired) without importing useAuth — useAuth
 * imports apiClient, so the reverse import would be circular.
 *
 * The reason is also kept, durably: a session the server ended overnight
 * leaves the phone at the entry screen with no explanation, and the app
 * process that saw the 401 is usually not the one that shows the screen.
 * The entry screen reads it once and says "You were signed out".
 *
 * AsyncStorage is loaded at call time, not import time: `useAuth` imports
 * this module, and under jest's node environment the native module is null
 * the moment it is imported — every suite that touches auth would fall over
 * for a flag it never reads.
 */

const _listeners = new Set<() => void>()
const ENDED_KEY = 'blendn.session.endedByServer'
const storage = () => import('@react-native-async-storage/async-storage').then((m) => m.default)

export function markSessionExpired() {
  storage()
    .then((s) => s.setItem(ENDED_KEY, '1'))
    .catch(() => {})
  _listeners.forEach((fn) => {
    try { fn() } catch {}
  })
}

export function subscribeSessionExpired(fn: () => void): () => void {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}

/** True once, for the visit that follows a session the server ended. */
export async function consumeSessionEndedNotice(): Promise<boolean> {
  try {
    const s = await storage()
    const ended = (await s.getItem(ENDED_KEY)) === '1'
    if (ended) await s.removeItem(ENDED_KEY)
    return ended
  } catch {
    return false
  }
}

/** What the entry screen says. Plain: what happened, and what to do. */
export const SESSION_ENDED_NOTICE = 'You were signed out. Sign in again to pick up where you left off.'

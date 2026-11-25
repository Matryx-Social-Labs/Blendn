import AsyncStorage from '@react-native-async-storage/async-storage'

import { apiClient } from './apiClient'
import { Logger } from './logger'

/**
 * Before SCRUM-1115 the phone kept when you last saw each Lobby. The server keeps it now (`apiClient.markBoardSeen`), so
 * the markers this phone kept go up once, before Going reads its counts, and a Lobby already read does not turn new on
 * upgrade (decided per advisor, task 18). Then the phone keeps none.
 *
 * ponytail: delete this file once no phone can still hold the old key (a release or two after this one).
 */
const KEY = 'blendn.lobby.seen'

let once: Promise<void> | null = null

/** Posts the old markers once per launch at most; concurrent callers share the one upload. */
export function postPhoneLobbyMarkers(): Promise<void> {
  once ??= upload().catch((error) => {
    // Kept for the next read: a marker posted twice is harmless, the server's only moves forward.
    once = null
    Logger.warn('board', 'Could not post the Lobby markers this phone kept', { error: error as never })
  })
  return once
}

async function upload(): Promise<void> {
  const raw = await AsyncStorage.getItem(KEY)
  if (!raw) return
  const parsed: unknown = JSON.parse(raw)
  const pairs = (Array.isArray(parsed) ? parsed : []).filter(
    (p): p is [string, string] => Array.isArray(p) && typeof p[0] === 'string' && typeof p[1] === 'string'
  )
  const answers = await Promise.all(pairs.map(([eventId, at]) => apiClient.markBoardSeen(eventId, at)))
  // A Lobby that refuses (closed, not yours) has answered; only no answer at all (offline, a timeout) keeps them.
  if (answers.some((r) => !r.success && !r.errorCode)) throw new Error('no answer')
  await AsyncStorage.removeItem(KEY)
}

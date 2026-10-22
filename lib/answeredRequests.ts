import AsyncStorage from '@react-native-async-storage/async-storage'

import { Logger } from './logger'

/**
 * The requests this person has answered from the Notifications screen.
 *
 * The server keeps a request's row after it is answered (until retention takes it), so without this an
 * accepted friend request came back as "Waiting on you" the next time the screen opened, and went stale on
 * the tap. An accepted one stays as history; a declined one leaves the list for good (there is no decline
 * state anywhere, Flow 9 · 9.2). Remembered per phone, capped; the server saying a row is no longer open
 * (`open: false`, see `NotificationItem`) makes it redundant.
 *
 * ponytail: per phone, not per account; ids are uuids, so a second account on the phone just never matches.
 */
export type Outcome = 'accepted' | 'declined'

const KEY = 'blendn.notifications.answered'
const CAP = 100

export async function readAnswered(): Promise<Map<string, Outcome>> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    const pairs = Array.isArray(parsed) ? parsed : []
    return new Map(
      pairs.filter((p): p is [string, Outcome] => Array.isArray(p) && typeof p[0] === 'string' && (p[1] === 'accepted' || p[1] === 'declined'))
    )
  } catch (error) {
    Logger.warn('notifications', 'Could not read the answered requests', { error: error as never })
    return new Map()
  }
}

export async function rememberAnswered(id: string, outcome: Outcome): Promise<void> {
  try {
    const answered = await readAnswered()
    answered.delete(id)
    answered.set(id, outcome)
    await AsyncStorage.setItem(KEY, JSON.stringify([...answered].slice(-CAP)))
  } catch (error) {
    Logger.warn('notifications', 'Could not remember an answered request', { error: error as never })
  }
}

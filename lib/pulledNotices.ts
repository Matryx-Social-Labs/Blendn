import AsyncStorage from '@react-native-async-storage/async-storage'

import { Logger } from './logger'
import type { PulledPhoto } from './photoStates'

/**
 * Which pulled-photo notices this person has dealt with (`photo_states` lists a pull for seven days, with no way to say "seen"):
 * dismissed on its tile, or replaced by a different photo. Kept per account on this phone, under `pulled:<userId>`, as the
 * `pulled_at` of each, so the same notice is not drawn again on Me or in Edit profile until the server stops listing it.
 * ponytail: per phone, not per account on the server; a `seen` column and a PUT would carry it across phones.
 */
const key = (userId: string) => `pulled:${userId}`
/** More than a week of pulls is not a thing; the list is cut here so it cannot grow for good. */
const KEEP = 50
const stamp = (p: PulledPhoto) => p.pulledAt ?? ''

async function seen(userId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(key(userId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : []
  } catch (error) {
    Logger.warn('profile', 'pulledNotices: read failed', { error: error as never })
    return []
  }
}

/** The notices not yet dismissed or replaced. A read that fails shows them all: a notice twice is better than none. */
export async function unseenPulled(userId: string, pulled: readonly PulledPhoto[]): Promise<PulledPhoto[]> {
  if (pulled.length === 0) return []
  const done = new Set(await seen(userId))
  return pulled.filter((p) => !done.has(stamp(p)))
}

/** This notice is dealt with: it is not drawn again. */
export async function markPulledSeen(userId: string, pulled: PulledPhoto): Promise<void> {
  try {
    const done = await seen(userId)
    if (done.includes(stamp(pulled))) return
    await AsyncStorage.setItem(key(userId), JSON.stringify([...done, stamp(pulled)].slice(-KEEP)))
  } catch (error) {
    Logger.warn('profile', 'pulledNotices: write failed', { error: error as never })
  }
}

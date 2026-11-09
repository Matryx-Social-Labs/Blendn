import AsyncStorage from '@react-native-async-storage/async-storage'

import { Logger } from './logger'

/**
 * When you last saw each Lobby: the newest post's time (the server's clock) on the page the Lobby showed you. Going's
 * "New in the Lobby" counts what came after it (`lobbyNews`). Per phone, the most recent events only.
 *
 * ponytail: per phone, not per account; a server-side marker when the badge must follow you to another phone.
 */
const KEY = 'blendn.lobby.seen'
const CAP = 50

async function readAll(): Promise<Map<string, string>> {
  const raw = await AsyncStorage.getItem(KEY)
  const parsed: unknown = raw ? JSON.parse(raw) : []
  const pairs = Array.isArray(parsed) ? parsed : []
  return new Map(pairs.filter((p): p is [string, string] => Array.isArray(p) && typeof p[0] === 'string' && typeof p[1] === 'string'))
}

export async function lobbySeenAt(eventId: string): Promise<string | null> {
  try {
    return (await readAll()).get(eventId) ?? null
  } catch (error) {
    Logger.warn('board', 'Could not read when the Lobby was seen', { error: error as never })
    return null
  }
}

export async function rememberLobbySeen(eventId: string, at: string): Promise<void> {
  try {
    const seen = await readAll()
    const was = seen.get(eventId)
    if (was && Date.parse(was) >= Date.parse(at)) return
    seen.delete(eventId)
    seen.set(eventId, at)
    await AsyncStorage.setItem(KEY, JSON.stringify([...seen].slice(-CAP)))
  } catch (error) {
    Logger.warn('board', 'Could not remember the Lobby as seen', { error: error as never })
  }
}

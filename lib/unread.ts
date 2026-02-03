import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

const STORAGE_KEY = 'unread:lastReadMap:v1'

export interface LastReadMap {
  [conversationId: string]: string // ISO timestamp
}

export async function getLastReadMap(): Promise<LastReadMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

export async function setConversationLastRead(conversationId: string, whenIso?: string): Promise<void> {
  try {
    const map = await getLastReadMap()
    map[conversationId] = whenIso || new Date().toISOString()
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {}
}

export async function computeUnreadCounts(conversationIds: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  if (!conversationIds || conversationIds.length === 0) return counts

  const lastReadMap = await getLastReadMap()

  // If no last-read info yet, default to 0 for all
  const hasAny = Object.keys(lastReadMap).length > 0
  if (!hasAny) {
    for (const id of conversationIds) counts[id] = 0
    return counts
  }

  const entries = conversationIds.map(async (id) => {
    const lastRead = lastReadMap[id]
    if (!lastRead) return { id, count: 0 }

    const { error, count } = await supabase
      .from('private_messages')
      // Only request counts to avoid fetching full message rows
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', id)
      .gt('created_at', lastRead)

    if (error) return { id, count: 0 }
    return { id, count: count || 0 }
  })

  const results = await Promise.all(entries)
  for (const { id, count } of results) counts[id] = count
  return counts
}


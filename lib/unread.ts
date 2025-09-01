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

  // Find the earliest last-read to bound the query
  const readTimes: string[] = []
  for (const id of conversationIds) {
    const t = lastReadMap[id]
    if (t) readTimes.push(t)
  }
  if (readTimes.length === 0) {
    for (const id of conversationIds) counts[id] = 0
    return counts
  }

  const minReadIso = readTimes.sort()[0]

  // Fetch messages newer than the earliest last-read across these conversations
  const { data, error } = await supabase
    .from('private_messages')
    .select('conversation_id, created_at')
    .in('conversation_id', conversationIds)
    .gt('created_at', minReadIso)

  if (error) {
    for (const id of conversationIds) counts[id] = 0
    return counts
  }

  const list = Array.isArray(data) ? data : []
  for (const id of conversationIds) counts[id] = 0
  for (const row of list as any[]) {
    const cid = String(row.conversation_id)
    const lastRead = lastReadMap[cid]
    if (lastRead && new Date(row.created_at).getTime() > new Date(lastRead).getTime()) {
      counts[cid] = (counts[cid] || 0) + 1
    }
  }

  return counts
}



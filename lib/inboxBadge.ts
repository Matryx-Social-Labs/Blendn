import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'

import { apiClient } from './apiClient'
import { iconBadgeFor, setAppIconBadge } from './appBadge'
import { Logger } from './logger'
import { subscribeToBell } from './socketClient'

/**
 * What the feed says is waiting, read once and shared (BAR-02): the bell's badge is `unreadCount` (its own rows), the app icon
 * is `badgeCount` (rows plus the conversations with something unread from the other person), so the Banter tab's dot is the
 * difference: `badgeCount - unreadCount` (blendn-admin `app/api/mobile/notifications/route.ts`). One request is enough: the feed
 * carries the counts beside the row the bell asks for.
 */
export type InboxBadge = { unreadCount: number; badgeCount: number | null }

const EMPTY: InboxBadge = { unreadCount: 0, badgeCount: null }
let current = EMPTY
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

const set = (next: InboxBadge) => {
  if (next.unreadCount === current.unreadCount && next.badgeCount === current.badgeCount) return
  current = next
  listeners.forEach((l) => l())
}

/** Conversations with something unread, from the other side: what the Banter tab's dot says. An older server sends no `badgeCount`: none. */
export const banterUnread = (b: InboxBadge): number => (b.badgeCount === null ? 0 : Math.max(0, b.badgeCount - b.unreadCount))

/** Read the counts; calls while a read is out share it. A failed read keeps the last answer. */
export function refreshInboxBadge(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const result = await apiClient.getNotifications({ limit: 1 })
      if (result.success && result.data) {
        const badgeCount = iconBadgeFor(result.data)
        set({ unreadCount: result.data.unreadCount, badgeCount })
        void setAppIconBadge(badgeCount)
      }
    } catch (error) {
      Logger.warn('notifications', 'count:failed', { error: error as never })
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/** Opening the bell marks its rows seen: they leave both counts, the conversations stay. */
export const markBellRead = () => set({ unreadCount: 0, badgeCount: current.badgeCount === null ? null : Math.max(0, current.badgeCount - current.unreadCount) })

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
    // Nobody is looking: a later mount starts from nothing, not from a signed-out account's numbers.
    if (listeners.size === 0) current = EMPTY
  }
}

export const useInboxBadge = (): InboxBadge => useSyncExternalStore(subscribe, () => current)

/**
 * The triggers, one set for every subscriber (calls share a read): on mount, the moment a row lands on your own socket room
 * (the server's count, never a local +1), and when the app comes back to the front.
 */
export function useInboxBadgeSync(): void {
  useEffect(() => subscribeToBell(() => void refreshInboxBadge()), [])
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refreshInboxBadge()
    })
    return () => sub.remove()
  }, [])
  useEffect(() => void refreshInboxBadge(), [])
}

/** The bell also looks whenever its tab comes into view (`useFocusEffect(useRefreshOnFocus())`). */
export const useRefreshInboxBadge = () => useCallback(() => void refreshInboxBadge(), [])

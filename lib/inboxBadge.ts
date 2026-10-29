import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'

import { apiClient } from './apiClient'
import { iconBadgeFor, setAppIconBadge } from './appBadge'
import { Logger } from './logger'
import { subscribeToBell, subscribeToUserNotifications } from './socketClient'

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
/** A trigger landed while a read was out: that read may predate it, so one more follows. */
let again = false
/** Bumped on sign-out: a read begun for the last account paints nothing. */
let generation = 0
const listeners = new Set<() => void>()

const set = (next: InboxBadge) => {
  if (next.unreadCount === current.unreadCount && next.badgeCount === current.badgeCount) return
  current = next
  listeners.forEach((l) => l())
}

/** Conversations with something unread, from the other side: what the Banter tab's dot says. An older server sends no `badgeCount`: none. */
export const banterUnread = (b: InboxBadge): number => (b.badgeCount === null ? 0 : Math.max(0, b.badgeCount - b.unreadCount))

const readOnce = async (mine: number) => {
  try {
    const result = await apiClient.getNotifications({ limit: 1 })
    if (mine !== generation) return
    if (result.success && result.data) {
      const badgeCount = iconBadgeFor(result.data)
      set({ unreadCount: result.data.unreadCount, badgeCount })
      void setAppIconBadge(badgeCount)
    }
  } catch (error) {
    Logger.warn('notifications', 'count:failed', { error: error as never })
  }
}

/** Read the counts; a trigger while a read is out shares it and earns exactly one follow-up. A failed read keeps the last answer. */
export function refreshInboxBadge(): Promise<void> {
  if (inflight) {
    again = true
    return inflight
  }
  const mine = generation
  inflight = (async () => {
    try {
      await readOnce(mine)
      while (again && mine === generation) {
        again = false
        await readOnce(mine)
      }
    } finally {
      if (mine === generation) inflight = null
    }
  })()
  return inflight
}

/** Sign-out: the next account starts from nothing, and a read still out for this one is dropped. */
export function resetInboxBadge(): void {
  generation += 1
  inflight = null
  again = false
  clearTimeout(dmTimer ?? undefined)
  dmTimer = null
  set(EMPTY)
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

let dmTimer: ReturnType<typeof setTimeout> | null = null
const DM_READ_DELAY_MS = 2000
/** A burst of messages is one read, a moment after the first: the count is the server's, and it needs the message stored. */
function scheduleDmRead(): void {
  if (dmTimer) return
  dmTimer = setTimeout(() => {
    dmTimer = null
    void refreshInboxBadge()
  }, DM_READ_DELAY_MS)
}

/**
 * The triggers, one set for every subscriber (calls share a read): on mount, the moment a row lands on your own socket room
 * (the server's count, never a local +1), and when the app comes back to the front.
 */
export function useInboxBadgeSync(userId?: string | null): void {
  useEffect(() => subscribeToBell(() => void refreshInboxBadge()), [])
  // A DM never rings the bell (the server keeps `private_message` out of it); it arrives on your own room as `private:message`.
  useEffect(() => (userId ? subscribeToUserNotifications(userId, scheduleDmRead) : undefined), [userId])
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

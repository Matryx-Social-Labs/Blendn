import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'

import { apiClient } from './apiClient'
import { iconBadgeFor, setAppIconBadge } from './appBadge'
import { BOARD_ENABLED, inboxRequests } from './board'
import { Logger } from './logger'
import { markDomainsDirty } from './liveSyncState'
import { isTalkAskKind } from './notificationRows'
import { forgetMessageRequests, forgetPersonalChats } from './queryCache'
import { subscribeToBell, subscribeToUserNotifications } from './socketClient'

/**
 * What is waiting, read once and shared (BAR-02), split by where an ask leads (requests placement A, board 03):
 *
 * - **The bell** counts unseen Notifications rows that are not talk-asks (`bell`). A message request, a Lobby ask or a
 *   reveal ask is a plain history line there, so it never lights the bell.
 * - **The Banter tab's dot** counts the conversations with something unread from the other person (`badgeCount -
 *   unreadCount`, blendn-admin `app/api/mobile/notifications/route.ts`) plus the talk-asks waiting: message requests and
 *   Lobby asks.
 *
 * ponytail: the server still counts talk-ask rows in `unreadCount` (its split is ROADMAP § Backend later), so the bell is
 * derived here from the newest `BELL_PAGE` unseen rows. Past a page it is a floor (the talk-asks among the rest are unknown),
 * never a double count; the "9+" badge hides that unless a page holds fewer than ten other rows.
 */
export type InboxBadge = {
  /** The server's unseen rows, talk-asks included: only `banterUnread` reads it, to take it off `badgeCount`. */
  unreadCount: number
  badgeCount: number | null
  /** The bell's number: unseen rows that are not talk-asks. */
  bell: number
  /** Message requests waiting on you (`GET /message-requests?status=pending`'s `totalCount`). */
  messageRequests: number
  /** Lobby asks waiting on you (`GET /board/requests`, the live incoming ones). */
  lobbyAsks: number
}

/** The unseen rows read to derive the bell: the Notifications page, so one size is cached and measured. */
export const BELL_PAGE = 30

const EMPTY: InboxBadge = { unreadCount: 0, badgeCount: null, bell: 0, messageRequests: 0, lobbyAsks: 0 }
let current = EMPTY
let inflight: Promise<void> | null = null
/** A trigger landed while a read was out: that read may predate it, so one more follows. */
let again = false
/** Bumped on sign-out: a read begun for the last account paints nothing. */
let generation = 0
const listeners = new Set<() => void>()

const set = (next: InboxBadge) => {
  if ((Object.keys(next) as (keyof InboxBadge)[]).every((k) => next[k] === current[k])) return
  current = next
  listeners.forEach((l) => l())
}

/** The Banter tab's dot: unread conversations from the other side (none from an older server) plus the talk-asks waiting. */
export const banterUnread = (b: InboxBadge): number =>
  (b.badgeCount === null ? 0 : Math.max(0, b.badgeCount - b.unreadCount)) + b.messageRequests + b.lobbyAsks

/** The bell from a page of unseen rows: exact when the page is all of them, else the floor of what it holds. */
export function bellFrom(unreadCount: number, page: readonly { kind: string }[], hasMore: boolean): number {
  const talk = page.filter((n) => isTalkAskKind(n.kind)).length
  return hasMore ? page.length - talk : Math.max(0, unreadCount - talk)
}

const readOnce = async (mine: number) => {
  try {
    const result = await apiClient.getNotifications({ unreadOnly: true, limit: BELL_PAGE })
    if (mine !== generation) return
    if (result.success && result.data) {
      const { unreadCount, notifications, pagination } = result.data
      const badgeCount = iconBadgeFor(result.data)
      // A feed without its rows (an older or odd answer) counts none of them as talk-asks: the count is still the server's.
      set({ ...current, unreadCount, badgeCount, bell: bellFrom(unreadCount, notifications ?? [], pagination?.hasMore ?? false) })
      void setAppIconBadge(badgeCount)
    }
  } catch (error) {
    Logger.warn('notifications', 'count:failed', { error: error as never })
  }
}

/** What a surface that holds the talk-asks already knows (the Banter's list, its Lobby section): the dot follows it at once. */
export function publishTalkAsks(counts: Partial<Pick<InboxBadge, 'messageRequests' | 'lobbyAsks'>>): void {
  set({ ...current, ...counts })
}

/** The talk-asks waiting, read from their own routes; a failed read keeps the last answer. */
export async function refreshTalkAsks(): Promise<void> {
  const mine = generation
  const read = async <T,>(call: () => Promise<T>): Promise<T | null> => {
    try {
      return await call()
    } catch (error) {
      Logger.warn('notifications', 'talk-asks:failed', { error: error as never })
      return null
    }
  }
  const [requests, lobby] = await Promise.all([
    read(() => apiClient.getMessageRequests({ status: 'pending', limit: 1 }, { force: true })),
    BOARD_ENABLED ? read(() => apiClient.getBoardRequests()) : null,
  ])
  if (mine !== generation) return
  const counts: Partial<InboxBadge> = {}
  if (requests?.success && requests.data) counts.messageRequests = requests.data.totalCount ?? requests.data.requests.length
  if (lobby?.success && lobby.data) counts.lobbyAsks = inboxRequests(lobby.data).incoming.length
  if (!BOARD_ENABLED) counts.lobbyAsks = 0
  publishTalkAsks(counts)
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
export const markBellRead = () =>
  set({ ...current, unreadCount: 0, bell: 0, badgeCount: current.badgeCount === null ? null : Math.max(0, current.badgeCount - current.unreadCount) })

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
  useEffect(
    () =>
      subscribeToBell((row) => {
        // A message request has no socket event of its own, only this row: the Banter's list is stale until it reads again (its next sync then goes to the server).
        if (row?.kind === 'message_request') forgetMessageRequests()
        // A talk-ask moves the Banter dot, never the bell (requests placement A).
        if (row && isTalkAskKind(row.kind)) void refreshTalkAsks()
        // Your request was answered: an accept made the conversation on the server, and only this row says so. People reads again, now.
        if (row?.kind === 'message_request_response') {
          forgetPersonalChats()
          markDomainsDirty(['chat'])
        }
        void refreshInboxBadge()
      }),
    []
  )
  // A DM never rings the bell (the server keeps `private_message` out of it); it arrives on your own room as `private:message`.
  useEffect(() => (userId ? subscribeToUserNotifications(userId, scheduleDmRead) : undefined), [userId])
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void refreshInboxBadge()
        void refreshTalkAsks()
      }
    })
    return () => sub.remove()
  }, [])
  useEffect(() => {
    void refreshInboxBadge()
    void refreshTalkAsks()
  }, [])
}

/** The bell also looks whenever its tab comes into view (`useFocusEffect(useRefreshOnFocus())`). */
export const useRefreshInboxBadge = () => useCallback(() => void refreshInboxBadge(), [])

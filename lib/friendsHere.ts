import { router } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'

import { apiClient } from './apiClient'
import { Logger } from './logger'
import { subscribeConnectionStatus, subscribeToRoomFriends } from './socketClient'
import { useLatest } from './useLatest'

/**
 * Friends here (plans/friends-in-room.md, C1): the friends who are at this
 * event and let friends see them, shown as their own section in the Room.
 * Real names and photos, keyed by real user id, never by room handle: this is
 * the one place a friend is a person in a room.
 */
export interface FriendHere {
  userId: string
  name: string
  photo: string | null
}

/** The Room reads 8 and draws 3 rows plus 5 faces (plan 9.1). */
export const FRIENDS_FIRST_PAGE = 8
/** Rows in the section before "N more here". */
export const FRIEND_ROWS = 3
/** Faces in the overflow row. */
export const FRIEND_OVERFLOW_FACES = 5
/** `room:friends` carries no data, so a burst of them is one read. */
export const FRIENDS_REFETCH_MS = 1000

export interface FriendsHereState {
  friends: FriendHere[]
  /** Every friend listed for you here, not just this page: the count tells the truth (no five-floor, plan D16). */
  total: number
  /** The first read has answered (or failed). */
  loaded: boolean
  /** The section appeared after the first read, not with it: say so once. Counts appearances. */
  appearances: number
  refresh: () => Promise<void>
}

/**
 * The first page, read with the Room and again on `room:friends` (debounced 1 s),
 * on a reconnect and on `refresh`. A failed read keeps the last good page, so a
 * dead network never empties the section. An older server answers 404 before
 * there is a page: there is no section, and nothing says so.
 */
export function useFriendsHere(eventId: string | null, inRoom: boolean): FriendsHereState {
  const [page, setPage] = useState<{ eventId: string; friends: FriendHere[]; total: number } | null>(null)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [appearances, setAppearances] = useState(0)
  const ask = useRef(0)
  const lastTotal = useLatest(page?.eventId === eventId ? (page?.total ?? 0) : 0)
  const loadedNow = useLatest(loadedFor === eventId)

  const read = useCallback(async () => {
    if (!eventId) return
    const mine = ++ask.current
    try {
      const r = await apiClient.getFriendsHere(eventId, { order: 'recent', limit: FRIENDS_FIRST_PAGE })
      if (mine !== ask.current) return
      // Never trust the shape: an older or odd answer is "no section", not a crash.
      if (r.success && Array.isArray(r.data?.friends)) {
        const { friends, total } = r.data
        const late = loadedNow.current && lastTotal.current === 0 && total > 0
        setPage({ eventId, friends, total: Number.isFinite(total) ? total : friends.length })
        if (late) setAppearances((n) => n + 1)
      }
    } catch (e) {
      Logger.debug('friends', 'friends here read failed', { error: e })
    }
    if (mine === ask.current) setLoadedFor(eventId)
  }, [eventId, lastTotal, loadedNow])

  useEffect(() => {
    if (!eventId || !inRoom) return
    // The read is async: its setState lands after the effect, as a subscription's answer does.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void read()
    let timer: ReturnType<typeof setTimeout> | null = null
    const soon = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void read(), FRIENDS_REFETCH_MS)
    }
    const offFriends = subscribeToRoomFriends((d) => {
      if (d.eventId === eventId) soon()
    })
    let wasUp = true
    const offStatus = subscribeConnectionStatus((s) => {
      const up = s.state === 'connected'
      if (up && !wasUp) soon()
      wasUp = up
    })
    return () => {
      if (timer) clearTimeout(timer)
      offFriends()
      offStatus()
    }
  }, [eventId, inRoom, read])

  // Another room's friends are never this room's.
  const here = page && page.eventId === eventId ? page : null
  return { friends: here?.friends ?? [], total: here?.total ?? 0, loaded: loadedFor === eventId, appearances, refresh: read }
}

/** 1204 reads "1,204": a long count stays a glance and never breaks a header or a row. */
export const groupedCount = (n: number): string => n.toLocaleString('en-US')

/** "Karthik Subramaniam Venkataraman" is Karthik: the toast speaks the way a friend would. */
export const firstNameOf = (name: string): string => name.trim().split(/\s+/)[0] || name

/** The DM did not open (the friend left, an unfriend or a block in between, or no network). */
export const friendChatFailure = (name: string): string => `Couldn't open your chat with ${firstNameOf(name)}. Try again.`

/**
 * Message: open (or find) the friend chat by real user id, then go there. One at a
 * time per friend, never twice for a double tap; the other rows stay free. A
 * failure says so and tells the caller to read again, because they may have gone.
 */
export function useMessageFriend(onFailed: (message: string) => void) {
  const [opening, setOpening] = useState<string | null>(null)
  const busy = useRef<string | null>(null)
  const failed = useLatest(onFailed)
  const message = useCallback(
    async (friend: FriendHere) => {
      if (busy.current) return
      busy.current = friend.userId
      setOpening(friend.userId)
      try {
        const r = await apiClient.openFriendConversation(friend.userId)
        const conversationId = r.success ? r.data?.conversationId : null
        if (conversationId) router.push({ pathname: '/private-chat/[conversationId]', params: { conversationId } } as never)
        else failed.current(friendChatFailure(friend.name))
      } catch (e) {
        Logger.warn('friends', 'friend chat did not open', { error: e })
        failed.current(friendChatFailure(friend.name))
      } finally {
        busy.current = null
        setOpening(null)
      }
    },
    [failed]
  )
  return { opening, message }
}

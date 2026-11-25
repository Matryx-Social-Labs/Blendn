import { useCallback, useEffect, useRef, useState } from 'react'

import { apiClient } from './apiClient'
import type { FriendHere } from './friendsHere'
import { Logger } from './logger'

/** Pages of 20 behind "Show 20 more" (Flow 5 C6, I-A); the server allows up to 50 (plans/friends-in-room.md 4.3). */
export const FRIENDS_PAGE = 20
/** Search comes first only above this many: 20 friends are all on the first page. */
export const SEARCH_ABOVE = 20
/** Typing waits this long before it asks (a search per keystroke is a request per keystroke). */
export const SEARCH_DEBOUNCE_MS = 250
/** The server filters on 1 to 40 characters. */
export const SEARCH_MAX = 40
/** A fixed row height, so `getItemLayout` is exact and a fast scroll never shows a blank cell. */
export const FRIEND_ROW_HEIGHT = 64

export type FriendsListStatus = 'loading' | 'ready' | 'error'

/**
 * See all (C2): the friends here, A to Z, searched and paged by cursor, 20 at a time (C6).
 * A new search is a new list; an older answer never lands on a newer one. The count
 * in the title is the unfiltered total, so typing does not make friends vanish from it.
 */
export function useFriendsHereList(eventId: string | null) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [friends, setFriends] = useState<FriendHere[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<FriendsListStatus>('loading')
  const [loadingMore, setLoadingMore] = useState(false)
  const ask = useRef(0)
  const more = useRef(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const first = useCallback(async () => {
    if (!eventId) return
    const mine = ++ask.current
    more.current = false
    setLoadingMore(false)
    // The last search's cursor is for the last search: a next page asked in the gap would be the wrong list.
    setCursor(null)
    try {
      const r = await apiClient.getFriendsHere(eventId, { order: 'name', limit: FRIENDS_PAGE, q: debounced || undefined })
      if (mine !== ask.current) return
      if (r.success && Array.isArray(r.data?.friends)) {
        setFriends(r.data.friends)
        setCursor(r.data.nextCursor)
        if (!debounced) setTotal(r.data.total)
        setStatus('ready')
      } else {
        setStatus('error')
      }
    } catch (e) {
      Logger.warn('friends', 'friends here list failed', { error: e })
      if (mine === ask.current) setStatus('error')
    }
  }, [eventId, debounced])

  useEffect(() => {
    // The read is async: its setState lands after the effect, as a subscription's answer does.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void first()
  }, [first])

  const loadMore = useCallback(async () => {
    // A search still typing (or on its way) has no next page yet: its cursor is the last search's.
    if (!eventId || !cursor || more.current || status !== 'ready' || query.trim() !== debounced) return
    more.current = true
    setLoadingMore(true)
    const mine = ask.current
    try {
      const r = await apiClient.getFriendsHere(eventId, { order: 'name', limit: FRIENDS_PAGE, cursor, q: debounced || undefined })
      if (mine !== ask.current) return
      if (r.success && Array.isArray(r.data?.friends)) {
        const next = r.data
        // A friend can appear on two pages while others arrive; the key is the person.
        setFriends((have) => {
          const seen = new Set(have.map((f) => f.userId))
          return [...have, ...next.friends.filter((f) => !seen.has(f.userId))]
        })
        setCursor(next.nextCursor)
      }
    } catch (e) {
      Logger.warn('friends', 'friends here next page failed', { error: e })
    } finally {
      more.current = false
      if (mine === ask.current) setLoadingMore(false)
    }
  }, [eventId, cursor, debounced, status, query])

  const retry = useCallback(() => {
    setStatus('loading')
    void first()
  }, [first])

  // A new search shows its own loading, not the last list under a spinner.
  const search = (text: string) => {
    setQuery(text)
  }
  return { query, search, searching: query.trim() !== debounced, friends, total, status, loadingMore, hasMore: cursor !== null, loadMore, retry }
}

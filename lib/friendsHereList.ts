import { useCallback, useEffect, useRef, useState } from 'react'

import { apiClient } from './apiClient'
import type { FriendHere } from './friendsHere'
import { Logger } from './logger'

/** The server pages by name in 50s (plans/friends-in-room.md 4.3 / 9.1): never the full list. */
export const FRIENDS_PAGE = 50
/** Typing waits this long before it asks (a search per keystroke is a request per keystroke). */
export const SEARCH_DEBOUNCE_MS = 250
/** The server filters on 1 to 40 characters. */
export const SEARCH_MAX = 40
/** Fixed heights, so `getItemLayout` is exact and a fast scroll never shows a blank cell. */
export const LETTER_HEIGHT = 32
export const FRIEND_ROW_HEIGHT = 64

export type FriendsListItem = { kind: 'letter'; key: string; letter: string } | { kind: 'friend'; key: string; friend: FriendHere }

/** A..Z under their own letter, a non-Latin initial under its own, digits, symbols and emoji under "#". */
export function letterOf(name: string): string {
  const first = Array.from(name.trim())[0] ?? ''
  return /^\p{L}$/u.test(first) ? first.toLocaleUpperCase() : '#'
}

/**
 * The page as rows with a letter before each run of one initial. The server's order is by
 * lower-cased name, so a letter can only come round again if its collation disagrees with the
 * letters here; that draws a second header, never a wrong row. ponytail: no client re-sort.
 */
export function withLetters(friends: readonly FriendHere[]): FriendsListItem[] {
  const out: FriendsListItem[] = []
  let current = ''
  for (const friend of friends) {
    const letter = letterOf(friend.name)
    if (letter !== current) {
      current = letter
      out.push({ kind: 'letter', key: `letter-${out.length}-${letter}`, letter })
    }
    out.push({ kind: 'friend', key: friend.userId, friend })
  }
  return out
}

/** `getItemLayout` for the rows above: headers 32, friends 64, and each offset is the sum before it. */
export function layoutOf(items: readonly FriendsListItem[]): { length: number; offset: number; index: number }[] {
  let offset = 0
  return items.map((item, index) => {
    const length = item.kind === 'letter' ? LETTER_HEIGHT : FRIEND_ROW_HEIGHT
    const at = { length, offset, index }
    offset += length
    return at
  })
}

export type FriendsListStatus = 'loading' | 'ready' | 'error'

/**
 * See all (C2): the friends here, A to Z, searched and paged by cursor, 50 at a time.
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

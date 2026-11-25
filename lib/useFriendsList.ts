import { useCallback, useEffect, useRef, useState } from 'react'

import { apiClient } from './apiClient'
import type { Friend } from './friends'
import { lettersFrom, type Letter } from './friendsIndex'
import { friendsGoneMark, friendsGoneSince } from './friendsGone'
import { appendUnique, FRIEND_SEARCH_DEBOUNCE_MS, friendsPageFrom, localSearch, refreshFirstPage, searchTerm } from './friendsPaging'
import { Logger } from './logger'

export type FriendsListStatus = 'loading' | 'ready' | 'failed'

/**
 * How a refresh treats what is on screen.
 *  - `merge`: a return to the screen. The first page replaces the head and what was read further down stays, so the list does not jump.
 *  - `replace`: a pull. The first page is the list; what was on screen stays until it lands.
 *  - `reset`: a picker opening. Nothing is shown from last time; the list is loading.
 */
export type FriendsRefresh = 'merge' | 'replace' | 'reset'

const key = (f: Friend) => f.userId

/**
 * Your friends, a page at a time by the server's cursor (admin #724), and how many in all.
 *
 * Shared by Friends and both crew-invite pickers, so a hundred and one friends and a thousand read the same way:
 * `friends` is what has been read, `total` is the whole list (the server's count, never the length of what is loaded),
 * `loadMore` asks for the next page and never twice at once. A failed first read is `failed`, never an empty list; a
 * failed later page keeps what is here and says so (`moreFailed`), and `loadMore` is its retry.
 *
 * An older answer never lands on a newer one (`ask`), and a screen that unmounts mid-read drops its answer.
 *
 * `order: 'name'` reads the server's A–Z instead of newest first (admin #998), and keeps `letters`, the whole list's heads, from
 * each page it reads.
 */
export function useFriendsList(order?: 'name') {
  const [friends, setFriends] = useState<Friend[]>([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<FriendsListStatus>('loading')
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)
  // The search: what is typed, what has been asked (after the debounce), and the whole list's count while a search narrows it.
  const [query, setQuery] = useState('')
  const [asked, setAsked] = useState('')
  const [allTotal, setAllTotal] = useState(0)
  const [searching, setSearching] = useState(false)
  const [letters, setLetters] = useState<Letter[] | null>(null)
  const term = useRef<string | null>(null)
  const lastAsked = useRef('')
  // A server that ignored `q` was seen: from then on a search filters the first page here and offers no more.
  const localOnly = useRef(false)
  // What the callbacks read: the latest, not the render they were made in.
  const held = useRef<Friend[]>([])
  const next = useRef<string | null>(null)
  const ask = useRef(0)
  const paging = useRef(false)
  const goneMark = useRef(friendsGoneMark())

  const read = useCallback(
    (cursor: string | null) => (order ? apiClient.getFriends(cursor, term.current, order) : apiClient.getFriends(cursor, term.current)),
    [order]
  )

  /** A page asked for `term`, narrowed here if the server did not (and then there is no more). */
  const narrow = (page: NonNullable<ReturnType<typeof friendsPageFrom>>) => {
    if (!term.current) return page
    const out = localSearch(page, term.current, localOnly.current)
    if (out.local) localOnly.current = true
    return out.page
  }

  const settle = (items: Friend[], at: string | null) => {
    held.current = items
    next.current = at
    setFriends(items)
    setCursor(at)
  }

  // A failed refresh over a list already on screen keeps the list: the flag is only for a screen with nothing to show.
  const markFailed = () => setStatus((s) => (held.current.length > 0 ? s : 'failed'))

  const refresh = useCallback(async (mode: FriendsRefresh = 'merge') => {
    const mine = ++ask.current
    paging.current = false
    setLoadingMore(false)
    setMoreFailed(false)
    if (mode === 'reset') {
      term.current = null
      lastAsked.current = ''
      setQuery('')
      setAsked('')
      held.current = []
      next.current = null
      setFriends([])
      setCursor(null)
      setStatus('loading')
    }
    try {
      const result = await read(null)
      if (mine !== ask.current) return
      const got = friendsPageFrom(result.data)
      if (!got) return markFailed()
      const page = narrow(got)
      const merged = mode === 'merge' ? refreshFirstPage(held.current, page, key) : { items: page.items, keptTail: false }
      // Somebody removed on another screen leaves the pages kept from before as well (the head was just read: it is already right).
      const { gone, next: mark } = friendsGoneSince(goneMark.current)
      goneMark.current = mark
      // Only from what was kept: the head was just read, and somebody added again since is on it.
      const head = new Set(page.items.map(key))
      const items = gone.size && mode === 'merge' ? merged.items.filter((f) => head.has(f.userId) || !gone.has(f.userId)) : merged.items
      settle(items, merged.keptTail ? next.current : page.nextCursor)
      setTotal(page.total)
      if (order) setLetters(lettersFrom(result.data))
      if (!term.current) setAllTotal(page.total)
      setStatus('ready')
    } catch (error) {
      Logger.warn('friends', 'friends list failed', { error })
      if (mine === ask.current) markFailed()
    }
  }, [order, read])

  const loadMore = useCallback(async () => {
    const from = next.current
    if (!from || paging.current) return
    paging.current = true
    const mine = ask.current
    setLoadingMore(true)
    setMoreFailed(false)
    try {
      const result = await read(from)
      if (mine !== ask.current) return
      const got = friendsPageFrom(result.data)
      if (!got) return setMoreFailed(true)
      const page = narrow(got)
      settle(appendUnique(held.current, page.items, key), page.nextCursor)
      setTotal(page.total)
      if (order) setLetters(lettersFrom(result.data))
    } catch (error) {
      Logger.warn('friends', 'friends next page failed', { error })
      if (mine === ask.current) setMoreFailed(true)
    } finally {
      if (mine === ask.current) {
        paging.current = false
        setLoadingMore(false)
      }
    }
  }, [order, read])

  // Typing waits, then asks: a new search replaces the list (the old one stays on screen under the spinner until it lands).
  useEffect(() => {
    const timer = setTimeout(() => setAsked(query.trim()), FRIEND_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])
  useEffect(() => {
    if (asked === lastAsked.current) return
    lastAsked.current = asked
    term.current = searchTerm(asked)
    setSearching(true)
    // The read is async: its setState lands after the effect, as a subscription's answer does.
    void refresh('replace').finally(() => setSearching(false))
  }, [asked, refresh])

  /** Somebody left the list on this screen (an unfriend): gone from what is held, and from the count. */
  const drop = useCallback((userId: string) => {
    const kept = held.current.filter((f) => f.userId !== userId)
    if (kept.length === held.current.length) return
    held.current = kept
    setFriends(kept)
    setTotal((n) => Math.max(0, n - 1))
  }, [])

  return {
    friends,
    total,
    allTotal,
    status,
    loadingMore,
    moreFailed,
    hasMore: cursor !== null,
    /** `order: 'name'` only: the whole list's heads, from the last page read; null until one is. */
    letters,
    query,
    search: setQuery,
    /** Typing has not been asked yet, or the answer is on its way. */
    searching: searching || query.trim() !== asked,
    /** What the list is narrowed to, or null. */
    searched: searchTerm(asked),
    refresh,
    loadMore,
    drop,
  }
}

/** What a picker draws from the list: nothing yet (`null`), the failure (never "no friends"), or the friends. */
export function pickerView<T>(status: FriendsListStatus, friends: T[]): T[] | null | 'failed' {
  return status === 'loading' ? null : status === 'failed' ? 'failed' : friends
}

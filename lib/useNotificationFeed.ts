import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useToast } from '../components/Toast'
import { apiClient } from './apiClient'
import { readAnswered, rememberAnswered, type Outcome } from './answeredRequests'
import { crewsApi } from './crewsApi'
import { REQUEST_TIMEOUT_MS, settleWithin } from './fetchTimeout'
import { Logger } from './logger'
import type { NotificationItem } from './notificationFormat'
import { arrivedUnread, groupFeed, isRequestKind, mergeFeed, type FeedGroups, type FeedRow, type RowAction } from './notificationRows'
import { navigateFromNotificationData } from './notifications'
import { subscribeToBell } from './socketClient'

/** Cursor paging, 30 a page (Flow 9 · 9.2 frame 12). */
export const FEED_PAGE = 30
/** "You're friends now" stays inline this long, then the row leaves (the prototype: 2 s). */
export const DONE_DWELL_MS = 2000
/**
 * The longest an answer may take before the row gives its pills back (SCRUM-754): the call, a token refresh, the
 * call again, each on the fetch deadline. Past it the server may still record the answer; a second tap then reads
 * "no longer open", which is true.
 */
export const ANSWER_DEADLINE_MS = 3 * REQUEST_TIMEOUT_MS

export type FeedLoad = 'loading' | 'ready' | 'failed'
export type RequestState = 'pending' | 'done' | 'stale'

const SAID_NO_LONGER_THERE = 'NOT_FOUND'
/** Ours, never the server's: the answer did not settle inside `ANSWER_DEADLINE_MS`. */
const TOOK_TOO_LONG = 'CLIENT_DEADLINE'

/**
 * The Notifications screen's data: the feed, its pages, what is new, what the person is answering.
 *
 * ## What "new" is
 *
 * Opening the screen marks everything seen on the server (the badge clears), but the rows that were unseen
 * when it opened stay New for as long as you are on it ("never while it is being read", motion #29): `fresh`
 * is a snapshot, not `readAt`. A row that lands while it is open joins it. Leaving the screen, or tapping a
 * row, settles them (`settle`, `touch`): the dot goes and the title drops to 500.
 *
 * ## What it will not do
 *
 * Keep a request that was answered here as Waiting on you (`rememberAnswered`), or claim a decline to anybody:
 * Decline is told to nobody. A refresh never shortens a list that has been paged (`mergeFeed`).
 */
export function useNotificationFeed({ onArrive }: { onArrive?: (count: number) => void } = {}) {
  const { showToast } = useToast()
  const [load, setLoad] = useState<FeedLoad>('loading')
  const [items, setItems] = useState<NotificationItem[]>([])
  const [paging, setPaging] = useState<{ hasMore: boolean; cursor?: string }>({ hasMore: false })
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(new Set())
  const [settled, setSettled] = useState<ReadonlySet<string>>(new Set())
  const [resolved, setResolved] = useState<ReadonlySet<string>>(new Set())
  const [requestState, setRequestState] = useState<Readonly<Record<string, RequestState>>>({})
  const [answered, setAnswered] = useState<ReadonlyMap<string, Outcome>>(new Map())
  const [clearKeepsRequests, setClearKeepsRequests] = useState(false)
  /** When the page was read: "2 min ago" is measured from here, so a render never reads the clock. */
  const [readAt, setReadAt] = useState(0)
  /** The rows that landed while the screen was open: they fade in, the first page never does. */
  const [liveIds, setLiveIds] = useState<ReadonlySet<string>>(new Set())
  const onArriveRef = useRef(onArrive)

  const itemsRef = useRef(items)
  const pagingRef = useRef(paging)
  const inFlight = useRef(new Set<string>())
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  useEffect(() => {
    itemsRef.current = items
    pagingRef.current = paging
    onArriveRef.current = onArrive
  })
  useEffect(() => {
    const live = timers.current
    return () => {
      live.forEach(clearTimeout)
    }
  }, [])

  /** The server's count is cleared by opening: the screen never shows it, the bell re-reads on return. */
  const markSeen = useCallback(() => {
    apiClient.markNotificationsRead().catch((error) => {
      Logger.warn('notifications', 'markRead:failed', { error: error as never })
    })
  }, [])

  /** `open`/`pull` replace what is loaded; `live` folds a new page into it. */
  const read = useCallback(
    async (mode: 'open' | 'pull' | 'live') => {
      try {
        const result = await apiClient.getNotifications({ limit: FEED_PAGE })
        if (!result.success || !result.data) throw new Error(result.error ?? 'Notifications did not load')
        const { notifications: page, pagination, clearKeepsRequests: keeps } = result.data
        const loaded = itemsRef.current
        const arrived = mode === 'open' ? page.filter((n) => n.readAt === null).map((n) => n.id) : arrivedUnread(loaded, page)
        setReadAt(Date.now())
        setClearKeepsRequests(keeps === true)
        if (mode === 'live') {
          setItems(mergeFeed(loaded, page))
        } else {
          setItems(page)
          setPaging({ hasMore: pagination.hasMore, cursor: pagination.nextCursor })
        }
        if (arrived.length) setFreshIds((prev) => new Set([...prev, ...arrived]))
        if (mode === 'live' && arrived.length) {
          setLiveIds((prev) => new Set([...prev, ...arrived]))
          onArriveRef.current?.(arrived.length)
        }
        setLoad('ready')
        if (arrived.length || page.some((n) => n.readAt === null)) markSeen()
      } catch (error) {
        Logger.warn('notifications', 'load:failed', { error: error as never })
        // A list that loaded once stays through a failed refresh: "Quiet for now" over a failed request would be false.
        setLoad((prev) => (prev === 'ready' ? prev : 'failed'))
      }
    },
    [markSeen]
  )

  useEffect(() => {
    void readAnswered().then(setAnswered)
    // Every setState in `read` comes after its first await; the rule cannot see through the async function.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void read('open')
  }, [read])
  // A row landing while the screen is open: the server says so on your own socket room.
  useEffect(() => subscribeToBell(() => void read('live')), [read])

  const retry = useCallback(async () => {
    setLoad('loading')
    await read('open')
  }, [read])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    await read('pull')
    setRefreshing(false)
  }, [read])

  const loadMore = useCallback(async () => {
    const { hasMore, cursor } = pagingRef.current
    if (!hasMore || !cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const result = await apiClient.getNotifications({ cursor, limit: FEED_PAGE })
      if (!result.success || !result.data) throw new Error(result.error ?? 'More notifications did not load')
      setItems((prev) => mergeFeed(prev, result.data!.notifications))
      setPaging({ hasMore: result.data.pagination.hasMore, cursor: result.data.pagination.nextCursor })
    } catch (error) {
      Logger.warn('notifications', 'loadMore:failed', { error: error as never })
      showToast('Couldn’t load more. Try again.', 'error', { haptic: 'error' })
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, showToast])

  /** The row's payload sent you somewhere: it was seen. */
  const touch = useCallback((id: string) => setSettled((prev) => new Set(prev).add(id)), [])
  /** Leaving the screen: everything that was New is read (motion #29 plays as the dots go). */
  const settle = useCallback(() => setSettled((prev) => new Set([...prev, ...freshIds])), [freshIds])

  const answeredItems = useMemo(
    () => items.map((n) => (answered.get(n.id) === 'accepted' ? { ...n, open: false } : n)).filter((n) => answered.get(n.id) !== 'declined'),
    [items, answered]
  )
  const fresh = useMemo(() => new Set([...freshIds].filter((id) => !settled.has(id))), [freshIds, settled])
  const groups: FeedGroups = useMemo(
    () => groupFeed(answeredItems, { fresh: freshIds, resolved, now: readAt }),
    [answeredItems, freshIds, resolved, readAt]
  )

  const setRequest = useCallback(
    (id: string, state: RequestState | null) =>
      setRequestState((prev) => {
        const { [id]: _gone, ...rest } = prev
        return state ? { ...rest, [id]: state } : rest
      }),
    []
  )
  const resolve = useCallback((id: string) => setResolved((prev) => new Set(prev).add(id)), [])
  const remember = useCallback((id: string, outcome: Outcome) => {
    setAnswered((prev) => new Map(prev).set(id, outcome))
    void rememberAnswered(id, outcome)
  }, [])

  const answer = useCallback(
    async (row: FeedRow, action: RowAction['key']) => {
      const { item } = row
      if (action === 'view' || action === 'join') {
        touch(item.id)
        navigateFromNotificationData(item.data ?? undefined)
        return
      }
      if (inFlight.current.has(item.id)) return
      inFlight.current.add(item.id)
      setRequest(item.id, 'pending')
      try {
        const outcome: Outcome = action === 'accept' ? 'accepted' : 'declined'
        const result = await settleWithin(answerRequest(item, action), ANSWER_DEADLINE_MS, { success: false, errorCode: TOOK_TOO_LONG }).catch(
          (error: unknown) => {
            Logger.warn('notifications', 'answer:threw', { error: error as never })
            return { success: false, errorCode: undefined }
          }
        )
        if (result.errorCode === TOOK_TOO_LONG) Logger.warn('notifications', 'answer:timed out', { kind: item.kind })
        if (!result.success) {
          if (result.errorCode === SAID_NO_LONGER_THERE) {
            setRequest(item.id, 'stale')
          } else {
            setRequest(item.id, null)
            showToast('That didn’t go through. Try again.', 'error', { haptic: 'error' })
          }
          return
        }
        remember(item.id, outcome)
        if (action === 'decline') {
          // Told to nobody: the row collapses and nothing is said.
          setRequest(item.id, null)
          resolve(item.id)
          return
        }
        setRequest(item.id, 'done')
        const timer = setTimeout(() => {
          timers.current.delete(timer)
          resolve(item.id)
          setRequest(item.id, null)
        }, DONE_DWELL_MS)
        timers.current.add(timer)
      } finally {
        inFlight.current.delete(item.id)
      }
    },
    [touch, showToast, setRequest, resolve, remember]
  )

  /** Clears the list; what the server keeps is whatever it says it keeps (`clearKeepsRequests`). Puts it back on failure. */
  const clear = useCallback(async () => {
    const before = itemsRef.current
    const keep = clearKeepsRequests ? before.filter((n) => isRequestKind(n.kind) && n.open !== false) : []
    setItems(keep)
    setPaging({ hasMore: false })
    const restore = () => {
      setItems(before)
      showToast('Couldn’t clear. Try again.', 'error', { haptic: 'error' })
    }
    try {
      const result = await apiClient.clearNotifications()
      if (!result.success) {
        Logger.warn('notifications', 'clear:failed', { error: result.error as never })
        restore()
      }
    } catch (error) {
      Logger.warn('notifications', 'clear:failed', { error: error as never })
      restore()
    }
  }, [clearKeepsRequests, showToast])

  return {
    load,
    groups,
    fresh,
    requestState,
    hasMore: paging.hasMore,
    loadingMore,
    refreshing,
    clearKeepsRequests,
    liveIds,
    items,
    retry,
    refresh,
    loadMore,
    answer,
    touch,
    settle,
    clear,
  }
}

/** Accept or decline a request: a friend request through its id, a crew invite through its crew. */
function answerRequest(item: NotificationItem, action: 'accept' | 'decline'): Promise<{ success: boolean; errorCode?: string }> {
  // Accepting a crew invite is Join, which opens the invite and never joins from the list: only Decline is answered here.
  if (item.kind === 'crew_invite' && item.data?.crewId) {
    return action === 'decline' ? crewsApi.decline(item.data.crewId) : Promise.resolve({ success: false })
  }
  if (item.kind === 'friend_request' && item.data?.requestId) {
    return apiClient.respondToFriendRequest(item.data.requestId, action === 'accept' ? 'accept' : 'dismiss')
  }
  return Promise.resolve({ success: false, errorCode: SAID_NO_LONGER_THERE })
}

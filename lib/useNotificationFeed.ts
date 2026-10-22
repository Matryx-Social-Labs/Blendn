import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useToast } from '../components/Toast'
import { apiClient } from './apiClient'
import { iconBadgeAfterRead, iconBadgeFor, setAppIconBadge } from './appBadge'
import { readAnswered, rememberAnswered, type Outcome } from './answeredRequests'
import { crewsApi } from './crewsApi'
import { REQUEST_TIMEOUT_MS, settleWithin } from './fetchTimeout'
import { Logger } from './logger'
import type { NotificationItem } from './notificationFormat'
import { arrivedUnread, closeAnsweredElsewhere, groupFeed, isRequestKind, mergeFeed, type FeedGroups, type FeedRow, type RowAction } from './notificationRows'
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
  const [clearedOpenRequests, setClearedOpenRequests] = useState(false)
  /** When the page was read: "2 min ago" is measured from here, so a render never reads the clock. */
  const [readAt, setReadAt] = useState(0)
  /** The rows that landed while the screen was open: they fade in, the first page never does. */
  const [liveIds, setLiveIds] = useState<ReadonlySet<string>>(new Set())
  const onArriveRef = useRef(onArrive)

  const itemsRef = useRef(items)
  const pagingRef = useRef(paging)
  const inFlight = useRef(new Set<string>())
  /** Who sent each request still waiting (request id → their user id), from the last reconcile. */
  const senders = useRef(new Map<string, string>())
  /** The rows whose answer outlived `ANSWER_DEADLINE_MS`: it may still have landed. */
  const timedOut = useRef(new Set<string>())
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

  /**
   * The server's count is cleared by opening: the screen never shows it, the bell re-reads on return. The app icon follows
   * once the server has it (`afterRead`: what is left is the conversations, `lib/appBadge`), never ahead of it.
   */
  const markSeen = useCallback((afterRead: number | null) => {
    apiClient
      .markNotificationsRead()
      .then((marked) => {
        if (marked?.success) void setAppIconBadge(afterRead)
      })
      .catch((error) => {
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
        if (arrived.length || page.some((n) => n.readAt === null)) markSeen(iconBadgeAfterRead(result.data))
        else void setAppIconBadge(iconBadgeFor(result.data))
        // The list shows at once; whether its requests were answered elsewhere is reconciled after (a second read).
        void incomingRequests(page).then((incoming) => {
          if (!incoming) return
          incoming.forEach((sender, requestId) => senders.current.set(requestId, sender))
          setItems((prev) => closeAnsweredElsewhere(prev, new Set(incoming.keys())))
        })
      } catch (error) {
        Logger.warn('notifications', 'load:failed', { error: error as never })
        // A list that loaded once stays through a failed refresh: "Quiet for now" over a failed request would be false.
        setLoad((prev) => (prev === 'ready' ? prev : 'failed'))
      }
    },
    [markSeen]
  )

  // Back from somewhere a request may have been answered (Friends › Requests, a profile): read again. Not on the first focus, which `open` reads.
  const focusedOnce = useRef(false)
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) void read('live')
      focusedOnce.current = true
    }, [read])
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
    () =>
      items.flatMap((n) => {
        const outcome = answered.get(n.id)
        if (outcome === 'declined') return []
        // A row showing its answer stays in Waiting until its dwell ends: moved, it remounts done and the moment never plays.
        if (requestState[n.id] === 'done') return [n.open === false ? { ...n, open: true } : n]
        return [outcome === 'accepted' ? { ...n, open: false } : n]
      }),
    [items, answered, requestState]
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
  /** The outcome (or "no longer open") shows for `DONE_DWELL_MS`, then the row leaves the list. */
  const dwellThenResolve = useCallback(
    (id: string) => {
      const timer = setTimeout(() => {
        timers.current.delete(timer)
        resolve(id)
        setRequest(id, null)
      }, DONE_DWELL_MS)
      timers.current.add(timer)
    },
    [resolve, setRequest]
  )
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
        if (result.errorCode === TOOK_TOO_LONG) {
          timedOut.current.add(item.id)
          Logger.warn('notifications', 'answer:timed out', { kind: item.kind })
        }
        // An Accept that timed out may have landed after all: the retry then reads "no longer open", which here means friends.
        const landedEarlier =
          !result.success && result.errorCode === SAID_NO_LONGER_THERE && action === 'accept' && timedOut.current.has(item.id)
            ? await becameFriends(senders.current.get(String(item.data?.requestId ?? '')))
            : false
        if (!result.success && !landedEarlier) {
          if (result.errorCode === SAID_NO_LONGER_THERE) {
            // Said for as long as an answer is, then it leaves Waiting: it is nobody's to answer.
            setRequest(item.id, 'stale')
            dwellThenResolve(item.id)
          } else {
            setRequest(item.id, null)
            showToast('That didn’t go through. Try again.', 'error', { haptic: 'error' })
          }
          return
        }
        timedOut.current.delete(item.id)
        remember(item.id, outcome)
        if (action === 'decline') {
          // Told to nobody: the row collapses and nothing is said.
          setRequest(item.id, null)
          resolve(item.id)
          return
        }
        setRequest(item.id, 'done')
        dwellThenResolve(item.id)
      } finally {
        inFlight.current.delete(item.id)
      }
    },
    [touch, showToast, setRequest, remember, dwellThenResolve]
  )

  /**
   * Clears the list; what the server keeps is whatever it says it keeps (`clearKeepsRequests`). Puts it back on failure,
   * and when the server has not answered inside `ANSWER_DEADLINE_MS` (an empty list over rows the server still has is false).
   * Today's server deletes every row, requests too, but a request itself is not answered by it: `clearedOpenRequests`
   * says the list was cleared over some, so the empty state can say where they still are.
   */
  const clear = useCallback(async () => {
    const before = itemsRef.current
    const open = before.filter((n) => isRequestKind(n.kind) && n.open !== false && answered.get(n.id) === undefined)
    setItems(clearKeepsRequests ? open : [])
    setPaging({ hasMore: false })
    setClearedOpenRequests(!clearKeepsRequests && open.length > 0)
    const restore = () => {
      setItems(before)
      setClearedOpenRequests(false)
      showToast('Couldn’t clear. Try again.', 'error', { haptic: 'error' })
    }
    try {
      const call = apiClient.clearNotifications()
      const result = await settleWithin(call, ANSWER_DEADLINE_MS, { success: false, error: TOOK_TOO_LONG })
      if (!result.success) {
        Logger.warn('notifications', 'clear:failed', { error: result.error as never })
        restore()
      }
      // Given up on, the call may still land: read the list again when it does, so the screen ends up as the server is.
      if (result.error === TOOK_TOO_LONG) {
        void call.then((late) => (late.success ? read('pull') : undefined)).catch(() => {})
      }
    } catch (error) {
      Logger.warn('notifications', 'clear:failed', { error: error as never })
      restore()
    }
  }, [clearKeepsRequests, answered, showToast, read])

  return {
    load,
    groups,
    fresh,
    requestState,
    hasMore: paging.hasMore,
    loadingMore,
    refreshing,
    clearKeepsRequests,
    clearedOpenRequests,
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

/**
 * The friend requests still waiting on you (their id → who sent it), when the page has one to check; `null` when it has none or the list
 * did not load (then nothing is closed). A server that says whether a request's row is still open sends `open` (#716), and an
 * older one does not, so a request accepted or declined on Friends › Requests would wait here for good without this.
 */
async function incomingRequests(page: readonly NotificationItem[]): Promise<ReadonlyMap<string, string> | null> {
  if (!page.some((n) => n.kind === 'friend_request' && n.open !== false)) return null
  try {
    const result = await apiClient.getFriendRequests()
    return result.success && result.data ? new Map(result.data.incoming.map((r) => [r.id, r.person.userId])) : null
  } catch (error) {
    Logger.warn('notifications', 'requests:failed', { error: error as never })
    return null
  }
}

/** Whether the person who sent a request is now a friend: an Accept that timed out landed after all. Unknown reads as no. */
async function becameFriends(sender: string | undefined): Promise<boolean> {
  if (!sender) return false
  try {
    const result = await settleWithin(apiClient.getFriends(), ANSWER_DEADLINE_MS, { success: false })
    return !!result.success && !!result.data?.friends.some((f) => f.userId === sender)
  } catch {
    return false
  }
}

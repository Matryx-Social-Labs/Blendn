import * as Notifications from 'expo-notifications'
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'

import { PageFooter } from '../../components/chat/PageFooter'
import { font, HueProvider, useBoldText } from '../../components/ds/shared'
import { StateScreen } from '../../components/ds/StateScreen'
import { TopBar } from '../../components/ds/TopBar'
import { announce, BoardPostCard, IDLE, type AskState } from '../../components/board/BoardSections'
import { LobbyAlertsSheet } from '../../components/board/LobbyAlertsSheet'
import { LobbyCompose } from '../../components/board/LobbyCompose'
import { useLinkedPost } from '../../components/board/useLinkedPost'
import { ClosedCard, LiveEmptyCard, LobbyChips, LobbyComposerRow, LobbyGate, LobbyStarts, NewPostsPill, PinnedPost, ReadOnlyBanner } from '../../components/board/LobbyParts'
import { emptyOut, fadeIn, riseDelay, riseIn } from '../../components/board/boardMotion'
import { OfflineBanner } from '../../components/OfflineBanner'
import { SkeletonBlock } from '../../components/Skeleton'
import { apiClient } from '../../lib/apiClient'
import {
  askConflictLine,
  BOARD_ENABLED,
  boardMessage,
  CLOSED_LINE,
  isSettled,
  outgoingLine,
  saysBoardClosed,
  sortBoardPosts,
  WAITING_LINE,
  type BoardPost,
} from '../../lib/board'
import { openBlendn } from '../../lib/blendnOverlay'
import { Logger } from '../../lib/logger'
import { rememberLobbySeen } from '../../lib/lobbySeen'
import { subscribeToBoardPostRemoved } from '../../lib/socketClient'
import { useLatest } from '../../lib/useLatest'
import { useLiveSync } from '../../lib/useLiveSync'
import { useOnBlock } from '../../lib/useOnBlock'
import { boardSafetySheet } from '../../lib/safetyUtils'
import { composerSlot, filterQuery, freshOnTop, lobbyLayout, newestPostAt, type LobbyDraft, type LobbyFilter, type LobbyMeta } from '../../lib/lobby'
import { showSheet } from '../../lib/sheet'
import { cursorOf, getBoardPage, goneFrom, type BoardPostView, type TakenDown } from '../../lib/chatPaging'
import { COLOR, RADIUS, SPACE, STAGGER, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useTopBarOverlay } from '../../lib/useTopBarState'
import { useReducedMotion } from '../../lib/motion'

/**
 * The Lobby (L-A, SCRUM-1026, `mockups/redesign-2026-11/lobby/`; was the Board, Flow 4).
 *
 * Going alone, and looking for somebody to go with. Posts before doors, by
 * pseudonym; an ask is one tap; the answer arrives in the Banter. From doors
 * (start − 90) it is read-only with the room one tap away, and a day after the
 * end it closes with the room. The host's note is pinned first; the chips
 * filter on the server, so a chip over thousands of posts is one read. Every
 * gate is the server's (`GET/POST /events/:eventId/board`, `…/requests`) and
 * every refusal says which gate, in the server's words.
 *
 * Behind `BOARD_ENABLED`: with it off the route goes home, so a deep link
 * cannot reach a board whose safety half has not shipped.
 */
export default function BoardRoute() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>()
  if (!BOARD_ENABLED) return <Redirect href="/(tabs)/events" />
  return (
    <HueProvider value="rose">
      {/* Keyed by the event (RC drive 2 D-E): a link from one board to another never posts this one's draft there. */}
      <BoardScreen key={eventId} />
    </HueProvider>
  )
}

/** The meta the first page carries (admin #914): what the Lobby is now, its counts, the pin, and whether you can post. */
const metaOf = (body: unknown): Partial<LobbyMeta> => {
  const d = (body ?? {}) as Partial<LobbyMeta>
  return {
    ...(d.state && { state: d.state, phase: d.phase }),
    ...(d.closesAt && { closesAt: d.closesAt }),
    ...(typeof d.ticketsHidden === 'boolean' && { ticketsHidden: d.ticketsHidden }),
    ...(d.subKinds && { subKinds: d.subKinds }),
    ...(d.counts && { counts: d.counts }),
    ...('pinned' in d && { pinned: d.pinned ?? null }),
    ...(d.compose && { compose: d.compose }),
    ...(d.you && { you: d.you }),
  }
}

/** A day after the end the Lobby closes with the room (admin `lobbyDoor`: 403, `LOBBY_CLOSED`). */
const LOBBY_CLOSED = 'LOBBY_CLOSED'

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; posts: BoardPostView[] }
  /** The board answered no: not going, under 18, or no such board. */
  | { kind: 'refused'; code: string | undefined; line: string }
  | { kind: 'failed' }

/** The event as the server has it: the title and its clock are its, not the link's. */
type EventFacts = { title: string; timeZone: string | null }

const REFUSED_TITLE: Record<string, string> = {
  AGE_RESTRICTED: 'This Lobby has an age limit',
  NOT_FOUND: "This Lobby isn’t here",
}

export function BoardScreen() {
  // `compose=1`: Post something on the event page's card (P-A), which opens the composer once, if posting is open.
  // `post`: a post link or a match push (6/6), the post to scroll to (`useLinkedPost`).
  const { eventId, compose: composeAsked, post: postAsked } = useLocalSearchParams<{ eventId: string; compose?: string; post?: string }>()
  const composeOnce = useRef(composeAsked === '1')
  const [alertsOpen, setAlertsOpen] = useState(false)
  const bold = useBoldText()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const loadRef = useLatest(load)
  const [event, setEvent] = useState<EventFacts | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFailed, setRefreshFailed] = useState(false)
  /*
   * Two sources for one card's state. What the server lists (your asks, read
   * with the board) and what this screen just did. An ask in flight or a
   * refusal is this screen's to keep; a settled line gives way to the server's
   * once it lists the request — it may since have been accepted.
   */
  const [listedAsks, setListedAsks] = useState<Record<string, AskState>>({})
  const [localAsks, setLocalAsks] = useState<Record<string, AskState>>({})
  const asking = useRef(new Set<string>())

  const [composing, setComposing] = useState(false)
  const [posting, setPosting] = useState(false)
  const postingRef = useRef(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  /** Posts made here: the composer is keyed on it, so the next one opens on an empty draft. */
  const [posted, setPosted] = useState(0)
  const [startKind, setStartKind] = useState<'offer' | 'seeking'>('offer')
  /** The going gate's own answer: in flight, and the server's sentence when it says no. */
  const [gate, setGate] = useState<{ busy: boolean; refusal: string | null }>({ busy: false, refusal: null })

  /** What the Lobby is now (open, read-only, live), its counts, the pin and the composer's slot: the first page's. */
  const [meta, setMeta] = useState<Partial<LobbyMeta>>({})
  const [closed, setClosed] = useState(false)
  /** The chip: a filter the server runs. Read through a ref so a read started under one chip is dropped under another. */
  const [filter, setFilter] = useState<LobbyFilter>('all')
  const filterRef = useRef<LobbyFilter>('all')
  /** New posts a background read found, waiting behind the pill so the list never jumps under a reader's thumb. */
  const [held, setHeld] = useState<ReadonlySet<string>>(new Set())
  const heldRef = useLatest(held)
  const listRef = useRef<FlatList<BoardPostView>>(null)
  /** A linked post (`useLinkedPost`), laid on top of All while no page lists it. */
  const linkedPost = useRef<BoardPostView | null>(null)

  /*
   * A read is sequenced, and it merges rather than replaces.
   *
   * `queuedRequest` shares an identical GET already in flight, so a read
   * started after a post can be answered by one started before it. So: the
   * newest read wins and an older answer is dropped, a post made here stays
   * until the server lists it, and one taken down here stays gone.
   */
  const readId = useRef(0)
  const created = useRef(new Map<string, BoardPostView>())
  const removed = useRef(new Set<string>())

  /*
   * Older pages (SCRUM-760): the board lists a page and says where the next starts. What a refresh re-reads is the
   * newest page, so the older ones already loaded are kept here and laid back under it, and their cursor stays.
   * Nothing to ask until the server sends a cursor: an older server's board is the one page it always was.
   */
  const [cursor, setCursor] = useState<string | null>(null)
  const [moreState, setMoreState] = useState<'idle' | 'loading' | 'failed'>('idle')
  const older = useRef<BoardPostView[]>([])
  const moreBusy = useRef(false)
  /** Moves when what the older pages hold stops being true (a block): a page still on its way is for the old board. */
  const pageEpoch = useRef(0)
  /* #16 / #47: the first load rises in, 28 ms apart, and so does what arrives where there was nothing; scroll and page inserts never do. */
  const reduceMotion = useReducedMotion()
  const rises = useRef<{ first: boolean; ids: ReadonlySet<string> }>({ first: true, ids: new Set() })
  const bar = useTopBarOverlay()
  /** Scrolled into the list (the bar has gone glass): only then can something arriving above make it jump. */
  const scrolledRef = useLatest(bar.state !== 'rest')
  /*
   * The bar as tall as it draws. `contentTop` is fixed, and at AX XXXL the title and the event under it grow past it,
   * so the list would start under them; it starts under whichever is lower.
   */
  const [barDrawn, setBarDrawn] = useState(0)
  const contentTop = Math.max(bar.contentTop, barDrawn + SPACE.sm)

  // An older server still closes the Lobby at doors, in its old sentence: the doors banner, and nothing under it.
  const [doorsShut, setDoorsShut] = useState(false)

  /** The linked post asked for again (a refresh, a poll): gone, refused or taken down, it leaves the top of the list. */
  const recheckLinked = useCallback(async (event: string, postId: string) => {
    const epoch = pageEpoch.current
    const r = await apiClient.getBoardPost(event, postId).catch(() => null)
    if (!r || r.success || linkedPost.current?.id !== postId || epoch !== pageEpoch.current) return
    linkedPost.current = null
    setLoad((prev) => (prev.kind === 'ready' ? { kind: 'ready', posts: prev.posts.filter((p) => p.id !== postId) } : prev))
  }, [])

  /**
   * `hold`: a read nobody asked for (a poll, a push). What it finds above the list waits behind the pill. `show`: a
   * read somebody asked for (focus, pull, a post, a chip), which shows everything at once.
   */
  const fetchBoard = useCallback(async (mode: 'show' | 'hold' = 'show'): Promise<boolean> => {
    if (!eventId) return false
    const id = ++readId.current
    const chip = filterRef.current
    try {
      const [board, mine, facts] = await Promise.all([
        apiClient.getBoard(eventId, filterQuery(chip)),
        apiClient.getBoardRequests(),
        apiClient.getEvent(eventId),
      ])
      if (id !== readId.current || chip !== filterRef.current) return true
      if (facts.success && facts.data) {
        setEvent({ title: facts.data.title, timeZone: (facts.data as { timezone?: string | null }).timezone ?? null })
      }
      if (!board.success || !board.data) {
        if (board.reasonCode === LOBBY_CLOSED) {
          setClosed(true)
          return true
        }
        if (saysBoardClosed(board.error)) {
          setDoorsShut(true)
          return true
        }
        const code = board.errorCode
        if (code === 'FORBIDDEN' || code === 'AGE_RESTRICTED' || code === 'NOT_FOUND') {
          setLoad({ kind: 'refused', code, line: boardMessage(board, 'This Lobby is not open to you.') })
          return true
        }
        Logger.warn('board', 'load failed', { eventId, error: board.error })
        return false
      }
      if (mine.success && mine.data) {
        const next: Record<string, AskState> = {}
        /*
         * Live first, then settled, then lapsed (the server's order): the first
         * per post is the one that counts. One ask per post, ever — a withdrawn
         * ask is not an invitation to ask again, so it keeps its line too.
         */
        for (const r of mine.data.outgoing) {
          if (r.event.id !== eventId || next[r.post.id]) continue
          next[r.post.id] = { kind: 'settled', line: outgoingLine(r) }
        }
        setListedAsks(next)
      }
      const listed = (board.data.posts as BoardPostView[]).filter((p) => !removed.current.has(p.id))
      for (const p of listed) created.current.delete(p.id)
      // Yours that moderation took down, from the first page (SV9): the card in place of the post. One you just wrote
      // and that was taken down is this card now, not a post that is still "yours" locally.
      const gone = goneFrom((board.data as { takenDown?: TakenDown[] }).takenDown)
      for (const g of gone) created.current.delete(g.id)
      // The newest page replaces the newest page; the older pages this screen loaded stay under it, and keep their cursor.
      const onPage = new Set(listed.map((p) => p.id))
      older.current = older.current.filter((p) => !onPage.has(p.id) && !removed.current.has(p.id))
      if (!older.current.length) setCursor(cursorOf(board.data))
      const firstMeta = metaOf(board.data)
      setMeta((prev) => ({ ...prev, ...firstMeta }))
      setClosed(false)
      // What you have seen, for Going's "New in the Lobby": the newest post on All (a filter shows only part of it), and only
      // from a read that shows it (a background read holds the new ones behind the pill, unseen).
      const newest = mode === 'show' && chip === 'all' ? newestPostAt(listed) : null
      if (newest) void rememberLobbySeen(eventId, newest)
      if (composeOnce.current) {
        composeOnce.current = false
        if (composerSlot({ state: firstMeta.state ?? 'open', compose: firstMeta.compose }).kind === 'composer') {
          setStartKind('offer')
          setComposing(true)
        }
      }
      // A background read holds what is new above the list; one somebody asked for shows it all.
      const was = loadRef.current
      const shown = new Set(was.kind === 'ready' ? was.posts.map((p) => p.id) : [])
      const onFirst = new Set(listed.map((p) => p.id))
      setHeld(
        mode === 'hold' && scrolledRef.current
          ? new Set([...heldRef.current, ...freshOnTop(listed, shown)].filter((pid) => onFirst.has(pid)))
          : new Set()
      )
      // Nothing, then something (#47): what arrives rises in once; a poll that finds more does not.
      if (was.kind === 'ready' && !was.posts.length && listed.length) {
        rises.current = { ...rises.current, ids: new Set(listed.slice(0, STAGGER.itemsMax).map((p) => p.id)) }
      }
      // Yours just posted, until the server lists it: on the chips it would be on.
      const yours = [...created.current.values()].filter((p) => chip === 'all' || chip === 'mine' || chip === p.kind)
      const onPages = [...yours, ...listed, ...older.current]
      const link = linkedPost.current
      const linkedOnTop = chip === 'all' && link && !removed.current.has(link.id) && !onPages.some((p) => p.id === link.id) ? [link] : []
      setLoad({ kind: 'ready', posts: [...(chip === 'all' || chip === 'mine' ? gone : []), ...linkedOnTop, ...onPages] })
      setRefreshFailed(false)
      // On top only while the Lobby still has it for you: asked again on every read, and dropped once it says no.
      if (link && linkedOnTop.length) void recheckLinked(eventId, link.id)
      return true
    } catch (error) {
      Logger.warn('board', 'load threw', { eventId, error: String(error) })
      return false
    }
  }, [eventId, loadRef, heldRef, scrolledRef, recheckLinked])

  /*
   * A block from anywhere (a post's card here, a profile, a request in the Banter): the older pages loaded are dropped,
   * a page still on its way is ignored, the cursor is forgotten and the fresh first page, which the server now
   * filters, brings the next one.
   */
  useOnBlock(() => {
    pageEpoch.current += 1
    // A block hides people the linked post may be from: it goes with the older pages, and comes back only if a page lists it.
    linkedPost.current = null
    older.current = []
    setCursor(null)
    setMoreState('idle')
    void fetchBoard()
  })

  // On focus, so coming back from the Banter shows what was answered there.
  useFocusEffect(
    useCallback(() => {
      void fetchBoard().then((ok) => {
        if (!ok) setLoad((prev) => (prev.kind === 'ready' ? prev : { kind: 'failed' }))
      })
    }, [fetchBoard])
  )

  /*
   * Live while you look (PR #401 drive: an ask showed as "1 asked" only after
   * leaving and coming back). There is no board socket event, so: the
   * `board_request` push as it lands in the foreground, and a quiet read every
   * 30 s while the board is focused for when pushes are off. Focus reads it too.
   */
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((n) => {
      if (n.request.content.data?.type === 'board_request') void fetchBoard('hold')
    })
    return () => sub.remove()
  }, [fetchBoard])
  /* Your post was taken down (the socket tells its author alone): it goes at once, and the re-read brings the card. */
  useEffect(
    () =>
      subscribeToBoardPostRemoved((data) => {
        if (data.eventId !== eventId) return
        removed.current.add(data.postId)
        void fetchBoard()
      }),
    [eventId, fetchBoard]
  )
  useLiveSync({
    enabled: !!eventId,
    onSync: async () => {
      await fetchBoard('hold')
    },
    syncOnFocus: false,
    connectedIntervalMs: BOARD_POLL_MS,
    disconnectedIntervalMs: BOARD_POLL_MS,
  })

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const ok = await fetchBoard()
      // A failed refresh keeps the list it had and says so, rather than blanking it.
      setRefreshFailed(!ok)
      if (!ok) setLoad((prev) => (prev.kind === 'ready' ? prev : { kind: 'failed' }))
    } finally {
      setRefreshing(false)
    }
  }, [fetchBoard])

  const posts = useMemo(() => (load.kind === 'ready' ? sortBoardPosts(load.posts).filter((p) => !held.has(p.id)) : []), [load, held])
  const layout = lobbyLayout(meta, filter, posts.length)
  const linked = useLinkedPost({
    eventId,
    postParam: postAsked,
    linkedRef: linkedPost,
    removedRef: removed,
    epochRef: pageEpoch,
    posts: load.kind === 'ready' ? posts : null,
    listRef,
    viewOffset: contentTop,
    animated: !reduceMotion,
    onClosed: useCallback(() => setClosed(true), []),
    onFound: useCallback((post: BoardPostView) => {
      setLoad((prev) => (prev.kind === 'ready' && !prev.posts.some((p) => p.id === post.id) ? { kind: 'ready', posts: [post, ...prev.posts] } : prev))
    }, []),
  })
  const readOnly = meta.state === 'read_only'

  /** A chip: the server's filter, from its first page; the older pages and their cursor were for the other chip. */
  const onFilter = useCallback(
    (next: LobbyFilter) => {
      if (next === filterRef.current) return
      filterRef.current = next
      pageEpoch.current += 1
      older.current = []
      setCursor(null)
      setMoreState('idle')
      setFilter(next)
      void fetchBoard()
    },
    [fetchBoard]
  )

  const showHeld = useCallback(() => {
    setHeld(new Set())
    listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion })
  }, [reduceMotion])

  /** The going gate: say so here, and the Lobby re-reads with the composer in its slot. */
  /**
   * A start tapped under a gate (audit A-1): the gate's step first (I'm going, or Finish your profile), and the composer
   * for that start opens once the server lets you post, here or on the way back from the profile.
   */
  const pendingStart = useRef<'offer' | 'seeking' | null>(null)
  const sayGoing = useCallback(async () => {
    if (!eventId || gate.busy) return
    setGate({ busy: true, refusal: null })
    try {
      const result = await apiClient.rsvpToEvent(eventId, 'going')
      if (!result.success) {
        const line = boardMessage(result, "Couldn’t say you’re going. Try again.")
        setGate({ busy: false, refusal: line })
        announce(line)
        // A start that asked for this does not open its composer later, out of nowhere.
        pendingStart.current = null
        return
      }
      H.success()
      setGate({ busy: false, refusal: null })
      void fetchBoard()
    } catch {
      pendingStart.current = null
      setGate({ busy: false, refusal: "Couldn’t say you’re going. Try again." })
    }
  }, [eventId, gate.busy, fetchBoard])

  const compose = useCallback((kind: 'offer' | 'seeking' = 'offer') => {
    setStartKind(kind)
    setComposing(true)
  }, [])
  const startFromGate = (kind: 'offer' | 'seeking') => {
    if (layout.top === 'composer') return compose(kind)
    pendingStart.current = kind
    if (layout.top === 'going') return void sayGoing()
    router.push('/edit-profile')
  }
  // The gate lifted with a start waiting: open its composer once.
  useEffect(() => {
    if (layout.top !== 'composer' || !pendingStart.current) return
    const kind = pendingStart.current
    pendingStart.current = null
    compose(kind)
  }, [layout.top, compose])
  const seeAsks = useCallback(() => router.push('/(tabs)/chat'), [])

  /* The next page as the end comes near: one at a time, appended once, and never after a refusal until it is asked again. */
  const loadMore = useCallback(async () => {
    if (!eventId || !cursor || moreBusy.current) return
    moreBusy.current = true
    setMoreState('loading')
    const epoch = pageEpoch.current
    try {
      const result = await getBoardPage(eventId, cursor, filterQuery(filterRef.current))
      if (epoch !== pageEpoch.current) {
        setMoreState('idle')
        return
      }
      if (!result.success || !result.data) {
        setMoreState('failed')
        return
      }
      const fresh = result.data.posts.filter((p) => !removed.current.has(p.id))
      const have = new Set(older.current.map((p) => p.id))
      older.current = [...older.current, ...fresh.filter((p) => !have.has(p.id))]
      setCursor(cursorOf(result.data))
      setMoreState('idle')
      setLoad((prev) => {
        if (prev.kind !== 'ready') return prev
        const shown = new Set(prev.posts.map((p) => p.id))
        return { kind: 'ready', posts: [...prev.posts, ...fresh.filter((p) => !shown.has(p.id))] }
      })
    } catch (error) {
      Logger.warn('board', 'next page threw', { eventId, error: String(error) })
      setMoreState('failed')
    } finally {
      moreBusy.current = false
    }
  }, [eventId, cursor])

  const ask = useCallback(
    async (post: BoardPost) => {
      // A ref, not state: a second tap in the same frame sees the first.
      if (!eventId || asking.current.has(post.id)) return
      asking.current.add(post.id)
      setLocalAsks((prev) => ({ ...prev, [post.id]: { kind: 'asking' } }))
      let next: AskState
      try {
        const result = await apiClient.askOnBoard(eventId, post.id)
        if (result.success) {
          // The server's yes (Flow 4 Board: no press haptic, H.success when the ask is recorded).
          H.success()
          next = { kind: 'settled', line: WAITING_LINE }
        } else if (isSettled(result)) {
          // One ask per post, ever: a re-ask reads as waiting. A full offer says full.
          next = { kind: 'settled', line: askConflictLine(result) }
        } else if (result.errorCode === 'NOT_FOUND') {
          // The post is gone — taken down, or its author and you are blocked. Same answer for both.
          next = { kind: 'settled', line: CLOSED_LINE }
        } else {
          // Which gate, in the server's words; the button stays for another try.
          next = { kind: 'refused', line: boardMessage(result, "Couldn’t send that. Try again.") }
        }
      } catch {
        next = { kind: 'refused', line: "Couldn’t send that. Try again." }
      } finally {
        asking.current.delete(post.id)
      }
      setLocalAsks((prev) => ({ ...prev, [post.id]: next }))
      announce(next.line)
    },
    [eventId]
  )

  const takeDown = useCallback(
    (post: BoardPost) => {
      if (!eventId) return
      showSheet({
        kind: 'actions',
        title: 'Take your post down?',
        message: 'It leaves the Lobby. Anybody who asked is not told why.',
        actions: [
          {
            label: 'Take down',
            variant: 'destructive',
            run: async () => {
              const result = await apiClient.withdrawBoardPost(eventId, post.id)
              // Already gone is gone: the outcome they asked for.
              if (!result.success && result.errorCode !== 'NOT_FOUND') {
                return { ok: false, error: boardMessage(result, "Couldn’t take it down. Try again.") }
              }
              removed.current.add(post.id)
              created.current.delete(post.id)
              setLoad((prev) =>
                prev.kind === 'ready' ? { kind: 'ready', posts: prev.posts.filter((p) => p.id !== post.id) } : prev
              )
              return { ok: true, toast: 'Taken down' }
            },
          },
          { label: 'Cancel', cancel: true },
        ],
      })
    },
    [eventId]
  )

  const submit = useCallback(
    async (draft: LobbyDraft) => {
      if (!eventId || postingRef.current) return
      postingRef.current = true
      setPosting(true)
      setRefusal(null)
      try {
        const result = await apiClient.postToBoard(eventId, draft)
        if (!result.success || !result.data) {
          // Which gate — going, profile, a cap, the doors, the filter — in the server's words.
          const line = boardMessage(result, "Couldn’t post that. Try again.")
          setRefusal(line)
          announce(line)
          return
        }
        // Yours until the server lists it under your handle at this event.
        // Server confirmed: a post is an important-enough outcome for H.success (haptics: check-in, RSVP, post, save profile).
        H.success()
        const mine: BoardPostView = { ...result.data, author: 'You', mine: true, requestCount: 0 }
        created.current.set(mine.id, mine)
        // Your own post rises in whatever the list was (#16); a poll that lists it later does not rise it again.
        rises.current = { ...rises.current, ids: new Set(rises.current.ids).add(mine.id) }
        setLoad((prev) => (prev.kind === 'ready' ? { kind: 'ready', posts: [mine, ...prev.posts] } : prev))
        setComposing(false)
        setPosted((n) => n + 1)
        announce('Posted')
        void fetchBoard()
      } catch {
        setRefusal("Couldn’t post that. Try again.")
      } finally {
        postingRef.current = false
        setPosting(false)
      }
    },
    [eventId, fetchBoard]
  )

  /** Report or block the author, by the post: the board never names anybody to the client. */
  const more = useCallback(
    (post: BoardPost) => {
      if (!eventId) return
      showSheet(
        boardSafetySheet({ kind: 'post', eventId, postId: post.id }, post.author, () => {
          removed.current.add(post.id)
          // A block hides the person, not the one post: their posts leave every page already loaded at once (the handle
          // is the board's one name for them). The older pages, the cursor and the fresh first page follow from the
          // block epoch (`useOnBlock` above), which every route to a block moves.
          const blocked = post.author
          for (const [id, p] of created.current) if (!p.mine && p.author === blocked) created.current.delete(id)
          if (linkedPost.current && !linkedPost.current.mine && linkedPost.current.author === blocked) linkedPost.current = null
          setLoad((prev) =>
            prev.kind === 'ready' ? { kind: 'ready', posts: prev.posts.filter((p) => p.id !== post.id && (p.mine || p.author !== blocked)) } : prev
          )
        })
      )
    },
    [eventId]
  )

  const askFor = useCallback(
    (id: string): AskState => {
      const local = localAsks[id]
      const listed = listedAsks[id]
      if (local && !(local.kind === 'settled' && listed)) return local
      return listed ?? IDLE
    },
    [localAsks, listedAsks]
  )

  const renderItem = useCallback(
    ({ item, index }: { item: BoardPostView; index: number }) => {
      const { first, ids } = rises.current
      const rises_ = first || ids.has(item.id)
      const entering = rises_ ? (reduceMotion ? fadeIn : riseIn)(first ? riseDelay(index) : 0) : undefined
      return (
        <Animated.View entering={entering}>
          <BoardPostCard
            post={item}
            eventId={eventId}
            ask={askFor(item.id)}
            readOnly={readOnly}
            onAsk={ask}
            onTakeDown={takeDown}
            onMore={more}
            onSeeAsks={seeAsks}
            onWriteNew={() => compose()}
          />
        </Animated.View>
      )
    },
    [eventId, askFor, ask, takeDown, more, reduceMotion, readOnly, seeAsks, compose]
  )
  // What rose has risen: once drawn, the first load is over and nothing is waiting to rise (a row scrolled back in never replays).
  useEffect(() => {
    if (load.kind === 'ready') rises.current = { first: false, ids: new Set() }
  }, [load])

  /* Flow 15 #16: reads stay, and the screen says what it is showing. */
  const offline = <OfflineBanner text="Offline. Showing what you had." testID="board-offline" />

  const top =
    layout.top === 'composer' ? (
      <LobbyComposerRow seed={meta.you?.pseudonym ?? null} onCompose={() => compose()} />
    ) : layout.top === 'going' ? (
      <LobbyGate gate="going" busy={gate.busy} refusal={gate.refusal} onPress={() => void sayGoing()} />
    ) : layout.top === 'profile' ? (
      <LobbyGate gate="profile" onPress={() => router.push('/edit-profile')} />
    ) : layout.top === 'readOnly' ? (
      <ReadOnlyBanner closesAt={meta.closesAt} timeZone={event?.timeZone} onOpenRoom={openRoomFromBoard} />
    ) : null

  const header = (
    <View style={styles.header}>
      {offline}
      {refreshFailed && load.kind === 'ready' ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary, styles.centre]}>The Lobby didn’t refresh. Pull down to try again.</Text>
      ) : null}
      {linked.note ? (
        <Text testID="board-link-note" maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary, styles.centre]}>{linked.note}</Text>
      ) : null}
      {top}
      {layout.chips && meta.counts ? (
        <View style={styles.chipsGap}>
          <LobbyChips counts={meta.counts} filter={filter} onFilter={onFilter} />
        </View>
      ) : null}
      {layout.pinned && meta.pinned ? <PinnedPost pin={meta.pinned} /> : null}
      {layout.liveEmpty ? <LiveEmptyCard onOpenRoom={openRoomFromBoard} /> : null}
      {/* #47: the first post is why the starts leave: they fade over `quick` with an 8 pt drop as the card rises in. */}
      {layout.starts && !posts.length ? (
        <Animated.View exiting={emptyOut(reduceMotion)}>
          <LobbyStarts ticketsHidden={meta.ticketsHidden} onStart={startFromGate} />
        </Animated.View>
      ) : null}
    </View>
  )

  let content: ReactNode
  if (closed) {
    content = <ClosedCard />
  } else if (doorsShut) {
    content = <ReadOnlyBanner onOpenRoom={openRoomFromBoard} />
  } else if (load.kind === 'loading') {
    content = <BoardSkeleton />
  } else if (load.kind === 'refused') {
    content = (
      <StateScreen
        icon="circle-slash"
        title={(load.code && REFUSED_TITLE[load.code]) || 'Not in this Lobby yet'}
        body={load.line}
        actions={[{ label: 'Back to the event', kind: 'secondary', onPress: () => router.back() }]}
        testID="board-refused"
      />
    )
  } else if (load.kind === 'failed') {
    content = (
      <StateScreen
        icon="cloud-off"
        title="The Lobby didn’t load"
        body="Check your connection and try again."
        actions={[{ label: 'Try again', onPress: () => void onRefresh(), loading: refreshing }]}
        testID="board-failed"
      />
    )
  } else {
    content = (
      <FlatList
        testID="board-list"
        ref={listRef}
        data={posts}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        // A card's ask state lives outside `data`; this redraws the rows when it moves.
        extraData={askFor}
        ListHeaderComponent={header}
        ListEmptyComponent={
          filter !== 'all' ? (
            // Narrowed to nothing: the Lobby is not empty, so it never says "Nobody's posted yet".
            <StateScreen
              icon="search"
              title={FILTER_EMPTY[filter]}
              body="Every post is under All."
              actions={[{ label: 'Show every post', kind: 'secondary', onPress: () => onFilter('all') }]}
              testID="board-filter-empty"
            />
          ) : null
        }
        ListFooterComponent={
          <PageFooter loading={moreState === 'loading'} failed={moreState === 'failed'} onRetry={() => void loadMore()} what="posts" testID="board-more-failed" />
        }
        // A page of posts at a time as the end nears; each card is its own height, so the list windows and nothing else is done to it.
        onEndReached={() => {
          if (moreState !== 'failed') void loadMore()
        }}
        onEndReachedThreshold={1.5}
        onScrollToIndexFailed={linked.onScrollToIndexFailed}
        initialNumToRender={8}
        windowSize={9}
        contentContainerStyle={[styles.list, { paddingTop: contentTop }]}
        scrollIndicatorInsets={{ top: bar.indicatorTop }}
        {...bar.scrollProps}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOR.textSecondary} progressViewOffset={bar.indicatorTop} />}
      />
    )
  }

  // The Lobby's own cards (closed, the old doors) sit where the composer would; a whole-screen state is centred.
  const card = closed || doorsShut
  return (
    <View style={styles.container}>
      {/* #30: the list scrolls under the bar, and the glass comes in behind the title once it has. */}
      {load.kind === 'ready' && !card ? (
        content
      ) : (
        <View style={[styles.fill, { paddingTop: contentTop }]}>
          <View style={styles.banner}>{offline}</View>
          <View style={card ? styles.cardSlot : styles.state}>{content}</View>
        </View>
      )}
      {held.size > 0 && load.kind === 'ready' && !card ? <NewPostsPill count={held.size} top={contentTop + SPACE.sm} onPress={showHeld} /> : null}
      <View testID="lobby-bar" style={bar.barPin} pointerEvents="box-none" onLayout={(e) => setBarDrawn(e.nativeEvent.layout.height)}>
        <TopBar
          title="Lobby"
          sub={event?.title}
          subLines={1}
          state={bar.state}
          onBack={() => router.back()}
          actions={closed ? [] : [{ icon: 'bell', label: 'Lobby alerts', onPress: () => setAlertsOpen(true) }]}
          testID="board-top"
        />
      </View>
      {eventId ? <LobbyAlertsSheet eventId={eventId} visible={alertsOpen} onClose={() => setAlertsOpen(false)} /> : null}
      <LobbyCompose
        key={`${posted}-${startKind}`}
        initialKind={startKind}
        pseudonym={meta.you?.pseudonym ?? null}
        subKinds={meta.subKinds}
        ticketsHidden={meta.ticketsHidden ?? false}
        visible={composing}
        posting={posting}
        refusal={refusal}
        onPost={(draft) => void submit(draft)}
        onCancel={() => {
          setComposing(false)
          setRefusal(null)
        }}
      />
    </View>
  )
}

/** Card-shaped (three offer cards), so the list does not jump when it lands. */
function BoardSkeleton() {
  return (
    <View accessible style={styles.skeleton} accessibilityLabel="Loading the Lobby">
      {[0, 1, 2].map((i) => (
        <SkeletonBlock key={i} width="100%" height={SKELETON_CARD} borderRadius={RADIUS.card} />
      ))}
    </View>
  )
}

/** A chip that found nothing, in its own words. */
const FILTER_EMPTY: Record<Exclude<LobbyFilter, 'all'>, string> = {
  offer: 'Nobody’s offering yet',
  seeking: 'Nobody’s looking yet',
  chat: 'Nobody’s just saying yet',
  mine: 'You haven’t posted here yet',
  replies: 'No replies to you yet',
}

/** A focused board re-reads this often when no push says an ask arrived. */
const BOARD_POLL_MS = 30_000

/** flow4.js board `loading`: three 168 pt cards. */
const SKELETON_CARD = 168

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.ink },
  fill: { flex: 1 },
  secondary: { color: COLOR.textSecondary },
  ink: { color: COLOR.textPrimary },
  centre: { textAlign: 'center' },
  // lobby.css: composer 12 above the chips, the chips 16 above the first card, cards 12 apart.
  header: { gap: SPACE.md },
  list: { paddingHorizontal: SPACE.gutter, paddingBottom: SPACE.xxl, gap: SPACE.md },
  state: { flex: 1, paddingHorizontal: SPACE.gutter, justifyContent: 'center' },
  // lobby.css `.lposts`: 16 under the chips, where the header's rhythm is 12.
  chipsGap: { marginBottom: SPACE.xs },
  cardSlot: { paddingHorizontal: SPACE.gutter },
  banner: { paddingHorizontal: SPACE.gutter },
  skeleton: { gap: SPACE.lg },
})

function openRoomFromBoard() {
  if (router.canDismiss()) router.dismissAll()
  openBlendn()
}

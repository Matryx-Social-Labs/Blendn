import * as Notifications from 'expo-notifications'
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'

import { PageFooter } from '../../components/chat/PageFooter'
import { Button } from '../../components/ds/Button'
import { font, HueProvider, useBoldText } from '../../components/ds/shared'
import { ChipSet, type ChipItem } from '../../components/ds/ChipSet'
import { SectionHeader } from '../../components/ds/SectionHeader'
import { StateScreen } from '../../components/ds/StateScreen'
import { TopBar } from '../../components/ds/TopBar'
import {
  announce,
  BoardComposer,
  BoardPostCard,
  IDLE,
  type AskState,
  type BoardDraft,
} from '../../components/board/BoardSections'
import { emptyOut, fadeIn, riseDelay, riseIn } from '../../components/board/boardMotion'
import { OfflineBanner } from '../../components/OfflineBanner'
import { SkeletonBlock } from '../../components/Skeleton'
import { apiClient } from '../../lib/apiClient'
import {
  askConflictLine,
  BOARD_CLOSED_SENTENCE,
  BOARD_ENABLED,
  boardClosed,
  boardMessage,
  CLOSED_LINE,
  isSettled,
  outgoingLine,
  sortBoardPosts,
  WAITING_LINE,
  type BoardPost,
} from '../../lib/board'
import { openBlendn } from '../../lib/blendnOverlay'
import { Logger } from '../../lib/logger'
import { subscribeToBoardPostRemoved } from '../../lib/socketClient'
import { useLatest } from '../../lib/useLatest'
import { useLiveSync } from '../../lib/useLiveSync'
import { useOnBlock } from '../../lib/useOnBlock'
import { boardSafetySheet } from '../../lib/safetyUtils'
import { showSheet } from '../../lib/sheet'
import { cursorOf, getBoardPage, goneFrom, type BoardPostView, type TakenDown } from '../../lib/chatPaging'
import { COLOR, RADIUS, SPACE, STAGGER, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useTopBarOverlay } from '../../lib/useTopBarState'
import { useReducedMotion } from '../../lib/motion'

/**
 * The Board (Flow 4 Board, flow4.js `board`; the rules in docs/PLACEHOLDER_SCREENS.md §6).
 *
 * Going alone, and looking for somebody to go with. Posts before doors, by
 * pseudonym; an ask is one tap; the answer arrives in the Banter. Every gate is
 * the server's (`GET/POST /events/:eventId/board`, `…/requests`) and every
 * refusal says which gate, in the server's words.
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

type BoardFilter = 'offer' | 'seeking'
/** The two kinds people come to a board for, in the cards' own words (`BoardPostCard`). */
const FILTERS: readonly ChipItem[] = [
  { key: 'offer', label: 'Offering' },
  { key: 'seeking', label: 'Looking' },
]
/** Under this many posts the whole board is a glance: no filter to learn. */
const FILTER_FROM = 10
/** The board's own count, from its first page's pagination; null from an older server. */
const totalOf = (body: unknown): number | null => {
  const n = (body as { pagination?: { totalCount?: unknown } } | null)?.pagination?.totalCount
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null
}

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; posts: BoardPostView[] }
  /** The board answered no: not going, under 18, or no such board. */
  | { kind: 'refused'; code: string | undefined; line: string }
  | { kind: 'failed' }

/** The event as the server has it: the title and the doors are its, not the link's. */
type EventFacts = { title: string; startTime: string | null }

const REFUSED_TITLE: Record<string, string> = {
  AGE_RESTRICTED: 'This board has an age limit',
  NOT_FOUND: "This board isn’t here",
}

export function BoardScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>()
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
  /** How many posts the board has, the server's count (TG-15): what the list can show is a page of them. */
  const [total, setTotal] = useState<number | null>(null)
  /** Offering or Looking only, or every post: over the loaded pages, which keep loading as the end nears. */
  const [kindFilter, setKindFilter] = useState<BoardFilter | null>(null)
  const [moreState, setMoreState] = useState<'idle' | 'loading' | 'failed'>('idle')
  const older = useRef<BoardPostView[]>([])
  const moreBusy = useRef(false)
  /** Moves when what the older pages hold stops being true (a block): a page still on its way is for the old board. */
  const pageEpoch = useRef(0)
  /* #16 / #47: the first load rises in, 28 ms apart, and so does what arrives where there was nothing; scroll and page inserts never do. */
  const reduceMotion = useReducedMotion()
  const rises = useRef<{ first: boolean; ids: ReadonlySet<string> }>({ first: true, ids: new Set() })
  const bar = useTopBarOverlay()

  // The doors by the event's own time, or by the board saying so — whichever is known first.
  const [doorsShut, setDoorsShut] = useState(false)
  const closed = doorsShut || boardClosed(event?.startTime)

  const fetchBoard = useCallback(async (): Promise<boolean> => {
    if (!eventId) return false
    const id = ++readId.current
    try {
      const [board, mine, facts] = await Promise.all([
        apiClient.getBoard(eventId),
        apiClient.getBoardRequests(),
        apiClient.getEvent(eventId),
      ])
      if (id !== readId.current) return true
      if (facts.success && facts.data) {
        setEvent({ title: facts.data.title, startTime: facts.data.startTime ?? facts.data.start_time ?? null })
      }
      if (!board.success || !board.data) {
        if (board.error?.trim() === BOARD_CLOSED_SENTENCE) {
          setDoorsShut(true)
          return true
        }
        const code = board.errorCode
        if (code === 'FORBIDDEN' || code === 'AGE_RESTRICTED' || code === 'NOT_FOUND') {
          setLoad({ kind: 'refused', code, line: boardMessage(board, 'This board is not open to you.') })
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
      setTotal(totalOf(board.data))
      // Nothing, then something (#47): what arrives rises in once; a poll that finds more does not.
      const was = loadRef.current
      if (was.kind === 'ready' && !was.posts.length && listed.length) {
        rises.current = { ...rises.current, ids: new Set(listed.slice(0, STAGGER.itemsMax).map((p) => p.id)) }
      }
      setLoad({ kind: 'ready', posts: [...gone, ...created.current.values(), ...listed, ...older.current] })
      setRefreshFailed(false)
      return true
    } catch (error) {
      Logger.warn('board', 'load threw', { eventId, error: String(error) })
      return false
    }
  }, [eventId, loadRef])

  /*
   * A block from anywhere (a post's card here, a profile, a request in the Banter): the older pages loaded are dropped,
   * a page still on its way is ignored, the cursor is forgotten and the fresh first page, which the server now
   * filters, brings the next one.
   */
  useOnBlock(() => {
    pageEpoch.current += 1
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
      if (n.request.content.data?.type === 'board_request') void fetchBoard()
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
      await fetchBoard()
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

  const allPosts = useMemo(() => (load.kind === 'ready' ? sortBoardPosts(load.posts) : []), [load])
  const posts = useMemo(() => (kindFilter ? allPosts.filter((p) => p.kind === kindFilter) : allPosts), [allPosts, kindFilter])

  /* The next page as the end comes near: one at a time, appended once, and never after a refusal until it is asked again. */
  const loadMore = useCallback(async () => {
    if (!eventId || !cursor || moreBusy.current) return
    moreBusy.current = true
    setMoreState('loading')
    const epoch = pageEpoch.current
    try {
      const result = await getBoardPage(eventId, cursor)
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
        message: 'It leaves the board. Anybody who asked is not told why.',
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
    async (draft: BoardDraft) => {
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
            onAsk={ask}
            onTakeDown={takeDown}
            onMore={more}
            onWriteNew={() => setComposing(true)}
          />
        </Animated.View>
      )
    },
    [eventId, askFor, ask, takeDown, more, reduceMotion]
  )
  // What rose has risen: once drawn, the first load is over and nothing is waiting to rise (a row scrolled back in never replays).
  useEffect(() => {
    if (load.kind === 'ready') rises.current = { first: false, ids: new Set() }
  }, [load])

  /* Flow 15 #16: reads stay, and the screen says what it is showing. */
  const offline = <OfflineBanner text="Offline. Showing what you had." testID="board-offline" />

  const header = (
    <View style={styles.header}>
      {offline}
      {refreshFailed && load.kind === 'ready' ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary, styles.centre]}>The board didn’t refresh. Pull down to try again.</Text>
      ) : null}
      {load.kind === 'ready' && load.posts.length > 0 && !allPosts.some((p) => p.mine) ? (
        <Button label="Write a post" onPress={() => setComposing(true)} />
      ) : null}
      {/* A busy board (120 posts) says how many, and can be narrowed to what you came for (B-R10). */}
      {total !== null && total > 0 ? <SectionHeader title="Posts" count={total} testID="board-count" /> : null}
      {total !== null && total >= FILTER_FROM ? (
        <ChipSet
          items={FILTERS}
          selection="single"
          selected={kindFilter ? [kindFilter] : []}
          onToggle={(key) => setKindFilter((now) => (now === key ? null : (key as BoardFilter)))}
          testID="board-filter"
        />
      ) : null}
    </View>
  )

  let content: ReactNode
  if (closed) {
    content = (
      <StateScreen
        icon="lock"
        title="The board’s closed"
        body="The doors are open, so the room is open instead."
        // To the tabs first: the overlay is under the root stack, so opened from here it was under the board (Flow 4 Board #14).
        actions={[{ label: 'Open the room', onPress: openRoomFromBoard }]}
        testID="board-closed"
      />
    )
  } else if (load.kind === 'loading') {
    content = <BoardSkeleton />
  } else if (load.kind === 'refused') {
    content = (
      <StateScreen
        icon="circle-slash"
        title={(load.code && REFUSED_TITLE[load.code]) || 'Not on this board yet'}
        body={load.line}
        actions={[{ label: 'Back to the event', kind: 'secondary', onPress: () => router.back() }]}
        testID="board-refused"
      />
    )
  } else if (load.kind === 'failed') {
    content = (
      <StateScreen
        icon="cloud-off"
        title="The board didn’t load"
        body="Check your connection and try again."
        actions={[{ label: 'Try again', onPress: () => void onRefresh(), loading: refreshing }]}
        testID="board-failed"
      />
    )
  } else {
    content = (
      <FlatList
        testID="board-list"
        data={posts}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        // A card's ask state lives outside `data`; this redraws the rows when it moves.
        extraData={askFor}
        ListHeaderComponent={header}
        ListEmptyComponent={
          kindFilter && allPosts.length > 0 ? (
            // Narrowed to nothing: the board is not empty, so it never says "Nobody's posted yet".
            <StateScreen
              icon="search"
              title={kindFilter === 'offer' ? 'Nobody’s offering yet' : 'Nobody’s looking yet'}
              body="Loaded so far. More come as you scroll the whole board."
              actions={[{ label: 'Show every post', kind: 'secondary', onPress: () => setKindFilter(null) }]}
              testID="board-filter-empty"
            />
          ) : (
            // #47: the first post is why this leaves: it fades over `quick` with an 8 pt drop as the card rises in.
            <Animated.View exiting={emptyOut(reduceMotion)}>
              <StateScreen
                icon="message-square-dashed"
                title="Nobody’s posted yet"
                body="Say what you’re looking for, and people on their way will see it."
                actions={[{ label: 'Write a post', onPress: () => setComposing(true) }]}
                testID="board-empty"
              />
            </Animated.View>
          )
        }
        ListFooterComponent={
          <PageFooter loading={moreState === 'loading'} failed={moreState === 'failed'} onRetry={() => void loadMore()} what="posts" testID="board-more-failed" />
        }
        // A page of posts at a time as the end nears; each card is its own height, so the list windows and nothing else is done to it.
        onEndReached={() => {
          if (moreState !== 'failed') void loadMore()
        }}
        onEndReachedThreshold={1.5}
        initialNumToRender={8}
        windowSize={9}
        contentContainerStyle={[styles.list, { paddingTop: bar.contentTop }]}
        scrollIndicatorInsets={{ top: bar.indicatorTop }}
        {...bar.scrollProps}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOR.textSecondary} progressViewOffset={bar.indicatorTop} />}
      />
    )
  }

  return (
    <View style={styles.container}>
      {/* #30: the list scrolls under the bar, and the glass comes in behind the title once it has. */}
      {load.kind === 'ready' && !closed ? (
        content
      ) : (
        <View style={[styles.fill, { paddingTop: bar.contentTop }]}>
          <View style={styles.banner}>{offline}</View>
          <View style={styles.state}>{content}</View>
        </View>
      )}
      <View style={bar.barPin} pointerEvents="box-none">
        <TopBar title="The Board" sub={event?.title} state={bar.state} onBack={() => router.back()} testID="board-top" />
      </View>
      <BoardComposer
        key={posted}
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
    <View style={styles.skeleton} accessibilityLabel="Loading the board">
      {[0, 1, 2].map((i) => (
        <SkeletonBlock key={i} width="100%" height={SKELETON_CARD} borderRadius={RADIUS.card} />
      ))}
    </View>
  )
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
  header: { gap: SPACE.lg, marginBottom: SPACE.lg },
  list: { paddingHorizontal: SPACE.gutter, paddingBottom: SPACE.xxl, gap: SPACE.lg },
  state: { flex: 1, paddingHorizontal: SPACE.gutter, justifyContent: 'center' },
  banner: { paddingHorizontal: SPACE.gutter },
  skeleton: { gap: SPACE.lg },
})

function openRoomFromBoard() {
  if (router.canDismiss()) router.dismissAll()
  openBlendn()
}

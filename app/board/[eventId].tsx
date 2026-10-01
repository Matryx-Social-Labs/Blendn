import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { FlatList, KeyboardAvoidingView, Pressable, RefreshControl, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppHeader } from '../../components/AppHeader'
import {
  announce,
  BoardComposer,
  BoardPostCard,
  IDLE,
  type AskState,
  type BoardDraft,
} from '../../components/board/BoardSections'
import { LoadError, LoadState } from '../../components/LoadError'
import { SkeletonBlock } from '../../components/Skeleton'
import { PlaceholderBanner } from '../../components/ui/PlaceholderBanner'
import { Text } from '../../components/ui/Text'
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
import { KEYBOARD_BEHAVIOR } from '../../lib/keyboard'
import { Logger } from '../../lib/logger'
import { boardSafetySheet } from '../../lib/safetyUtils'
import { showSheet } from '../../lib/sheet'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, OPACITY, SPACE } from '../../lib/theme'

/**
 * The Board — PLACEHOLDER DESIGN (docs/PLACEHOLDER_SCREENS.md §6).
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
  if (!BOARD_ENABLED) return <Redirect href="/(tabs)/events" />
  return <BoardScreen />
}

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; posts: BoardPost[] }
  /** The board answered no: not going, under 18, or no such board. */
  | { kind: 'refused'; code: string | undefined; line: string }
  | { kind: 'failed' }

/** The event as the server has it: the title and the doors are its, not the link's. */
type EventFacts = { title: string; startTime: string | null }

const REFUSED_TITLE: Record<string, string> = {
  AGE_RESTRICTED: 'This board has an age limit',
  NOT_FOUND: "This board isn't here",
}

export function BoardScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
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

  /*
   * A read is sequenced, and it merges rather than replaces.
   *
   * `queuedRequest` shares an identical GET already in flight, so a read
   * started after a post can be answered by one started before it. So: the
   * newest read wins and an older answer is dropped, a post made here stays
   * until the server lists it, and one taken down here stays gone.
   */
  const readId = useRef(0)
  const created = useRef(new Map<string, BoardPost>())
  const removed = useRef(new Set<string>())

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
      const listed = board.data.posts.filter((p) => !removed.current.has(p.id))
      for (const p of listed) created.current.delete(p.id)
      setLoad({ kind: 'ready', posts: [...created.current.values(), ...listed] })
      setRefreshFailed(false)
      return true
    } catch (error) {
      Logger.warn('board', 'load threw', { eventId, error: String(error) })
      return false
    }
  }, [eventId])

  // On focus, so coming back from the Banter shows what was answered there.
  useFocusEffect(
    useCallback(() => {
      void fetchBoard().then((ok) => {
        if (!ok) setLoad((prev) => (prev.kind === 'ready' ? prev : { kind: 'failed' }))
      })
    }, [fetchBoard])
  )

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

  const posts = useMemo(() => (load.kind === 'ready' ? sortBoardPosts(load.posts) : []), [load])

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
          next = { kind: 'settled', line: WAITING_LINE }
        } else if (isSettled(result)) {
          // One ask per post, ever: a re-ask reads as waiting. A full offer says full.
          next = { kind: 'settled', line: askConflictLine(result) }
        } else if (result.errorCode === 'NOT_FOUND') {
          // The post is gone — taken down, or its author and you are blocked. Same answer for both.
          next = { kind: 'settled', line: CLOSED_LINE }
        } else {
          // Which gate, in the server's words; the button stays for another try.
          next = { kind: 'refused', line: boardMessage(result, "Couldn't send that. Try again.") }
        }
      } catch {
        next = { kind: 'refused', line: "Couldn't send that. Try again." }
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
                return { ok: false, error: boardMessage(result, "Couldn't take it down. Try again.") }
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
          const line = boardMessage(result, "Couldn't post that. Try again.")
          setRefusal(line)
          announce(line)
          return
        }
        // Yours until the server lists it under your handle at this event.
        const mine: BoardPost = { ...result.data, author: 'You', mine: true, requestCount: 0 }
        created.current.set(mine.id, mine)
        setLoad((prev) => (prev.kind === 'ready' ? { kind: 'ready', posts: [mine, ...prev.posts] } : prev))
        setComposing(false)
        announce('Posted')
        void fetchBoard()
      } catch {
        setRefusal("Couldn't post that. Try again.")
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
          setLoad((prev) =>
            prev.kind === 'ready' ? { kind: 'ready', posts: prev.posts.filter((p) => p.id !== post.id) } : prev
          )
          void fetchBoard()
        })
      )
    },
    [eventId, fetchBoard]
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
    ({ item }: { item: BoardPost }) => (
      <BoardPostCard
        post={item}
        eventId={eventId}
        ask={askFor(item.id)}
        onAsk={ask}
        onTakeDown={takeDown}
        onMore={more}
      />
    ),
    [eventId, askFor, ask, takeDown, more]
  )

  const header = (
    <View style={styles.header}>
      <PlaceholderBanner />
      {composing ? (
        <BoardComposer
          posting={posting}
          refusal={refusal}
          onPost={(draft) => void submit(draft)}
          onCancel={() => {
            setComposing(false)
            setRefusal(null)
          }}
        />
      ) : load.kind === 'ready' && load.posts.length > 0 ? (
        <Pressable
          onPress={() => setComposing(true)}
          accessibilityRole="button"
          accessibilityLabel="Write a post"
          style={({ pressed }) => [styles.compose, pressed && styles.pressed]}
        >
          <Text variant="button" color={EMBER.onGradient}>
            Write a post
          </Text>
        </Pressable>
      ) : null}
      {refreshFailed && load.kind === 'ready' ? (
        <Text variant="meta">The board didn&apos;t refresh. Pull down to try again.</Text>
      ) : null}
    </View>
  )

  let content: ReactNode
  if (closed) {
    content = (
      <LoadState
        icon="lock-closed-outline"
        title="The board's closed"
        message="The doors are open — the room is open instead."
        action={{ label: 'Open the room', onPress: openBlendn }}
      />
    )
  } else if (load.kind === 'loading') {
    content = <BoardSkeleton />
  } else if (load.kind === 'refused') {
    content = (
      <LoadState
        icon="people-outline"
        title={(load.code && REFUSED_TITLE[load.code]) || 'Not on this board yet'}
        message={load.line}
        action={{ label: 'Back to the event', onPress: () => router.back() }}
      />
    )
  } else if (load.kind === 'failed') {
    content = <LoadError title="The board didn't load" onRetry={() => void onRefresh()} retrying={refreshing} />
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
          composing ? null : (
            <LoadState
              icon="chatbubbles-outline"
              title="Nobody's posted yet"
              message="Say what you're looking for, and people on their way will see it."
              action={{ label: 'Write a post', onPress: () => setComposing(true) }}
            />
          )
        }
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={EMBER.textSecondary}
          />
        }
      />
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <AppHeader title="The Board" subtitle={event?.title} onBack={() => router.back()} />
      <KeyboardAvoidingView style={styles.flex} behavior={KEYBOARD_BEHAVIOR}>
        {load.kind === 'ready' && !closed ? (
          content
        ) : (
          <View style={styles.state}>
            <PlaceholderBanner />
            <View style={styles.stateBody}>{content}</View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

/** Card-shaped, so the list does not jump when it lands. */
function BoardSkeleton() {
  return (
    <View style={styles.skeleton} accessibilityLabel="Loading the board">
      {[0, 1, 2].map((i) => (
        <SkeletonBlock key={i} width="100%" height={CONTROL.lg * 3} borderRadius={EMBER_RADIUS.md} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  flex: { flex: 1 },
  pressed: { opacity: OPACITY.pressed },
  header: { gap: SPACE.lg, marginBottom: SPACE.lg },
  list: { paddingHorizontal: GUTTER, paddingBottom: SPACE.xxl, gap: SPACE.lg },
  state: { flex: 1, paddingHorizontal: GUTTER, gap: SPACE.lg },
  stateBody: { flex: 1, justifyContent: 'center' },
  compose: {
    minHeight: CONTROL.lg,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeleton: { gap: SPACE.lg },
})

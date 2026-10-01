import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { FlatList, KeyboardAvoidingView, Pressable, RefreshControl, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppHeader } from '../../components/AppHeader'
import {
  BoardComposer,
  BoardPostCard,
  type AskState,
  type ComposeKind,
} from '../../components/board/BoardSections'
import { LoadError, LoadState } from '../../components/LoadError'
import { SkeletonBlock } from '../../components/Skeleton'
import { PlaceholderBanner } from '../../components/ui/PlaceholderBanner'
import { Text } from '../../components/ui/Text'
import { apiClient } from '../../lib/apiClient'
import {
  boardClosed,
  boardMessage,
  isSettled,
  outgoingLine,
  sortBoardPosts,
  type BoardPost,
} from '../../lib/board'
import { openBlendn } from '../../lib/blendnOverlay'
import { KEYBOARD_BEHAVIOR } from '../../lib/keyboard'
import { Logger } from '../../lib/logger'
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
 * Reached from the event screen before doors only. `startTime` and `title`
 * ride in the params so the closed state needs no second request.
 */

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; posts: BoardPost[] }
  /** The board answered no: not going, under 18, or no such board. Its sentence. */
  | { kind: 'refused'; line: string }
  | { kind: 'failed' }

export default function BoardScreen() {
  const { eventId, title, startTime } = useLocalSearchParams<{
    eventId: string
    title?: string
    startTime?: string
  }>()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const [asks, setAsks] = useState<Record<string, AskState>>({})

  const [composing, setComposing] = useState(false)
  const [kind, setKind] = useState<ComposeKind>('offer')
  const [body, setBody] = useState('')
  const [spaces, setSpaces] = useState(1)
  const [posting, setPosting] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  const closed = boardClosed(startTime)

  const fetchBoard = useCallback(async (): Promise<boolean> => {
    if (!eventId) return false
    /*
     * The board and your own asks, together: the asks say which cards already
     * have yours on them, so a card you asked about yesterday does not offer
     * "Ask to join" again. If they fail the board still draws.
     */
    const [board, mine] = await Promise.all([apiClient.getBoard(eventId), apiClient.getBoardRequests()])
    if (!board.success || !board.data) {
      const status = board.errorCode
      if (status === 'FORBIDDEN' || status === 'AGE_RESTRICTED' || status === 'NOT_FOUND') {
        setLoad({ kind: 'refused', line: boardMessage(board, 'This board is not open to you.') })
        return true
      }
      Logger.warn('board', 'load failed', { eventId, error: board.error })
      return false
    }
    if (mine.success && mine.data) {
      const next: Record<string, AskState> = {}
      // Pending first, then newest (the server's order): the first per post is the one that counts.
      for (const r of mine.data.outgoing) {
        if (r.event.id !== eventId || next[r.post.id] || r.status === 'withdrawn') continue
        next[r.post.id] = { kind: 'settled', line: outgoingLine(r) }
      }
      setAsks(next)
    }
    setLoad({ kind: 'ready', posts: board.data.posts })
    setRefreshFailed(false)
    return true
  }, [eventId])

  // On focus, so coming back from the Banter shows what was answered there.
  useFocusEffect(
    useCallback(() => {
      if (closed) return
      void fetchBoard().then((ok) => {
        if (!ok) setLoad((prev) => (prev.kind === 'ready' ? prev : { kind: 'failed' }))
      })
    }, [closed, fetchBoard])
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    const ok = await fetchBoard()
    setRefreshing(false)
    // A failed refresh keeps the list it had and says so, rather than blanking it.
    setRefreshFailed(!ok)
    if (!ok && load.kind !== 'ready') setLoad({ kind: 'failed' })
  }, [fetchBoard, load.kind])

  const posts = useMemo(() => (load.kind === 'ready' ? sortBoardPosts(load.posts) : []), [load])

  const ask = useCallback(
    async (post: BoardPost) => {
      if (!eventId) return
      setAsks((prev) => ({ ...prev, [post.id]: { kind: 'asking' } }))
      const result = await apiClient.askOnBoard(eventId, post.id)
      let next: AskState
      if (result.success) {
        next = { kind: 'settled', line: outgoingLine({ live: true, status: 'pending' }) }
      } else if (isSettled(result)) {
        // A 409 — already asked, or already answered. A state, said quietly.
        next = { kind: 'settled', line: boardMessage(result, 'Waiting on them') }
      } else {
        // Which gate, in the server's words; the button stays for another try.
        next = { kind: 'refused', line: boardMessage(result, "Couldn't send that. Try again.") }
      }
      setAsks((prev) => ({ ...prev, [post.id]: next }))
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
              if (!result.success && result.errorCode !== 'NOT_FOUND') {
                return { ok: false, error: boardMessage(result, "Couldn't take it down. Try again.") }
              }
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

  const submit = useCallback(async () => {
    if (!eventId || posting) return
    setPosting(true)
    setRefusal(null)
    const text = body.trim()
    const result = await apiClient.postToBoard(eventId, {
      kind,
      body: text,
      ...(kind === 'offer' ? { spacesLeft: spaces } : {}),
    })
    setPosting(false)
    if (!result.success || !result.data) {
      // Which gate — going, profile, a cap, the filter — in the server's words.
      setRefusal(boardMessage(result, "Couldn't post that. Try again."))
      return
    }
    const created: BoardPost = {
      ...result.data,
      // The server's handle for you arrives with the next read; until then you are you.
      author: 'You',
      mine: true,
      requestCount: 0,
    }
    setLoad((prev) => (prev.kind === 'ready' ? { kind: 'ready', posts: [created, ...prev.posts] } : prev))
    setComposing(false)
    setBody('')
    setSpaces(1)
    void fetchBoard()
  }, [eventId, posting, body, kind, spaces, fetchBoard])

  const header = (
    <View style={styles.header}>
      <PlaceholderBanner />
      {composing ? (
        <BoardComposer
          kind={kind}
          body={body}
          spaces={spaces}
          posting={posting}
          refusal={refusal}
          onKind={setKind}
          onBody={setBody}
          onSpaces={setSpaces}
          onPost={() => void submit()}
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
        title="Not on this board yet"
        message={load.line}
        action={{ label: 'Back to the event', onPress: () => router.back() }}
      />
    )
  } else if (load.kind === 'failed') {
    content = <LoadError title="The board didn't load" onRetry={() => void onRefresh()} retrying={refreshing} />
  } else {
    content = (
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <BoardPostCard
            post={item}
            eventId={eventId}
            ask={asks[item.id] ?? { kind: 'idle' }}
            onAsk={() => void ask(item)}
            onTakeDown={() => takeDown(item)}
          />
        )}
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={EMBER.textSecondary} />
        }
      />
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <AppHeader title="The Board" subtitle={title} onBack={() => router.back()} />
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

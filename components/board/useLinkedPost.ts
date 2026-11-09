import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { FlatList } from 'react-native'

import { announce } from './BoardSections'
import { apiClient } from '../../lib/apiClient'
import { boardMessage } from '../../lib/board'
import type { BoardPostView } from '../../lib/chatPaging'
import { Logger } from '../../lib/logger'
import { isLinkId } from '../../lib/shareLinks'

/** A cell not drawn yet: jump near it by the average height, then land on it once it has laid out. */
const RETRY_SCROLL_MS = 120

/**
 * A post link or a match push (SCRUM-1026, 6/6): `/board/<event>?post=<id>` opens the Lobby scrolled to that post.
 * Asked after the first page is drawn, and again for each new link, through the post's own read (`GET …/board/:postId`, the Lobby's gate). A
 * post older than the page is laid on top (`linkedRef`, by the screen) until the server lists it. Closed is the Lobby's closed card; gone
 * is a line, and the Lobby stays open. An ended event's 404 is the server's to change (SCRUM-1033), not this.
 */
export function useLinkedPost(opts: {
  eventId: string | undefined
  postParam: unknown
  /** The linked post once read: the screen lays it on top of All while no page lists it. */
  linkedRef: RefObject<BoardPostView | null>
  /** Posts taken down here, and the block epoch: a post either overtook while it was read is not laid on top. */
  removedRef: RefObject<ReadonlySet<string>>
  epochRef: RefObject<number>
  posts: readonly BoardPostView[] | null
  listRef: RefObject<FlatList<BoardPostView> | null>
  viewOffset: number
  animated: boolean
  onClosed: () => void
  onFound: (post: BoardPostView) => void
}) {
  const { eventId, posts, listRef, linkedRef, removedRef, epochRef, viewOffset, animated, onClosed, onFound } = opts
  const param = isLinkId(opts.postParam) ? opts.postParam : null
  const [link, setLink] = useState(param)
  const askedFor = useRef<string | null>(null)
  const scrolledFor = useRef<string | null>(null)
  const [target, setTarget] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const ready = posts !== null

  /*
   * A second link, or a match push tapped while this Lobby is open, reuses the screen and only changes `post`: take
   * it, and drop the line an earlier link left (drive 2026-11-09: the second link did nothing). Set while rendering,
   * React's way to follow a changed prop.
   */
  if (param !== link) {
    setLink(param)
    setNote(null)
  }

  useEffect(() => {
    const postId = link
    if (!ready || !eventId || !postId || askedFor.current === postId) return
    askedFor.current = postId
    const epoch = epochRef.current
    void apiClient
      .getBoardPost(eventId, postId)
      .then((r) => {
        if (r.success && r.data?.post) {
          if (epoch !== epochRef.current || removedRef.current.has(r.data.post.id)) return
          linkedRef.current = r.data.post
          onFound(r.data.post)
          setTarget(r.data.post.id)
          return
        }
        if (r.reasonCode === 'LOBBY_CLOSED') return onClosed()
        const line = boardMessage(r, 'Couldn’t open that post.')
        setNote(line)
        announce(line)
      })
      .catch((error) =>
        Logger.warn('board', 'linked post threw', {
          eventId,
          error: String(error),
        })
      )
  }, [ready, eventId, link, linkedRef, removedRef, epochRef, onClosed, onFound])

  useEffect(() => {
    if (!target || !posts || scrolledFor.current === target) return
    const index = posts.findIndex((p) => p.id === target)
    if (index === -1) return
    scrolledFor.current = target
    listRef.current?.scrollToIndex({ index, viewOffset, animated })
  }, [target, posts, listRef, viewOffset, animated])

  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      listRef.current?.scrollToOffset({
        offset: info.averageItemLength * info.index,
        animated: false,
      })
      setTimeout(
        () =>
          listRef.current?.scrollToIndex({
            index: info.index,
            viewOffset,
            animated,
          }),
        RETRY_SCROLL_MS
      )
    },
    [listRef, viewOffset, animated]
  )

  return { note, onScrollToIndexFailed }
}

import { useRef } from 'react'

/**
 * Keep a chat list on its newest message while the reader is there.
 *
 * A single `scrollToEnd` after the first page lands measures a list that has
 * laid out `initialNumToRender` rows and none of the taller ones' real heights,
 * so it stops short: the room opened on yesterday's messages (driven
 * 2026-09-13) and the DM above where you left off (SCRUM-406). Following on
 * every content-size change until a real drag lands at the true end, and
 * content growing while somebody reads older messages leaves them where they
 * are.
 */
export interface FollowEnd {
  onContentSizeChange: () => void
  onScrollBeginDrag: () => void
  /** From `onScroll`: back at the end by hand means follow again. */
  noteAtEnd: (atEnd: boolean) => void
  /** Stop following — the thread opened somewhere else, at its first unread. */
  stop: () => void
}

export function followEnd(scrollToEnd: () => void): FollowEnd {
  let following = true
  return {
    onContentSizeChange: () => {
      if (following) scrollToEnd()
    },
    onScrollBeginDrag: () => {
      following = false
    },
    noteAtEnd: (atEnd) => {
      if (atEnd) following = true
    },
    stop: () => {
      following = false
    },
  }
}

/** `followEnd` for the life of a screen. `scrollToEnd` is read at call time. */
export function useFollowEnd(scrollToEnd: () => void): FollowEnd {
  const latest = useRef(scrollToEnd)
  latest.current = scrollToEnd
  const ref = useRef<FollowEnd | null>(null)
  if (!ref.current) ref.current = followEnd(() => latest.current())
  return ref.current
}

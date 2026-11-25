import { useRef } from 'react'
import type { FlatList, ScrollView } from 'react-native'

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
  /**
   * The reader's drag or its momentum has come to rest (`onScrollEndDrag`, `onMomentumScrollEnd`): where it stopped
   * decides. Mid-gesture, "at the end" is ignored: a drag that starts at the end reports it for its first events.
   */
  onGestureEnd: (atEnd: boolean) => void
  /** Back at the end: follow again (never mid-gesture). */
  noteAtEnd: (atEnd: boolean) => void
  /**
   * From `onScroll`. Once `stop`ped, only a reader's own drag lets it follow again: a jump that lands short of a list
   * still laying out clamps to its end, and following from there carried the thread past the first unread (SCRUM-958).
   * Mid-gesture it is ignored, as `noteAtEnd` is: a drag from the newest message reads "at the end" for its first events,
   * and following from there pulled every drag back to the newest, so a long DM would not scroll (SCRUM-1321).
   */
  noteScroll: (atEnd: boolean) => void
  /** Stop following — the thread opened somewhere else, at its first unread. */
  stop: () => void
  /**
   * The list's top (`onStartReached`) reached by the reader's own gesture: true once per drag or fling, then false until the
   * next. A first page paints at offset 0, the top, before the jump to the newest lands, so the top asked for an older page
   * that nobody scrolled to, and it landed under a list still following its end (SCRUM-1321). One per gesture: a list with
   * no `maintainVisibleContentPosition` (the room) leaves the reader at the top after a page, and the top would ask again.
   * ponytail: the list asks once per content length while it stays near its top, so an ask refused here is spent until the
   * reader moves half a screen down and back; "Load older" above the feed covers it. Pass `onStartReached` only while a
   * gesture is live if that ever reads as stuck.
   */
  readerAsksOlder: () => boolean
}

export function followEnd(scrollToEnd: () => void): FollowEnd {
  let following = true
  let held = false
  let gesture = false
  let asked = false
  return {
    onContentSizeChange: () => {
      if (following) scrollToEnd()
    },
    onScrollBeginDrag: () => {
      following = false
      held = false
      gesture = true
      asked = true
    },
    onGestureEnd: (atEnd) => {
      // Android reports momentum for the app's own animated jump too: with no gesture of the reader live, nothing ends.
      if (!gesture) return
      gesture = false
      following = atEnd
      held = false
    },
    noteAtEnd: (atEnd) => {
      if (!atEnd || gesture) return
      following = true
      held = false
    },
    noteScroll: (atEnd) => {
      if (!held && !gesture && atEnd) following = true
    },
    stop: () => {
      following = false
      held = true
    },
    readerAsksOlder: () => {
      const now = asked
      asked = false
      return now
    },
  }
}

/**
 * Scroll a list to the native view's own end.
 *
 * `FlatList.scrollToEnd` aims by an estimated height for a row not yet
 * measured — a message just sent — and a reply sent from a little way up
 * stayed below the composer (driven on build 121, 2026-09-28). The scroll
 * responder is the ScrollView itself, which ends where its content does.
 * RN's typings call it a JSX element; at runtime it is the ScrollView.
 */
export function scrollListToEnd(list: Pick<FlatList, 'getScrollResponder'> | null, animated: boolean): void {
  const scroller = list?.getScrollResponder() as unknown as Pick<ScrollView, 'scrollToEnd'> | null | undefined
  scroller?.scrollToEnd({ animated })
}

/** `followEnd` for the life of a screen. `scrollToEnd` is read at call time. */
export function useFollowEnd(scrollToEnd: () => void): FollowEnd {
  const latest = useRef(scrollToEnd)
  latest.current = scrollToEnd
  const ref = useRef<FollowEnd | null>(null)
  if (!ref.current) ref.current = followEnd(() => latest.current())
  return ref.current
}

import { memo } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { FadeOut } from 'react-native-reanimated'

import { broadcastParts } from '../../lib/chatFeed'
import { markSeed } from '../../lib/pseudonymAvatar'
import { DURATION, SPACE } from '../../lib/design/tokens'
import { isTemp, type RoomMessage } from '../../lib/roomMessages'
import { chatClock } from '../../lib/time'
import { BroadcastNotice } from '../ds/BroadcastNotice'
import { ChatBubble, type BubbleReaction } from '../ds/ChatBubble'
import type { Rect } from '../ds/chatShared'
import { StateScreen } from '../ds/StateScreen'
import { SystemLine, SystemNotice } from '../ds/SystemNotice'

export type RowHandlers = {
  menu: (m: RoomMessage, anchor: Rect) => void
  retry: (m: RoomMessage) => void
  react: (m: RoomMessage, emoji: string) => void
  reply: (m: RoomMessage) => void
  sender: (m: RoomMessage) => void
  link: (url: string) => void
}

/**
 * A sender as the bubble draws them: their pseudonym, and the creature seeded
 * on it — the one seed rule every surface shares (`markSeed`): the Grid, Room
 * info and the profile agree, and two unresolved people never share one.
 */
export const senderOf = (m: Pick<RoomMessage, 'sender_name' | 'sender_id'>, roomId: string) => ({
  name: m.sender_name,
  pseudonym: markSeed(m.sender_name, `${roomId}:${m.sender_id}`),
})

/** The six the server accepts, as the bubble draws them: counts, never who. */
const bubbleReactions = (r: RoomMessage['reactions']): BubbleReaction[] => (r ?? []).map((x) => ({ emoji: x.emoji, count: x.count, mine: !!x.mine }))

/**
 * One feed row (Flow 5 room frames): a broadcast spans the column with no
 * tail; the room speaking is a centred line; anybody else is a bubble in
 * their run — 16 above a run, 4 inside one. Memoised: a room being typed in
 * re-renders on every keystroke, and only a changed message should redraw.
 * A blocked sender's rows leave with a quick fade (R3-D5 5.7).
 */
export const RoomMessageRow = memo(function RoomMessageRow({
  item,
  roomId,
  mine,
  first,
  last,
  landed,
  senderTappable,
  handlers,
}: {
  item: RoomMessage
  /** The room: an unresolved name ("Attendee") is seeded per person here, never shared (`markSeed`). */
  roomId: string
  mine: boolean
  first: boolean
  last: boolean
  /** Your reaction that has just landed: its chip pops (#37). */
  landed?: string
  /** An event room's sender opens their card (5.1); a crew's or a Blend's is Flow 10's. */
  senderTappable: boolean
  handlers: RowHandlers
}) {
  if (item.sender_id === 'system') return <SystemLine text={item.message_text} />
  /*
   * A poll is the organiser's question. Its options and votes are a read the
   * room can't make yet — the message doesn't carry its poll's id — so it is
   * said as a notice, never as somebody's bubble. TODO(server): the poll id on
   * a `poll` message, and this becomes <PollBubble> (Flow 15 #17, R2-D2).
   */
  if (item.message_type === 'poll') {
    return (
      <View style={styles.runStart}>
        <SystemNotice icon="chart-column" text={`Poll: ${item.message_text}`} testID={`poll-${item.message_id}`} />
      </View>
    )
  }
  if (item.message_type === 'announcement' || item.message_type === 'sponsored') {
    const { from, text } = broadcastParts(item.message_type, item.message_text, item.sender_name)
    // Full width, no tail, no menu: not somebody talking to you.
    return (
      <View style={styles.runStart}>
        <BroadcastNotice kind={item.message_type} from={from} text={text} time={chatClock(item.created_at)} media={item.media} testID={`broadcast-${item.message_id}`} />
      </View>
    )
  }
  const sending = isTemp(item) && !item.failed
  return (
    <Animated.View exiting={FadeOut.duration(DURATION.quick)} style={first ? styles.runStart : styles.inRun}>
      <ChatBubble
        testID={`bubble-${item.message_id}`}
        mine={mine}
        sender={senderOf(item, roomId)}
        first={first}
        last={last}
        text={item.removed ? '' : item.message_text}
        removed={item.removed}
        replyTo={item.replyTo ? { name: item.replyTo.sender_name, text: item.replyTo.message_text } : undefined}
        reactions={bubbleReactions(item.reactions)}
        onReactionPress={item.removed || sending ? undefined : (emoji) => handlers.react(item, emoji)}
        landed={landed}
        time={chatClock(item.created_at)}
        waiting={item.waiting}
        failed={item.failed ? item.failedLine || true : false}
        onRetry={() => handlers.retry(item)}
        onReply={item.removed || sending ? undefined : () => handlers.reply(item)}
        onLongPress={item.removed ? undefined : (anchor) => handlers.menu(item, anchor)}
        onSenderPress={senderTappable && !mine ? () => handlers.sender(item) : undefined}
        onLinkPress={handlers.link}
        // Only your own sends rise from the composer (#12); history never animates.
        animateIn={sending ? 'send' : undefined}
      />
    </Animated.View>
  )
})

export type Outside =
  | { kind: 'closed'; line: string }
  | { kind: 'removed'; line: string | null }
  | { kind: 'gone' }
  | { kind: 'not_live' }
  | { kind: 'left' }
  | { kind: 'out' }

/**
 * The room, for somebody not in it (Flow 5 #25–26, R2-D2 room states): it
 * replaces the feed and the composer. Left and not-a-member offer Rejoin;
 * removed offers nothing and never says more than the server did; a room
 * that is gone, or a crew's or Blend's that closed, goes back.
 */
export function RoomOutside({
  outside,
  rejoining,
  onRejoin,
  onGoLive,
  onBack,
}: {
  outside: Outside
  rejoining: boolean
  onRejoin: () => void
  onGoLive: () => void
  onBack: () => void
}) {
  const back = [{ label: 'Back', kind: 'secondary' as const, onPress: onBack }]
  switch (outside.kind) {
    case 'closed':
      return <StateScreen variant="screen" icon="door-closed" title={outside.line} actions={back} testID="room-closed" />
    case 'removed':
      return (
        <StateScreen
          variant="screen"
          icon="door-closed"
          title="You were removed from this room"
          body={outside.line || 'The organiser removed you. You can read nothing more here tonight, and no one is told.'}
          testID="room-removed"
        />
      )
    case 'gone':
      return (
        <StateScreen
          variant="screen"
          icon="ghost"
          title="This room isn’t here any more"
          body="The event ended or was taken down. Nothing you wrote has gone anywhere."
          actions={back}
          testID="room-gone"
        />
      )
    case 'not_live':
      return (
        <StateScreen
          variant="screen"
          icon="radio"
          title="You’re not live here any more"
          body="Today’s room is for the people live at this place. Go live there again to rejoin it."
          actions={[{ label: 'Go live again', onPress: onGoLive }]}
          testID="room-not-live"
        />
      )
    default:
      return (
        <StateScreen
          variant="screen"
          icon="door-open"
          title={outside.kind === 'left' ? 'You left this room' : 'You’re not in this room'}
          body={
            outside.kind === 'left'
              ? 'Check in at the event again to rejoin. Nothing you wrote has gone anywhere.'
              : 'If you left it, you can rejoin. Otherwise, check in at the event to join its room.'
          }
          actions={[{ label: 'Rejoin', onPress: onRejoin, loading: rejoining }]}
          testID="room-left"
        />
      )
  }
}

const styles = StyleSheet.create({
  runStart: { marginTop: SPACE.lg },
  inRun: { marginTop: SPACE.xs },
})

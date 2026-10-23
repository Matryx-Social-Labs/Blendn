import { memo } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { FadeOut } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { broadcastParts } from '../../lib/chatFeed'
import { goneKindFor } from '../../lib/chatGone'
import { liveEndedState } from '../../lib/chatLiveEnded'
import { markSeed } from '../../lib/pseudonymAvatar'
import { DURATION, SPACE } from '../../lib/design/tokens'
import { isTemp, type RoomMessage } from '../../lib/roomMessages'
import { clockTime } from '../../lib/time'
import { BroadcastNotice } from '../ds/BroadcastNotice'
import { ChatBubble, type BubbleReaction } from '../ds/ChatBubble'
import type { Rect } from '../ds/chatShared'
import { StateScreen } from '../ds/StateScreen'
import { SystemLine, SystemNotice } from '../ds/SystemNotice'
import { GoneCard } from '../system/GoneCard'
import type { PollRefusal } from '../../lib/chatPoll'
import { RoomPoll } from './RoomPoll'
import { chatHeaderBottom } from './ChatHeader'
import { opensInSpoken } from '../../lib/preEventRoom'

export type RowHandlers = {
  menu: (m: RoomMessage, anchor: Rect) => void
  retry: (m: RoomMessage) => void
  react: (m: RoomMessage, emoji: string) => void
  reply: (m: RoomMessage) => void
  sender: (m: RoomMessage) => void
  link: (url: string) => void
  /** A vote the room itself refused (closed, not in it, not live): the room locks. */
  pollRefusal: (reason: PollRefusal) => void
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
  arriving = false,
  senderTappable,
  eventId,
  pollViewable = false,
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
  /** Somebody else's message that arrived live while you were at the bottom: it rises as it mounts (#13). */
  arriving?: boolean
  /** An event room's sender opens their card (5.1); a crew's or a Blend's is Flow 10's. */
  senderTappable: boolean
  /** The event this room belongs to: a poll is read and voted on through it. Null for a crew's or a Blend's. */
  eventId?: string | null
  /** This poll's row is on screen: it is read only then. */
  pollViewable?: boolean
  handlers: RowHandlers
}) {
  if (item.sender_id === 'system') return <SystemLine text={item.message_text} />
  /*
   * A poll is the organiser's question. With its poll id on the message (SV8) it is the poll, answerable, as
   * <PollBubble>; until the server names it, the room says it as a notice, never as somebody's bubble.
   */
  if (item.message_type === 'poll') {
    return (
      <View style={styles.runStart}>
        {item.poll_id && eventId ? (
          <RoomPoll
            eventId={eventId}
            pollId={item.poll_id}
            question={item.message_text}
            viewable={pollViewable}
            onRoomRefusal={handlers.pollRefusal}
            testID={`poll-${item.message_id}`}
          />
        ) : (
          <SystemNotice icon="chart-column" text={`Poll: ${item.message_text}`} testID={`poll-${item.message_id}`} />
        )}
      </View>
    )
  }
  if (item.message_type === 'announcement' || item.message_type === 'sponsored') {
    const { from, text } = broadcastParts(item.message_type, item.message_text, item.sender_name)
    // Full width, no tail, no menu: not somebody talking to you.
    return (
      <View style={styles.runStart}>
        <BroadcastNotice kind={item.message_type} from={from} text={text} time={clockTime(item.created_at)} media={item.media} testID={`broadcast-${item.message_id}`} />
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
        time={clockTime(item.created_at)}
        waiting={item.waiting}
        failed={item.failed ? item.failedLine || true : false}
        onRetry={() => handlers.retry(item)}
        onReply={item.removed || sending ? undefined : () => handlers.reply(item)}
        onLongPress={item.removed ? undefined : (anchor) => handlers.menu(item, anchor)}
        onSenderPress={senderTappable && !mine ? () => handlers.sender(item) : undefined}
        onLinkPress={handlers.link}
        // Your sends rise from the composer (#12); a live arrival at the bottom rises 12 pt (#13); history never animates.
        animateIn={sending ? 'send' : arriving ? 'arrive' : undefined}
      />
    </Animated.View>
  )
})

export type Outside =
  | { kind: 'closed'; line: string }
  | { kind: 'removed'; line: string | null }
  /** `event`: known to be an event's room. Without it the room's kind is unknown, and the card says only that it has closed. */
  | { kind: 'gone'; event?: boolean }
  /** `reason` is the socket's `live:ended` reason when this phone heard it; a read refused with NOT_LIVE carries none. */
  | { kind: 'not_live'; reason?: string | null; venueName?: string | null; dayEndsAt?: string | null }
  | { kind: 'left' }
  | { kind: 'out' }
  /** An event's room before it opens, to someone entitled: the server's NOT_OPEN_YET and its `opensAt` (D-7). */
  | { kind: 'notopen'; opensAt: string }

/**
 * The room, for somebody not in it (Flow 5 #25–26, R2-D2 room states): it
 * replaces the feed and the composer. Left and not-a-member offer Rejoin;
 * removed offers nothing and never says more than the server did; a room
 * that is gone, or a crew's or Blend's that closed, goes back.
 */
export function RoomOutside({
  outside,
  roomKind = null,
  rejoining,
  onRejoin,
  onGoLive,
  onBack,
  opensIn = null,
  opening = false,
  onOpenRoom,
}: {
  outside: Outside
  /** A crew's or a Blend's room, told apart from an event's: their wording has no event to check in at. */
  roomKind?: 'crew' | 'blend' | null
  rejoining: boolean
  onRejoin: () => void
  onGoLive: () => void
  onBack: () => void
  /** `notopen`: how long until it opens ("2d 4h", ticking); null once it has, when "Open the room" asks again. */
  opensIn?: string | null
  opening?: boolean
  onOpenRoom?: () => void
}) {
  const insets = useSafeAreaInsets()
  const back = [{ label: 'Back', kind: 'secondary' as const, onPress: onBack }]
  switch (outside.kind) {
    case 'closed': {
      // A closed crew or Blend is the shared "isn't here any more" card (#11); being removed from a crew's chat is not.
      const gone = goneKindFor(outside.line)
      if (gone) {
        return (
          <View style={[styles.gone, { paddingTop: chatHeaderBottom(insets.top) + SPACE.lg }]}>
            <GoneCard kind={gone} onBack={onBack} testID="room-gone-card" />
          </View>
        )
      }
      return <StateScreen variant="screen" icon="door-closed" title={outside.line} actions={back} testID="room-closed" />
    }
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
          title={outside.event ? 'This room isn’t here any more' : 'This room has closed'}
          body={outside.event ? 'The event ended or was taken down. Nothing you wrote has gone anywhere.' : 'Nothing you wrote has gone anywhere.'}
          actions={back}
          testID="room-gone"
        />
      )
    case 'notopen':
      // The header counts down in Geist Mono (OpensLine); this says it in words, which a screen reader reads as words.
      return opensIn ? (
        <StateScreen
          variant="screen"
          icon="clock"
          title="Not open yet"
          body={`The room opens in ${opensInSpoken(opensIn)}. An event’s room opens 24 hours before it starts.`}
          actions={back}
          testID="room-not-open"
        />
      ) : (
        <StateScreen
          variant="screen"
          icon="door-open"
          title="The room is open"
          body="It opened 24 hours before the event starts."
          actions={[{ label: 'Open the room', kind: 'lit', onPress: () => onOpenRoom?.(), loading: opening }]}
          testID="room-now-open"
        />
      )
    case 'not_live': {
      const state = liveEndedState(outside.reason, { venueName: outside.venueName, dayEndsAt: outside.dayEndsAt })
      return (
        <StateScreen
          variant="screen"
          icon={state.icon}
          title={state.title}
          body={state.body}
          actions={[{ label: state.action.label, onPress: state.action.kind === 'back' ? onBack : onGoLive }]}
          testID="room-not-live"
        />
      )
    }
    default: {
      const left = outside.kind === 'left'
      // A Blend you left is over for both sides: nothing to rejoin (10-10, proposed copy).
      if (roomKind === 'blend') {
        return <StateScreen variant="screen" icon="door-open" title="You left this Blend" body="Nothing you wrote has gone anywhere." actions={back} testID="room-left" />
      }
      // A crew's room has no event to check in at (5-1, "a crew room falls through here with event wording").
      const words = roomKind === 'crew' ? CREW_WORDS : EVENT_WORDS
      return (
        <StateScreen
          variant="screen"
          icon="door-open"
          title={left ? words.leftTitle : words.outTitle}
          body={left ? words.left : words.out}
          actions={[{ label: 'Rejoin', onPress: onRejoin, loading: rejoining }]}
          testID="room-left"
        />
      )
    }
  }
}

const EVENT_WORDS = {
  leftTitle: 'You left this room',
  left: 'Check in at the event again to rejoin. Nothing you wrote has gone anywhere.',
  outTitle: 'You’re not in this room',
  out: 'If you left it, you can rejoin. Otherwise, check in at the event to join its room.',
}
const CREW_WORDS = {
  leftTitle: 'You left this chat',
  left: 'Rejoin to see it again. Nothing you wrote has gone anywhere.',
  outTitle: 'You’re not in this crew’s chat',
  out: 'If you left it, you can rejoin. Otherwise, ask somebody in the crew.',
}

const styles = StyleSheet.create({
  runStart: { marginTop: SPACE.lg },
  inRun: { marginTop: SPACE.xs },
  gone: { flex: 1, paddingHorizontal: SPACE.gutter },
})

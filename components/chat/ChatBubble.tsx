import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, useReducedMotion, withTiming } from 'react-native-reanimated'

import { markSeed, pseudonymAvatar } from '../../lib/pseudonymAvatar'
import { EMBER, EMBER_RADIUS, OPACITY, SPACE, TYPE } from '../../lib/theme'
import { fadeInFast } from '../motion/presence'

/**
 * One message in the event room. Frame `1141:5535` (inbound), `1141:5546`
 * (outbound).
 *
 * ## The tail is the whole idea
 *
 * Every corner is 16 except one, which is 4: bottom-left on an inbound bubble,
 * bottom-right on an outbound one. That single square corner is what points the
 * bubble at its sender, and it is why the two directions do not need a colour
 * difference to be told apart at a glance — though they have one anyway
 * (`#1B1919` in, `EMBER.surface` out).
 *
 * Getting it backwards is the easy mistake and it reads as *wrong* rather than
 * as *different*: the message appears to point at the wrong person.
 *
 * ## The avatar is a mark, never a face
 *
 * The frame draws photographs — "Julian Ember", "Sarah Chen" — because it was
 * drawn for a named community chat. **This room is pseudonymous until you
 * reveal yourself**, so a photo here would undo the thing `app/room.tsx` exists
 * to protect. `pseudonymAvatar` gives a colour and a creature seeded on the
 * room *and* the sender, which is the same treatment the Grid's discs get. Not
 * on the id alone, and not on the display name — see the note at the call site
 * for why both of those are wrong.
 *
 * When somebody *has* revealed, the name is simply their real one — the server
 * decides that, not this component.
 *
 * ## Own messages carry no avatar
 *
 * The frame's outbound message has none, and it is right: you know who you are,
 * and a disc of your own on every second row halves the width of the column
 * for no information.
 */

export interface ChatBubbleProps {
  /** Whose message. Drives the tail, the alignment and the colour. */
  mine: boolean
  /** Pseudonym, or a real name once they have revealed. */
  senderName: string
  /** Stable per person. With `roomId`, the avatar's seed when the name is a placeholder. */
  senderId: string
  /** The room or conversation this bubble is in. Salts the avatar seed. */
  roomId: string
  text: string
  /**
   * Moderation took this one down.
   *
   * The server serves a sender their own hidden messages with `content: null`
   * so they know it happened; other members never receive them. Rendering
   * `null` as an empty bubble was a blank the sender could not read — so this
   * draws a quiet, dashed placeholder that says so, with no reply or copy
   * actions, because there is nothing to act on.
   */
  removed?: boolean
  /** Already formatted, e.g. `14:02`. This component does no date maths. */
  time: string
  /** What this message answers, drawn as a quiet quote above it. */
  replyTo?: { senderName: string; text: string } | null
  edited?: boolean
  /** Emoji → the ids that sent it. Only the count is ever shown. */
  /*
   * A tally, never a list of who.
   *
   * This was `Record<emoji, senderIds[]>` and the component used only
   * `senders.length` — honouring the room's rule by convention while the
   * prop carried the identities anyway. The server now sends counts, so the
   * names are no longer in the payload to be leaked by the next reader.
   */
  reactions?: { emoji: string; count: number; mine?: boolean }[] | null
  /**
   * Which surface this is.
   *
   * `direct` drops the avatar and the sender's name. A DM has exactly one other
   * person in it, so a disc and a name on every inbound row repeat the screen's
   * title once per message and halve the width of the column to do it.
   */
  variant?: 'room' | 'direct'
  /**
   * Delivery state, on your own messages only. `null` in the room.
   *
   * A room has no meaningful "read" -- twenty people read at twenty different
   * times, so a tick would either lie or need twenty answers. A DM has one
   * reader and one answer.
   */
  receipt?: 'sent' | 'delivered' | 'read' | null
  /**
   * Arrives with a short rise instead of appearing in one frame.
   *
   * The screen decides, and only for a message that has just landed in front
   * of you — the one you sent, or the first one into an empty thread. Never
   * history or an older page: forty bubbles rising as a conversation opens is
   * a delay, not an arrival.
   *
   * Read on mount only. A row the list unmounts and later remounts comes back
   * with this `false`, so scrolling back never replays it.
   */
  animateIn?: boolean
  /**
   * Your message did not reach the server.
   *
   * It stays where you wrote it, marked "Not sent · Tap to retry", rather than
   * vanishing with its text put back in the composer — which lost its place in
   * the conversation and read as though it had been deleted. A tap sends it
   * again; the long-press menu can delete it.
   */
  failed?: boolean
  onRetry?: () => void
  onLongPress?: () => void
}

/*
 * Fade plus a 6pt rise in 150ms, ease-out: fast at the start, where the eye
 * lands. The rise says "this came from the composer" without travelling far
 * enough to read as motion for its own sake. Sending happens tens of times a
 * conversation, so it stays under the 150ms line.
 *
 * Reduce Motion keeps the fade and drops the rise.
 */
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)

const sentIn = () => {
  'worklet'
  const t = { duration: 150, easing: EASE_OUT }
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 6 }] },
    animations: {
      opacity: withTiming(1, t),
      transform: [{ translateY: withTiming(0, t) }],
    },
  }
}

function ChatBubbleBase({
  mine,
  senderName,
  senderId,
  roomId,
  text,
  time,
  replyTo,
  edited,
  reactions,
  variant = 'room',
  receipt = null,
  failed = false,
  onRetry,
  onLongPress,
  removed = false,
  animateIn = false,
}: ChatBubbleProps) {
  const direct = variant === 'direct'
  const reduceMotion = useReducedMotion()
  /*
   * Seeded on the pseudonym, the one rule every surface follows
   * (`markSeed` in lib/pseudonymAvatar.ts): the Room grid, Room info and the
   * Banter all seed on the name, so one person is one creature on all of them
   * — and "Cosmic Panda" draws a panda. A placeholder name ("Attendee") falls
   * back to the room *and* the sender, so two unresolved people never share a
   * mark. Never the sender id alone: that is stable forever and would rebuild
   * the cross-event identity the pseudonyms exist to prevent.
   */
  const mark = pseudonymAvatar(markSeed(senderName, `${roomId}:${senderId}`))
  const reactionEntries = reactions ?? []

  return (
    <Animated.View
      style={[styles.row, mine && styles.rowMine]}
      entering={animateIn ? (reduceMotion ? fadeInFast : sentIn) : undefined}
    >
      {/*
        Flat, where the Grid's disc is a `LinearGradient`. A gradient is a
        native view and a busy room draws one of these per message; the Grid
        pays it for three cards on screen, a chat would pay it for thirty.
      */}
      {mine || direct ? null : (
        <View style={[styles.avatar, { backgroundColor: mark.colors[0] }]}>
          <Text style={styles.avatarGlyph} maxFontSizeMultiplier={1}>
            {mark.character}
          </Text>
        </View>
      )}

      <View style={[styles.column, mine && styles.columnMine]}>
        <View style={[styles.meta, mine && styles.metaMine]}>
          {/*
            Inbound reads name-then-time, outbound time-then-name. Both put the
            name nearest the bubble's own edge, so the eye lands on "who" in the
            same place relative to the message either way.
          */}
          {direct ? (
            <>
              <Text style={styles.time}>{time}</Text>
              {mine && receipt ? (
                <Text
                  style={[styles.receipt, receipt === 'read' && styles.receiptRead]}
                  accessibilityLabel={receipt === 'read' ? 'Read' : receipt === 'delivered' ? 'Delivered' : 'Sent'}
                >
                  {receipt === 'sent' ? '✓' : '✓✓'}
                </Text>
              ) : null}
            </>
          ) : mine ? (
            <>
              <Text style={styles.time}>{time}</Text>
              <Text style={styles.nameMine}>You</Text>
            </>
          ) : (
            <>
              <Text style={styles.name} numberOfLines={1}>
                {senderName}
              </Text>
              <Text style={styles.time}>{time}</Text>
            </>
          )}
        </View>

        <Pressable
          onPress={failed ? onRetry : undefined}
          onLongPress={removed ? undefined : onLongPress}
          delayLongPress={250}
          accessibilityRole={failed ? 'button' : 'text'}
          accessibilityLabel={
            removed
              ? `${mine ? 'Your' : `${senderName}'s`} message at ${time} was removed by moderation`
              : failed
                ? `Not sent: ${text}`
                : `${mine ? 'You' : senderName} at ${time}: ${text}`
          }
          accessibilityHint={failed ? 'Sends it again' : undefined}
          style={({ pressed }) => [
            styles.bubble,
            mine ? styles.bubbleMine : styles.bubbleTheirs,
            removed ? styles.bubbleRemoved : null,
            pressed && onLongPress && !removed ? styles.pressed : null,
          ]}
        >
          {/*
            The quote sits *inside* the bubble, where the old screen put it
            above. Outside, a reply preview reads as its own message from the
            person being quoted -- two bubbles for one thing said once.
          */}
          {replyTo ? (
            <View style={styles.quote}>
              <View style={styles.quoteBar} />
              <View style={styles.quoteBody}>
                <Text style={styles.quoteName} numberOfLines={1}>
                  {replyTo.senderName}
                </Text>
                <Text style={styles.quoteText} numberOfLines={2}>
                  {replyTo.text}
                </Text>
              </View>
            </View>
          ) : null}

          {removed ? (
            <Text style={styles.removedText}>This message was removed by moderation.</Text>
          ) : (
            <Text style={styles.text}>{text}</Text>
          )}

          {/*
            "edited" belongs on the bubble, not beside the timestamp in the
            header: it is a fact about the words, and the header is about who
            and when.
          */}
          {edited ? <Text style={styles.edited}>edited</Text> : null}
        </Pressable>

        {failed ? (
          <Text style={styles.failed} accessibilityElementsHidden importantForAccessibility="no">
            Not sent · Tap to retry
          </Text>
        ) : null}

        {reactionEntries.length > 0 ? (
          <View style={[styles.reactions, mine && styles.reactionsMine]}>
            {reactionEntries.map(({ emoji, count, mine: yours }) => (
              /*
                Yours is marked with a 1pt `textPrimary` edge — the same
                reaction the menu shows as selected — so you can see what you
                already said before long-pressing to take it back.
              */
              <View
                key={emoji}
                style={[styles.reaction, yours && styles.reactionMine]}
                accessibilityLabel={`${emoji} ${count}${yours ? ', yours' : ''}`}
              >
                <Text style={styles.reactionEmoji} maxFontSizeMultiplier={1.2}>
                  {emoji}
                </Text>
                {/*
                  The count only, never the names. Who reacted is exactly the
                  kind of thing this room does not disclose — and now the
                  payload cannot answer it either.
                */}
                {count > 1 ? (
                  <Text style={styles.reactionCount}>{count}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Animated.View>
  )
}

/**
 * Memoised, and it can actually bite here: every prop is a primitive except
 * `onLongPress`, which the screen holds in a `useCallback`. A room that is
 * being typed in re-renders on every keystroke, and without this each one
 * re-rendered every mounted bubble.
 */
export const ChatBubble = memo(ChatBubbleBase)

/** `1141:5535` is 304.3 of a 390 frame. */
const BUBBLE_MAX = '78%'

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.lg },
  rowMine: { justifyContent: 'flex-end' },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: EMBER_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // design-exception: an emoji glyph sized to fill the 40pt disc, not text
  avatarGlyph: { fontSize: 20, lineHeight: 26 },

  column: { gap: SPACE.xs, maxWidth: BUBBLE_MAX, alignItems: 'flex-start' },
  columnMine: { alignItems: 'flex-end' },

  meta: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  metaMine: { justifyContent: 'flex-end' },

  name: { ...TYPE.bodyStrong, flexShrink: 1 },
  nameMine: { ...TYPE.bodyStrong, color: EMBER.textPrimary },
  time: {
    ...TYPE.caption,
    // `1141:5542` — the timestamp is deliberately the quietest thing on the row.
    color: EMBER.textTertiary,
  },

  bubble: { paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, borderRadius: EMBER_RADIUS.md },
  /* The tail. One square corner, on the side the sender is. */
  bubbleTheirs: { backgroundColor: EMBER.surfaceSunken, borderBottomLeftRadius: EMBER_RADIUS.sm },
  bubbleMine: {
    backgroundColor: EMBER.surface,
    borderBottomRightRadius: EMBER_RADIUS.sm,
  },
  pressed: { opacity: OPACITY.pressed },
  /* No fill, a dashed edge: the outline of a message that is not there. */
  bubbleRemoved: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: EMBER.textTertiary,
  },
  removedText: { ...TYPE.body, fontStyle: 'italic', color: EMBER.textTertiary },

  text: TYPE.body,
  receipt: { ...TYPE.caption, color: EMBER.textTertiary },
  /*
   * Read is white against delivered's grey: `textSecondary` was one step up
   * from `textTertiary`, and on the phone the two read as the same tick.
   */
  receiptRead: { color: EMBER.textPrimary },
  edited: { ...TYPE.caption, color: EMBER.textTertiary, marginTop: SPACE.xs },
  // Error text is `destructive` (docs/DESIGN_SYSTEM.md), under the bubble it is about.
  failed: { ...TYPE.caption, color: EMBER.destructive },

  quote: { flexDirection: 'row', gap: SPACE.sm, marginBottom: SPACE.sm },
  quoteBar: { width: 2, borderRadius: EMBER_RADIUS.pill, backgroundColor: EMBER.textTertiary },
  // Its own width, capped by the bubble's: `flex: 1` wrapped a quote to the width of a two-letter reply.
  quoteBody: { flexShrink: 1, gap: SPACE.xxs },
  quoteName: { ...TYPE.caption, color: EMBER.textSecondary },
  quoteText: TYPE.caption,

  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs },
  reactionsMine: { justifyContent: 'flex-end' },
  reaction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xxs,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surfaceSunken,
    // The same 1pt the mine state draws, transparent, so marking one never shifts the row.
    borderWidth: 1,
    borderColor: 'transparent',
  },
  reactionMine: { borderColor: EMBER.textPrimary },
  reactionEmoji: TYPE.meta,
  reactionCount: TYPE.caption,
})

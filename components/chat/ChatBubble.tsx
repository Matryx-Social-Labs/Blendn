import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { pseudonymAvatar } from '../../lib/pseudonymAvatar'
import { EMBER, EMBER_FONTS } from '../../lib/theme'

/**
 * One message in the event room. Frame `1141:5535` (inbound), `1141:5546`
 * (outbound).
 *
 * ## The tail is the whole idea
 *
 * Every corner is 24 except one, which is 4: bottom-left on an inbound bubble,
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
  /** Stable per person. Salted with `roomId` to seed the avatar. */
  senderId: string
  /** The room or conversation this bubble is in. Salts the avatar seed. */
  roomId: string
  text: string
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
  receipt?: 'sent' | 'read' | null
  onLongPress?: () => void
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
  onLongPress,
}: ChatBubbleProps) {
  const direct = variant === 'direct'
  /*
   * Seeded on the room *and* the sender, which is neither of the two things
   * this was argued between.
   *
   * It used to be `senderId` alone, and `lib/pseudonymAvatar.ts` says why that
   * is wrong in as many words: "Never feed it a user id: that is stable forever
   * and would rebuild exactly the cross-event identity the pseudonyms exist to
   * prevent." The same person carried the same colour and creature in every
   * room, at every event, forever — a correlator handed to everyone they had
   * ever shared a room with.
   *
   * `senderName` alone is wrong too, and a test already said so: two people
   * both falling back to "Attendee" would share a mark, and somebody's disc
   * would change the instant they revealed.
   *
   * Salting the id with the room satisfies both. Stable for the length of the
   * room, unique per person inside it, different in the next room, and
   * unaffected by a reveal.
   */
  const mark = pseudonymAvatar(`${roomId}:${senderId}`)
  const reactionEntries = reactions ?? []

  return (
    <View style={[styles.row, mine && styles.rowMine]}>
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
                  accessibilityLabel={receipt === 'read' ? 'Read' : 'Sent'}
                >
                  {receipt === 'read' ? '✓✓' : '✓'}
                </Text>
              ) : null}
            </>
          ) : mine ? (
            <>
              <Text style={styles.time}>{time}</Text>
              <Text style={styles.nameMine}>Me</Text>
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
          onLongPress={onLongPress}
          delayLongPress={250}
          accessibilityRole="text"
          accessibilityLabel={`${mine ? 'You' : senderName} at ${time}: ${text}`}
          style={({ pressed }) => [
            styles.bubble,
            mine ? styles.bubbleMine : styles.bubbleTheirs,
            pressed && onLongPress ? styles.pressed : null,
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

          <Text style={styles.text}>{text}</Text>

          {/*
            "edited" belongs on the bubble, not beside the timestamp in the
            header: it is a fact about the words, and the header is about who
            and when.
          */}
          {edited ? <Text style={styles.edited}>edited</Text> : null}
        </Pressable>

        {reactionEntries.length > 0 ? (
          <View style={[styles.reactions, mine && styles.reactionsMine]}>
            {reactionEntries.map(({ emoji, count }) => (
              <View key={emoji} style={styles.reaction}>
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
    </View>
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
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  rowMine: { justifyContent: 'flex-end' },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarGlyph: { fontSize: 20, lineHeight: 26 },

  column: { gap: 6, maxWidth: BUBBLE_MAX, alignItems: 'flex-start' },
  columnMine: { alignItems: 'flex-end' },

  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaMine: { justifyContent: 'flex-end' },

  name: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.textPrimary,
    flexShrink: 1,
  },
  nameMine: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.accent,
  },
  time: {
    fontFamily: EMBER_FONTS.bodyMedium,
    fontSize: 10,
    lineHeight: 15,
    // `1141:5542` — the timestamp is deliberately the quietest thing on the row.
    color: 'rgba(174,170,170,0.6)',
  },

  bubble: { padding: 16, borderRadius: 24 },
  /* The tail. One square corner, on the side the sender is. */
  bubbleTheirs: { backgroundColor: '#1B1919', borderBottomLeftRadius: 4 },
  bubbleMine: {
    backgroundColor: EMBER.surface,
    borderBottomRightRadius: 4,
    /* `1141:5554` — a warm lift on your own words, not a visible shadow. */
    shadowColor: EMBER.gradientFrom,
    shadowOpacity: 0.05,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  pressed: { opacity: 0.7 },

  text: {
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 16,
    /* 26, not the 24 body uses elsewhere: `1141:5544` opens chat text up. */
    lineHeight: 26,
    color: EMBER.textPrimary,
  },
  receipt: {
    fontFamily: EMBER_FONTS.bodyMedium,
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(174,170,170,0.6)',
  },
  /* Read is the accent, so "they saw it" is a colour change and not a glyph count. */
  receiptRead: { color: EMBER.accent },
  edited: {
    fontFamily: EMBER_FONTS.bodyMedium,
    fontSize: 10,
    lineHeight: 15,
    color: 'rgba(174,170,170,0.6)',
    marginTop: 4,
  },

  quote: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  quoteBar: { width: 2, borderRadius: 9999, backgroundColor: EMBER.accent, opacity: 0.6 },
  quoteBody: { flex: 1, gap: 2 },
  quoteName: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 10,
    lineHeight: 15,
    color: EMBER.accent,
  },
  quoteText: {
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 10,
    lineHeight: 15,
    color: EMBER.textSecondary,
  },

  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  reactionsMine: { justifyContent: 'flex-end' },
  reaction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    backgroundColor: EMBER.surfaceSunken,
  },
  reactionEmoji: { fontSize: 12, lineHeight: 18 },
  reactionCount: {
    fontFamily: EMBER_FONTS.bodyMedium,
    fontSize: 10,
    lineHeight: 15,
    color: EMBER.textSecondary,
  },
})

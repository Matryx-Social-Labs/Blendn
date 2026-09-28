import { StyleSheet, Text, View } from 'react-native'

import { EMBER, EMBER_RADIUS, SPACE, TYPE } from '../../lib/theme'

/**
 * An organiser announcement, or a sponsored message.
 *
 * **Not in frame `1141:5498`**, which draws only person-to-person messages. It
 * exists because the product has broadcasts: `canBroadcast(actor, event, kind,
 * maySponsor)` on the API decides who may send one, and a venue owner or
 * organiser posting "doors close in ten minutes" arrives down this same socket
 * as a `chat_messages` row with a `message_type`.
 *
 * ## Full width, and that is the point
 *
 * A broadcast has no tail and no avatar, and runs the whole column. Every other
 * thing in the feed is inset on one side, so a bar spanning both margins reads
 * as "this is not somebody talking to you" before a word of it is read — which
 * is the honest signal for both kinds:
 *
 *   - an **announcement** is the room's organiser, speaking with authority
 *   - a **sponsored** message is *paid for*, and a reader is owed that plainly
 *
 * ## Sponsored is labelled, never disguised
 *
 * The label is not decoration. A paid message styled like an organiser's is an
 * advert wearing the venue's voice, and the one thing that must never be
 * ambiguous is which of the two you are reading. Announcement takes a bright
 * rail; sponsored takes a deliberately dimmer, quieter one so it cannot borrow
 * the room's own voice.
 */

export type BroadcastKind = 'announcement' | 'sponsored'

export function BroadcastNotice({
  kind,
  text,
  time,
}: {
  kind: BroadcastKind
  text: string
  time: string
}) {
  const sponsored = kind === 'sponsored'
  // The server prefixes the content with its own label line; the label above
  // the text already says it, so it would read twice. An announcement's line
  // also names the organisation, which is worth keeping -- it moves up into
  // the label rather than sitting under it as "📢 [Announcement from …]".
  const from = sponsored ? null : /^📢 \[Announcement from ([^\]]+)\]\n/.exec(text)
  const body = sponsored
    ? text.replace(/^📣 \[Sponsored\]\n/, '')
    : from ? text.slice(from[0].length) : text
  const label = sponsored ? 'SPONSORED' : from ? `ANNOUNCEMENT · ${from[1].toUpperCase()}` : 'ANNOUNCEMENT'

  return (
    <View style={styles.wrap}>
      {/*
        A bright hairline down the leading edge for an announcement only.
        Sponsored gets a dimmed one -- see above.
      */}
      {sponsored ? (
        <View style={styles.railSponsored} />
      ) : (
        <View style={styles.rail} />
      )}

      <View style={styles.body}>
        <Text
          style={[styles.label, sponsored && styles.labelSponsored]}
          maxFontSizeMultiplier={1.3}
        >
          {label}
        </Text>
        <Text style={styles.text}>{body}</Text>
        <Text style={styles.time}>{time}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: SPACE.md,
    padding: SPACE.lg,
    borderRadius: EMBER_RADIUS.lg,
    backgroundColor: EMBER.surfaceSunken,
    overflow: 'hidden',
  },
  rail: { width: 3, borderRadius: EMBER_RADIUS.pill, backgroundColor: EMBER.textPrimary },
  railSponsored: { width: 3, borderRadius: EMBER_RADIUS.pill, backgroundColor: EMBER.textTertiary },
  body: { flex: 1, gap: SPACE.sm },
  label: { ...TYPE.label, color: EMBER.textSecondary },
  labelSponsored: { color: EMBER.textTertiary },
  text: TYPE.body,
  time: { ...TYPE.caption, color: EMBER.textTertiary },
})

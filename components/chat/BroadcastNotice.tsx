import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet, Text, View } from 'react-native'

import { EMBER, EMBER_FONTS } from '../../lib/theme'

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
 * ambiguous is which of the two you are reading. Announcement takes the warm
 * accent; sponsored takes a deliberately cooler, quieter treatment so it cannot
 * borrow the room's own colour.
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
        A hairline of the room's gradient down the leading edge for an
        announcement only. Sponsored does not get it -- see above.
      */}
      {sponsored ? (
        <View style={styles.railSponsored} />
      ) : (
        <LinearGradient
          colors={[EMBER.gradientFrom, EMBER.gradientTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.rail}
        />
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
    gap: 12,
    padding: 16,
    borderRadius: 24,
    backgroundColor: EMBER.surfaceSunken,
    overflow: 'hidden',
  },
  rail: { width: 3, borderRadius: 9999 },
  railSponsored: { width: 3, borderRadius: 9999, backgroundColor: EMBER.textSecondary, opacity: 0.4 },
  body: { flex: 1, gap: 6 },
  label: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 1.6,
    color: EMBER.accent,
  },
  labelSponsored: { color: EMBER.textSecondary },
  text: {
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 16,
    lineHeight: 26,
    color: EMBER.textPrimary,
  },
  time: {
    fontFamily: EMBER_FONTS.bodyMedium,
    fontSize: 10,
    lineHeight: 15,
    color: 'rgba(174,170,170,0.6)',
  },
})

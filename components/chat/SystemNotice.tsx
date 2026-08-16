import { StyleSheet, Text, View } from 'react-native'

import { EMBER, EMBER_FONTS } from '../../lib/theme'

/**
 * A centred pill for anything the room says about itself. Frame `1141:5532`.
 *
 * Two jobs, deliberately one component:
 *
 *   - **day separators** — "Today", "Yesterday", a date
 *   - **system messages** — "Julian Ember pinned a location for the after-party"
 *
 * The old screen drew these as two unrelated rows with different type and
 * different colour, which made a date read as something somebody had said. They
 * are the same *kind* of thing — the room narrating rather than a person
 * speaking — so they get one shape, centred, and nobody mistakes either for a
 * message.
 *
 * Centred and pill-shaped is what does that work: every real message is
 * left- or right-aligned with a tail, so anything in the middle with no tail is
 * legible as "not a person" before it is read.
 */
export function SystemNotice({ label }: { label: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.pill}>
        <Text style={styles.label} maxFontSizeMultiplier={1.3}>
          {label}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center' },
  pill: {
    backgroundColor: EMBER.surfaceSunken,
    borderRadius: 9999,
    paddingHorizontal: 16,
    paddingVertical: 6,
    /*
     * The frame's pill is the width of its own text. Capped here because a
     * system message is server-authored and can be long -- unbounded, it would
     * run to a single line off both edges of the screen.
     */
    maxWidth: '86%',
  },
  label: {
    fontFamily: EMBER_FONTS.bodyMedium,
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.textSecondary,
    textAlign: 'center',
  },
})

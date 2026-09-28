import { Pressable, StyleSheet, Text, View } from 'react-native'

import { CHAT_REACTIONS, type ChatReaction } from '../../lib/apiClient'
import { CONTROL, EMBER, EMBER_RADIUS, SPACE } from '../../lib/theme'

/**
 * The six reactions the server accepts, as one row at the top of the room's
 * message menu.
 *
 * Only these six: anything else is a 400, so a full emoji keyboard here would
 * offer choices that fail. One you already left is drawn selected, and
 * tapping it again takes it back — the server toggles the same way.
 */
export function ReactionPicker({
  mine,
  onPick,
}: {
  /** Emojis you have already left on this message. */
  mine: string[]
  onPick: (emoji: ChatReaction) => void
}) {
  return (
    <View style={styles.row} accessibilityRole="toolbar">
      {CHAT_REACTIONS.map((emoji) => {
        const selected = mine.includes(emoji)
        return (
          <Pressable
            key={emoji}
            onPress={() => onPick(emoji)}
            accessibilityRole="button"
            accessibilityLabel={selected ? `Remove your ${emoji} reaction` : `React with ${emoji}`}
            accessibilityState={{ selected }}
            style={({ pressed }) => [styles.option, selected && styles.selected, pressed && styles.pressed]}
          >
            <Text style={styles.emoji} maxFontSizeMultiplier={1}>
              {emoji}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.sm },
  // One row, one height: six 48pt discs on `surface`, one step off the tray.
  option: {
    width: CONTROL.md,
    height: CONTROL.md,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Selected option: `textPrimary` fill (docs/DESIGN_SYSTEM.md).
  selected: { backgroundColor: EMBER.textPrimary },
  pressed: { opacity: 0.7 },
  // design-exception: an emoji glyph sized to fill its 48pt disc, not text
  emoji: { fontSize: 24, lineHeight: 30 },
})

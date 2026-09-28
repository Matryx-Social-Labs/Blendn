import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE } from '../../lib/theme'
import { fadeInFast, fadeOutFast } from '../motion/presence'

interface ReplyBarProps {
  /** Who is being replied to, as the conversation names them. */
  name: string
  text: string
  onCancel: () => void
}

/** "Replying to …" above the composer, in the room and in DMs (SCRUM-409). */
export function ReplyBar({ name, text, onCancel }: ReplyBarProps) {
  return (
    <Animated.View entering={fadeInFast} exiting={fadeOutFast} style={styles.bar}>
      <View style={styles.line} />
      <View style={styles.content}>
        <Text style={styles.label} numberOfLines={1}>Replying to {name}</Text>
        <Text style={styles.message} numberOfLines={1}>{text}</Text>
      </View>
      <Pressable
        style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Cancel reply"
      >
        <Ionicons name="close" size={ICON.md} color={EMBER.textSecondary} />
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: GUTTER, paddingVertical: SPACE.sm,
    backgroundColor: EMBER.surfaceSunken,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: EMBER.separator,
    gap: SPACE.md,
  },
  line: { width: 3, height: 32, backgroundColor: EMBER.textSecondary, borderRadius: EMBER_RADIUS.pill },
  content: { flex: 1 },
  label: { ...TYPE.caption, color: EMBER.textPrimary },
  message: { ...TYPE.meta, color: EMBER.textSecondary },
  // A `CONTROL.md` target: the glyph alone was a 24pt tap beside the composer.
  close: { width: CONTROL.md, height: CONTROL.md, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
})

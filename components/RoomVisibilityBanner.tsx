import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { bannerText, roomVisibility } from '../lib/roomVisibility'
import { EMBER, EMBER_RADIUS, EMBER_TYPE } from '../lib/theme'

/**
 * What the room knows about you, for as long as you are in it.
 *
 * This is the piece that made `reveal_by_default` safe to turn into a setting.
 * The objection to a profile toggle was that someone flips it once and forgets;
 * a banner that states the current answer continuously is the direct answer to
 * that, and it is a better answer than never letting them choose.
 *
 * Three deliberate choices:
 *
 *  - **It never collapses or auto-hides.** A banner that fades after five
 *    seconds tells you your state only if you happened to be looking. The whole
 *    value is that a glance, at any moment, is enough.
 *  - **The action is the opposite state**, not a settings link. The way out is
 *    in the thing that tells you where you are; sending someone to Settings to
 *    change it means they will not.
 *  - **Anonymous is the quiet one.** The named state gets the warm border,
 *    because it is the one worth noticing. Styling both loudly would make the
 *    safe state feel like a warning.
 */
export function RoomVisibilityBanner({
  revealed,
  pseudonym,
  onToggle,
  busy,
}: {
  revealed: boolean
  pseudonym?: string | null
  onToggle: () => void
  busy?: boolean
}) {
  const visibility = roomVisibility(revealed)
  const text = bannerText(visibility, pseudonym)
  const named = visibility === 'named'

  return (
    <View
      style={[styles.root, named ? styles.named : styles.anonymous]}
      accessibilityRole="summary"
      accessibilityLabel={text.title}
    >
      <Ionicons
        name={named ? 'eye-outline' : 'eye-off-outline'}
        size={18}
        color={named ? EMBER.accent : EMBER.textSecondary}
      />
      <Text style={styles.title} numberOfLines={2}>
        {text.title}
      </Text>
      <Pressable
        onPress={onToggle}
        disabled={busy}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={text.action}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <Text style={styles.action}>{text.action}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: EMBER_RADIUS.card,
    borderWidth: 1,
  },
  anonymous: { backgroundColor: EMBER.surfaceSunken, borderColor: 'transparent' },
  named: { backgroundColor: EMBER.surface, borderColor: 'rgba(255,144,109,0.4)' },
  // `flex: 1` so a long pseudonym wraps rather than pushing the action off the
  // right edge — the way out must never be the thing that gets clipped.
  title: { ...EMBER_TYPE.helper, flex: 1, color: EMBER.textPrimary, fontSize: 13, lineHeight: 18 },
  action: { ...EMBER_TYPE.helper, color: EMBER.accent, fontSize: 13 },
  pressed: { opacity: 0.7 },
})

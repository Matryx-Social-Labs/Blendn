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
 *
 * ## The capability gate, and why it is one-directional
 *
 * Revealing shows exactly a name and a photo. With neither, turning it on
 * changes nothing anybody can see, so the control was a switch that silently
 * did nothing — the same "dead control" fault the centre nav button was
 * redesigned to stop having. `event-preferences` has gated this since #67
 * ("Add a photo to your profile first — that's what other people would see")
 * and that screen is reachable from nothing, so in the room the gate did not
 * exist.
 *
 * **It only ever blocks turning reveal ON.** Going anonymous is always
 * available, whatever your profile looks like: a gate that could trap somebody
 * in the named state would turn a safety control into the thing they need
 * protecting from. `canReveal` is therefore consulted only when
 * `visibility === 'anonymous'`.
 */
export function RoomVisibilityBanner({
  revealed,
  pseudonym,
  onToggle,
  busy,
  canReveal = true,
  missing,
}: {
  revealed: boolean
  pseudonym?: string | null
  onToggle: () => void
  busy?: boolean
  /** Whether there is anything to reveal. Defaults open, so a caller that has
   *  not loaded the profile yet never blocks the control on a guess. */
  canReveal?: boolean
  /** What is absent, in the words the copy uses: "a photo", "a name and a photo". */
  missing?: string
}) {
  const visibility = roomVisibility(revealed)
  const text = bannerText(visibility, pseudonym)
  const named = visibility === 'named'
  // One-directional: see above. Leaving is never gated.
  const blocked = !named && !canReveal

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
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={2}>
          {text.title}
        </Text>
        {/*
          Said on screen, not only to a screen reader. A greyed control with no
          stated cause reads as the app being broken, which is the fault this
          gate exists to remove rather than relocate.
        */}
        {blocked ? (
          <Text style={styles.reason} numberOfLines={2}>
            {`Add ${missing ?? 'a name and a photo'} to your profile first — that's what other people would see.`}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={onToggle}
        disabled={busy || blocked}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={text.action}
        /*
         * The reason travels with the control, not in a toast after the tap.
         * A disabled button with no stated cause is the same dead control in a
         * greyer coat.
         */
        accessibilityHint={
          blocked ? `Add ${missing ?? 'a name and a photo'} to your profile first` : undefined
        }
        accessibilityState={{ disabled: busy || blocked }}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <Text style={[styles.action, blocked && styles.actionBlocked]}>{text.action}</Text>
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
  copy: { flex: 1, gap: 2 },
  title: { ...EMBER_TYPE.helper, color: EMBER.textPrimary, fontSize: 13, lineHeight: 18 },
  reason: { ...EMBER_TYPE.helper, color: EMBER.textTertiary, fontSize: 12, lineHeight: 16 },
  action: { ...EMBER_TYPE.helper, color: EMBER.accent, fontSize: 13 },
  actionBlocked: { color: EMBER.textTertiary },
  pressed: { opacity: 0.7 },
})

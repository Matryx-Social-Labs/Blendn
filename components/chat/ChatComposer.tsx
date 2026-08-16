import { BlurView } from 'expo-blur'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native'

import { EMBER, EMBER_FONTS, EMBER_GRADIENT } from '../../lib/theme'

/**
 * The composer. Frame `1141:5582`.
 *
 * ## A floating pill, not a docked bar
 *
 * The old input was a full-width row with a hard top edge, sitting flush on the
 * bottom of the screen. The frame's is a rounded pill inset 16 from both edges
 * and floating over the feed, so the conversation runs *underneath* it rather
 * than stopping at it. That is the difference between a room you are in and a
 * form you are filling in.
 *
 * It is translucent and blurred for the same reason: you can see there is more
 * conversation under your thumb.
 *
 * ## Two buttons from the frame are not here
 *
 * `1141:5584` (a `+`) and `1141:5590` (an emoji face) are drawn and not built:
 *
 *   - **`+` attaches media.** Attendees cannot post media in a room — that was
 *     decided, and only sponsored broadcasts may carry it. A button that opens
 *     a picker whose result the server rejects is worse than no button.
 *   - **The emoji face** is a web control. Every mobile keyboard already has an
 *     emoji key, so this one would open a second, worse picker over the top of
 *     the one the platform gives away.
 *
 * Both are recorded as open questions for the designer rather than quietly
 * dropped — see `docs/CHAT.md`.
 */

export interface ChatComposerProps {
  value: string
  onChangeText: (text: string) => void
  onSend: () => void
  sending: boolean
  /** Focus scrolls the feed to the newest message. */
  onFocus?: () => void
}

export function ChatComposer({
  value,
  onChangeText,
  onSend,
  sending,
  onFocus,
}: ChatComposerProps) {
  const canSend = value.trim().length > 0 && !sending

  return (
    <View style={styles.shell}>
      <View style={styles.pill}>
        <BlurView intensity={12} tint="dark" style={StyleSheet.absoluteFill} />

        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          placeholder="Share your thoughts..."
          placeholderTextColor="rgba(174,170,170,0.5)"
          multiline
          /*
           * The server's own limit. Enforced here too so the count that stops
           * you is the count that would have rejected you, rather than a
           * failure after you pressed send.
           */
          maxLength={1000}
          accessibilityLabel="Message"
        />

        <Pressable
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !canSend }}
          style={({ pressed }) => [styles.send, pressed && styles.pressed]}
        >
          <LinearGradient
            colors={EMBER_GRADIENT.colors}
            start={EMBER_GRADIENT.start}
            end={EMBER_GRADIENT.end}
            style={[styles.sendFill, !canSend && styles.sendIdle]}
          >
            {sending ? (
              <ActivityIndicator size="small" color={EMBER.onGradient} />
            ) : (
              <Ionicons name="send" size={16} color={EMBER.onGradient} />
            )}
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  shell: { paddingHorizontal: 16 },
  pill: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 9,
    borderRadius: 9999,
    overflow: 'hidden',
    backgroundColor: 'rgba(45,44,44,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(73,71,71,0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 50,
    shadowOffset: { width: 0, height: 25 },
  },
  input: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 9,
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 16,
    color: EMBER.textPrimary,
    /*
     * Roughly five lines. Unbounded, a pasted paragraph grows the pill until it
     * covers the conversation it is a reply to.
     */
    maxHeight: 132,
  },
  /* `1141:5593` is 35 x 40 — a touch wider than tall, which the frame is firm about. */
  send: { width: 35, height: 40, borderRadius: 9999, overflow: 'hidden' },
  sendFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  /*
   * Dimmed rather than grey. The gradient is the room's one warm thing and
   * swapping it for a flat disabled colour made the composer look broken
   * rather than waiting.
   */
  sendIdle: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
})

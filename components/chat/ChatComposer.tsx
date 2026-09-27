import { Ionicons } from '@expo/vector-icons'
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native'

import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE } from '../../lib/theme'

/**
 * The composer. Frame `1141:5582`.
 *
 * ## A floating pill, not a docked bar
 *
 * The old input was a full-width row with a hard top edge, sitting flush on the
 * bottom of the screen. The frame's is a rounded pill inset from both edges
 * and floating over the feed, so the conversation runs *underneath* it rather
 * than stopping at it. That is the difference between a room you are in and a
 * form you are filling in.
 *
 * The frame drew it translucent and blurred; it is a flat `EMBER.surface`
 * instead (no glass — see `tasks/lessons.md`). The inset and the rounded ends
 * still say "floating", without a blur redraw on every scroll frame.
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
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          placeholder="Share your thoughts..."
          placeholderTextColor={EMBER.textPlaceholder}
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
          <View style={[styles.sendFill, !canSend && styles.sendIdle]}>
            {sending ? (
              <ActivityIndicator size="small" color={EMBER.onGradient} />
            ) : (
              <Ionicons name="send" size={ICON.sm} color={EMBER.onGradient} />
            )}
          </View>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  shell: { paddingHorizontal: GUTTER },
  pill: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACE.sm,
    padding: SPACE.sm,
    borderRadius: EMBER_RADIUS.pill,
    overflow: 'hidden',
    backgroundColor: EMBER.surface,
    borderWidth: 1,
    borderColor: EMBER.separator,
  },
  input: {
    flex: 1,
    ...TYPE.body,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.sm,
    /*
     * Roughly five lines. Unbounded, a pasted paragraph grows the pill until it
     * covers the conversation it is a reply to.
     */
    maxHeight: 132,
  },
  /*
   * A `CONTROL.sm` circle: it sits inside the 40pt one-line input row, so the
   * pill stays `CONTROL.lg` tall. `marginBottom` centres it on that first line
   * (the row is bottom-aligned so it stays by your thumb as the input grows).
   */
  send: {
    width: CONTROL.sm,
    height: CONTROL.sm,
    marginBottom: SPACE.xs,
    borderRadius: EMBER_RADIUS.pill,
    overflow: 'hidden',
  },
  sendFill: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: EMBER.accent },
  /*
   * Dimmed rather than grey. Send is the room's one accent, and swapping it
   * for a flat disabled colour made the composer look broken rather than
   * waiting.
   */
  sendIdle: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
})

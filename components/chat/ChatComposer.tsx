import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'

import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE } from '../../lib/theme'
import { Text } from '../ui/Text'

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

/**
 * Why the composer will not take a message right now.
 *
 * There is deliberately no `sending` member, and the send button has no
 * spinner. Sending is not a reason to lock anybody out: `sendMessage` draws
 * the optimistic bubble and clears this field in the same tick that it starts
 * the request, so by the time an "in flight" state could paint, the room has
 * already shown the message as sent. A spinner there promised that something
 * was still happening when nothing was — and it was the only thing on screen
 * claiming the send had not landed.
 *
 * A disabled control must say why it is disabled, so every member of this
 * union has a sentence in LOCK_COPY.
 */
export type ComposerLock = 'muted' | 'locked' | 'closed' | 'rate_limited'

const LOCK_COPY: Record<ComposerLock, string> = {
  muted: "You're muted in this room.",
  locked: 'You can read this room, but not post in it.',
  closed: 'This room is closed.',
  rate_limited: 'Slow down a moment — too many messages.',
}

export interface ChatComposerProps {
  value: string
  onChangeText: (text: string) => void
  onSend: () => void
  /** Set only when the user genuinely may not post; never for a send in flight. */
  lock?: ComposerLock | null
  /** Focus scrolls the feed to the newest message. */
  onFocus?: () => void
}

export function ChatComposer({
  value,
  onChangeText,
  onSend,
  lock,
  onFocus,
}: ChatComposerProps) {
  const canSend = value.trim().length > 0 && !lock

  return (
    <View style={styles.shell}>
      {lock ? (
        <Text variant="meta" color={EMBER.textSecondary} style={styles.lockNote} accessibilityRole="alert">
          {LOCK_COPY[lock]}
        </Text>
      ) : null}
      <View style={styles.pill}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          /*
           * Read-only rather than merely un-sendable: a locked room should not
           * let somebody type a message they will never be allowed to send.
           */
          editable={!lock}
          /*
           * The reason is the note above; the field says only that it is shut.
           * Both used to carry the same sentence, one over the other.
           */
          placeholder={lock ? "Can't send right now" : 'Share your thoughts…'}
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
          // A 32pt disc: 8 around it reaches the 44pt minimum without a bigger pill.
          hitSlop={SPACE.sm}
          style={({ pressed }) => [styles.send, pressed && styles.pressed]}
        >
          <View style={[styles.sendFill, !canSend && styles.sendIdle]}>
            <Ionicons name="send" size={ICON.sm} color={EMBER.onGradient} />
          </View>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  shell: { paddingHorizontal: GUTTER },
  lockNote: { paddingHorizontal: SPACE.md, paddingBottom: SPACE.sm },
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

import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'

import { EMBER, EMBER_FONTS, EMBER_GRADIENT } from '../../lib/theme'
import { KEYBOARD_BEHAVIOR } from '../../lib/keyboard'

/**
 * Sending a connection request — the message, and what it costs you.
 *
 * ## Connect is not the like, and the difference is the whole point
 *
 *   like     "I would talk to you"    private, symmetric, stays pseudonymous
 *   connect  "here is who I am, why"  immediate, one-sided, and it reveals you
 *
 * A request returns `sender.name` and `sender.image` ungated, so sending one
 * hands over your real name and face. That is deliberate rather than a leak: the
 * anonymity exists to stop people being *identified*, not to let people send
 * unsolicited messages without accountability. Anonymous plus unsolicited is the
 * harassment shape.
 *
 * But a reveal that surprises somebody is a failure whatever the reasoning, so
 * the sheet says it above the field, before the typing, not in a confirmation
 * after it.
 *
 * ## Two rules for that sentence
 *
 * **Name them the way the server does.** `displayName` is the resolved value —
 * the pseudonym before a reveal, the real name after. Never a real name the
 * client assumed: "Priya will see your name and photo" on a pseudonymous roster
 * treats an unrevealed person as having a knowable real name, which is the
 * identity gate's mistake made in prose.
 *
 * **Say what you do not get back.** Without it, "Connect" reads as a mutual
 * reveal. It is not — they stay a pseudonym until they choose otherwise, and an
 * asymmetry nobody was told about is a surprise that lands on the wrong person.
 */

/** `POST /message-requests` — `z.string().trim().min(1).max(500)`. */
export const CONNECT_MESSAGE_MAX = 500

/**
 * The line above the field.
 *
 * Exported and pure so it can be asserted: the rule it encodes is easy to break
 * with a well-meaning edit, and impossible to notice once shipped.
 */
export function connectDisclosure(displayName: string, theyAreRevealed: boolean): string {
  const them = displayName.trim() || 'They'
  return theyAreRevealed
    ? `${them} will see your name and photo.`
    : `${them} will see your name and photo. You'll still see them as ${them} until they choose to reveal.`
}

export function ConnectSheet({
  visible,
  displayName,
  theyAreRevealed = false,
  sending,
  onSend,
  onDismiss,
}: {
  visible: boolean
  /** Server-resolved. The pseudonym before a reveal, the real name after. */
  displayName: string
  theyAreRevealed?: boolean
  sending?: boolean
  onSend: (message: string) => void
  onDismiss: () => void
}) {
  const insets = useSafeAreaInsets()
  const [message, setMessage] = useState('')

  const trimmed = message.trim()
  const remaining = CONNECT_MESSAGE_MAX - message.length
  /* Required, not optional — the server refuses an empty one either way. */
  const canSend = trimmed.length > 0 && message.length <= CONNECT_MESSAGE_MAX && !sending

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onDismiss}
      accessibilityViewIsModal
    >
      <Pressable style={styles.scrim} onPress={onDismiss} accessibilityLabel="Cancel" />

      <KeyboardAvoidingView behavior={KEYBOARD_BEHAVIOR}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.grabber} />

          <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
            Connect with {displayName}
          </Text>

          {/*
            Above the field, not in a confirmation after it. Somebody who has
            typed a paragraph has already decided; the cost belongs before the
            effort, where it can still change the answer.
          */}
          <Text style={styles.disclosure} maxFontSizeMultiplier={1.4}>
            {connectDisclosure(displayName, theyAreRevealed)}
          </Text>

          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Why do you want to talk?"
            placeholderTextColor={EMBER.textPlaceholder}
            multiline
            maxLength={CONNECT_MESSAGE_MAX}
            style={styles.input}
            accessibilityLabel="Your message"
            accessibilityHint="Required. They see this before deciding whether to accept."
            maxFontSizeMultiplier={1.4}
          />

          <View style={styles.meta}>
            {/*
              A reason, not a formality. The recipient decides on this sentence
              alone -- "Someone wants to connect" is a coin flip.
            */}
            <Text style={styles.hint} maxFontSizeMultiplier={1.3}>
              They see this before deciding.
            </Text>
            <Text
              style={[styles.counter, remaining < 40 && styles.counterLow]}
              maxFontSizeMultiplier={1.3}
              /* Announced only when it starts to matter, not on every keystroke. */
              accessibilityLiveRegion={remaining < 40 ? 'polite' : 'none'}
            >
              {remaining}
            </Text>
          </View>

          <Pressable
            onPress={() => onSend(trimmed)}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel={`Send a connection request to ${displayName}`}
            accessibilityState={{ disabled: !canSend }}
            style={({ pressed }) => [
              styles.send,
              !canSend && styles.sendOff,
              pressed && styles.pressed,
            ]}
          >
            {canSend ? (
              <LinearGradient
                colors={[...EMBER_GRADIENT.colors]}
                start={EMBER_GRADIENT.start}
                end={EMBER_GRADIENT.end}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
            <Text
              style={[styles.sendLabel, !canSend && styles.sendLabelOff]}
              maxFontSizeMultiplier={1.3}
            >
              {sending ? 'Sending…' : 'Send request'}
            </Text>
          </Pressable>

          {/*
            Stated once, plainly. It is the strongest protection in the feature
            and the only one with a consequence the sender should weigh.
          */}
          <Text style={styles.footnote} maxFontSizeMultiplier={1.3}>
            You can only send one request to someone.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: EMBER.bg,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 12,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: EMBER.surface,
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 20,
    lineHeight: 28,
    color: EMBER.textPrimary,
  },
  disclosure: {
    fontFamily: EMBER_FONTS.bodyMedium,
    fontSize: 14,
    lineHeight: 21,
    color: EMBER.accent,
  },
  input: {
    minHeight: 108,
    maxHeight: 200,
    borderRadius: 24,
    backgroundColor: EMBER.surfaceSunken,
    padding: 16,
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.textPrimary,
    textAlignVertical: 'top',
  },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hint: {
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 13,
    lineHeight: 18,
    color: EMBER.textTertiary,
  },
  counter: {
    fontFamily: EMBER_FONTS.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    color: EMBER.textTertiary,
  },
  counterLow: { color: EMBER.accent },
  send: {
    minHeight: 56,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    marginTop: 4,
    overflow: 'hidden',
  },
  sendOff: { backgroundColor: EMBER.surface },
  pressed: { opacity: 0.75 },
  sendLabel: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.onGradient,
  },
  sendLabelOff: { color: EMBER.textTertiary },
  footnote: {
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 12,
    lineHeight: 18,
    color: EMBER.textTertiary,
    textAlign: 'center',
  },
})

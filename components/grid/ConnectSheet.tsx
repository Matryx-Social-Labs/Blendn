import { useState } from 'react'

import { Sheet } from '../ds/Sheet'
import { TextArea } from '../ds/TextField'

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
    : `${them} will see your name and photo. You’ll still see them as ${them} until they choose to reveal.`
}

export function ConnectSheet({
  visible,
  displayName,
  theyAreRevealed = false,
  sending,
  error,
  onSend,
  onDismiss,
}: {
  visible: boolean
  /** Server-resolved. The pseudonym before a reveal, the real name after. */
  displayName: string
  theyAreRevealed?: boolean
  sending?: boolean
  /**
   * Why the last send did not go, said under the field it is about (a refusal of
   * the text names what to change). A toast sat behind the sheet's scrim, dimmed
   * and gone in seconds (drive 2026-10-27). Shown until the text is edited.
   */
  error?: string
  onSend: (message: string) => void
  onDismiss: () => void
}) {
  const [message, setMessage] = useState('')
  // The text the shown error is about: editing it clears the error (DS: in error until the value changes).
  const [sentAs, setSentAs] = useState<string | null>(null)

  /*
   * The note is written to ONE person. Every opening starts empty, whoever the caller says it is for: `SenderCard` mounts a
   * single sheet for every sender in a chat, so state that outlived the opening was sent to the next person (SCRUM-912).
   * A refused send keeps the sheet open, so the note stays; adjusted in render, on the same change, so no frame shows the old one.
   */
  const [wasVisible, setWasVisible] = useState(visible)
  if (visible !== wasVisible) {
    setWasVisible(visible)
    if (visible) {
      setMessage('')
      setSentAs(null)
    }
  }

  const trimmed = message.trim()
  /* Required, not optional — the server refuses an empty one either way. */
  const canSend = trimmed.length > 0 && message.length <= CONNECT_MESSAGE_MAX && !sending

  return (
    <Sheet
      testID="connect-sheet"
      visible={visible}
      onClose={onDismiss}
      icon="message-circle"
      title={`Connect with ${displayName}`}
      /*
       * Above the field, not in a confirmation after it. Somebody who has typed a paragraph has already decided; the cost
       * belongs before the effort, where it can still change the answer.
       */
      body={connectDisclosure(displayName, theyAreRevealed)}
      actions={[
        { label: 'Send request', kind: 'primary', onPress: () => {
            setSentAs(message)
            onSend(message)
          }, loading: sending, disabled: !canSend },
        { label: 'Cancel', kind: 'tertiary', onPress: onDismiss },
      ]}
    >
      {/*
        A reason, not a formality. The recipient decides on this sentence alone -- "Someone wants to connect" is a coin flip.
        One-shot: the strongest protection in the feature and the only one with a consequence the sender should weigh.
      */}
      <TextArea
        value={message}
        onChangeText={setMessage}
        placeholder="Why do you want to talk?"
        limit={CONNECT_MESSAGE_MAX}
        hint="They see this before deciding. You can only send one request to someone."
        error={error && message === sentAs ? error : undefined}
        minHeight={SHEET_FIELD_MIN}
        testID="connect-message"
      />
    </Sheet>
  )
}

/** Flow 6 `user` 08: the field is 72 tall, a line and a half; it grows with what is typed. */
const SHEET_FIELD_MIN = 72

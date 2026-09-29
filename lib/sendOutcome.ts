import { userMessage } from './userMessage'

/**
 * What became of one message send, for the room and the direct message alike.
 *
 * The server can accept a message and still withhold it: when moderation hides
 * content it returns **200** with the text nulled and `moderation_hidden: true`.
 * A caller that checked only `success` left the optimistic bubble on screen
 * showing the sender their own words while nobody else could see them —
 * accidental shadowbanning, in the surfaces the product's trust model rests on.
 * The room was fixed first and the DM, whose screening arrived later, was not,
 * so the decision lives here once rather than in each screen.
 *
 * A refusal keeps the server's own sentence where it wrote one for the person
 * (`USER_MUTED`, `CHAT_CLOSED`, `SPAM_BLOCKED` …, see `userMessage`). Both
 * screens once flattened every refusal into one generic line, and a muted user
 * retried forever.
 */
export type SendOutcome =
  | { kind: 'sent' }
  | { kind: 'withheld' }
  | { kind: 'failed'; reason: string }

export function sendOutcome(result: {
  success: boolean
  data?: unknown
  error?: string | null
  errorCode?: string | null
}): SendOutcome {
  if (!result.success) return { kind: 'failed', reason: userMessage(result, "Couldn't send. Try again.") }
  const hidden = (result.data as { moderation_hidden?: boolean } | undefined)?.moderation_hidden
  return hidden ? { kind: 'withheld' } : { kind: 'sent' }
}

/**
 * The line a match conversation opens with.
 *
 * ## Why this is not a message
 *
 * `private_messages.sender_id` is a required foreign key and there is no `kind`
 * column, so a real "you both matched" row needs a nullable sender plus an enum
 * — and then it reaches three more systems: `unreadCount` counts messages, so
 * every new match would carry a permanent **1 unread** until opened; the
 * moderation pipeline would scan product copy nobody wrote; and push title
 * resolution reads `sender.name` on a message with no sender.
 *
 * The conversation already carries everything the line needs. Drawing it costs
 * no column and no exception in three places. The trade is that it does not
 * appear in a data export, which is the right thing to give up.
 *
 * ## Why a header rather than an empty state
 *
 * The obvious version renders it when the thread has no messages. That loses a
 * race: B liked first, gets the push, and if A types before B opens the app, B
 * arrives at an ordinary thread and never learns it came from a match. It also
 * flashes during pagination, when "no messages yet" and "not loaded yet" look
 * identical.
 *
 * So it is a header pinned above the first message. Both people always see it,
 * whoever types first, it needs no message count, and it scrolls away on its own
 * as the conversation grows.
 */

/** What the thread needs to know. A subset of the conversation payload. */
export interface MatchOpenerInput {
  /**
   * Opened from a mutual like rather than an accepted message request.
   *
   * Server-supplied (`GET /conversations`, `GET /conversations/:id`) and not
   * derivable here: the payload carries the resolved name and `theyRevealed`,
   * and the server's `mayShowRealName` returns true for **both** a
   * never-pseudonymous conversation and a revealed match. Building on
   * `theyRevealed` would have greeted every accepted message request as a match.
   */
  fromMatch?: boolean
  /** Theirs — the pseudonym until they reveal, the real name after. */
  otherName?: string | null
}

export interface MatchOpener {
  title: string
  body: string
}

/**
 * The header for this thread, or `null` if it has none.
 *
 * `null` for an accepted message request: those have shown real names since they
 * existed and were never a match, so a match greeting on one is simply false.
 */
export function matchOpener(input: MatchOpenerInput): MatchOpener | null {
  if (!input.fromMatch) return null

  const name = input.otherName?.trim()

  return {
    title: 'You both said yes.',
    /*
     * Names them when there is a name, because "you and Cosmic Panda" reads as
     * a person and "you both liked each other" reads as a system notice.
     *
     * The fallback is not a placeholder for a missing name — the server's own
     * last resort is "Someone", and an unrevealed match legitimately has no
     * better answer. It must never say "Unknown", which reads as a data error.
     */
    body: name
      ? `You and ${name} liked each other. Say something — they are waiting on the same screen.`
      : 'You liked each other. Say something first.',
  }
}

/**
 * The preview an inbox row shows for a match nobody has written in yet.
 *
 * The Banter's generic fallback is "Start chatting", which is true of any empty
 * thread and says nothing about why this one exists. A row that arrived because
 * two people chose each other should say so before it is opened.
 */
export function matchRowPreview(input: MatchOpenerInput): string | null {
  if (!input.fromMatch) return null
  return 'You matched — start the conversation'
}

/**
 * What a conversation shows, and what you can do about it.
 *
 * A DM opened by a mutual like carries **the same pseudonym the match card
 * showed**. First names and one photo each appear only once both have tapped
 * Swap names, and only in that chat.
 *
 * The server decides all of it (`lib/conversation-identity.ts` there); this is
 * the copy and the affordances that go with the answer. It lives here rather
 * than in the screen for the reason `lib/reveal.ts` does: the suite has no
 * React Native testing library, so anything inside a component is unreachable
 * from a test, and these are exactly the strings that fail quietly when wrong.
 */

export interface ConversationRevealState {
  /** Their name as the server resolved it: the pseudonym until you have both swapped, then their first name. Never derived here. */
  displayName: string
  /** You tapped Swap names. */
  youRevealed: boolean
  /** You may see their name and photo: true only once BOTH of you tapped (or on a conversation that was never pseudonymous). */
  theyRevealed: boolean
  /** They tapped Swap names and you have not ("they want to swap"). */
  revealRequested: boolean
  /** False for a conversation that was never pseudonymous (an accepted message request). */
  pseudonymous: boolean
  /**
   * Opened from a mutual like rather than an accepted message request.
   *
   * Distinct from `pseudonymous`: a swapped match is still a match. The thread header keys off this, so it survives the swap.
   */
  fromMatch?: boolean
}

/**
 * Swap names (identity model, owner 2026-11-11; server #1001; board `swap-names/`, advisor pick A): the strip's state and the
 * header's line. Nothing shows until BOTH tap; then each sees the other's first name and one photo, in this chat only.
 *
 * - `none`: neither tapped. Swap names.
 * - `mine`: you tapped. Waiting, with Cancel (nothing shows yet).
 * - `theirs`: they tapped. Their ask leads, with Swap names.
 * - both tapped: the strip folds, unless the server offers Add friend, which keeps it as `both`, the one action left.
 * - An accepted message request was never pseudonymous: no strip, no line.
 */
export type RevealBarState = 'none' | 'mine' | 'theirs' | 'both'
export type RevealView = {
  bar: RevealBarState | null
  line: { seen: boolean; text: string } | null
}

/** What the strip is showing, as a key: folding it away is remembered against this, so a new state brings it back. */
export function revealPanelKey(view: Pick<RevealView, 'bar'> | null): string | null {
  return view?.bar ?? null
}

/** The header's line under the name: short enough for one line beside the face at 360 (TG-17, C25). */
export const REVEAL_LINE_MAX = 33

/** The anonymous state's line is the one most people see, so it is short enough for one line at 1.3 text on a 360 dp phone ("You’re both ano…", rc9 D2). */
export const ANON_LINE_MAX = 16

export function revealView(state: ConversationRevealState, friendOffered = false): RevealView {
  if (!state.pseudonymous) return { bar: null, line: null }
  // `theyRevealed` is the server's "both": a one-sided tap never sets it.
  if (state.theyRevealed) return { bar: friendOffered ? 'both' : null, line: { seen: true, text: 'Names swapped' } }
  if (state.youRevealed) return { bar: 'mine', line: { seen: false, text: 'Waiting for them' } }
  if (state.revealRequested) return { bar: 'theirs', line: { seen: false, text: 'Wants to swap' } }
  return { bar: 'none', line: { seen: false, text: 'Both anonymous' } }
}

/**
 * What leaving says, and it changes once they know your face.
 *
 * Before a reveal, unmatching genuinely ends it: they never knew who you were.
 * After, the app can close the channel and nothing more, so a sheet that
 * implied otherwise would be selling a protection it cannot provide.
 */
export function leaveConfirmation(
  displayName: string,
  /**
   * Whether they know who you are — a reveal, or a conversation that never
   * was pseudonymous. An accepted message request showed them your name and
   * photo in the request itself, and this sheet told the sender "They never
   * saw your name." Driven on iOS; the caller passes the union.
   */
  theyKnowYou: boolean,
  fromMatch = true
): { title: string; body: string } {
  return {
    // "Unmatch" is the wrong verb for two people who never matched.
    title: fromMatch ? `Unmatch ${displayName}?` : `End the conversation with ${displayName}?`,
    body: theyKnowYou
      ? `The conversation closes for both of you and you won’t see each other in rooms again. They already know your ${fromMatch ? 'first name and photo' : 'name and photo'} — ${fromMatch ? 'unmatching' : 'ending it'} doesn’t undo that.`
      : "The conversation closes for both of you and you won’t see each other in rooms again. They never saw your name.",
  }
}

/**
 * How wide the copy served to people who have not revealed is.
 *
 * 40 pixels scaled up to a card **is** the blur — there is no filter to defeat,
 * because the detail is not in the file. That is the whole point: the
 * alternative was `blurRadius` on the real image, which means the real URL
 * already reached the device, and a proxy or a cache dump undoes it. This repo
 * has shipped that exact bug (`MatchScreen.tsx` still carries the comment "the
 * anonymity was one tap deep").
 *
 * Declared here rather than in `photoUtils` so it is reachable from a test:
 * that module imports `expo-image-manipulator`, which a node test environment
 * cannot load. `createBlurDerivative` imports it from here.
 */
export const BLUR_WIDTH = 40

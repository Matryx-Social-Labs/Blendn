/**
 * What a conversation shows, and what you can do about it.
 *
 * A DM opened by a mutual like carries **the same pseudonym the match card
 * showed**. The real name and photos appear when that side reveals — each side
 * independently, and never in reverse.
 *
 * The server decides all of it (`lib/conversation-identity.ts` there); this is
 * the copy and the affordances that go with the answer. It lives here rather
 * than in the screen for the reason `lib/reveal.ts` does: the suite has no
 * React Native testing library, so anything inside a component is unreachable
 * from a test, and these are exactly the strings that fail quietly when wrong.
 */

export interface ConversationRevealState {
  /** Their name as the server resolved it — pseudonym or real. Never derived here. */
  displayName: string
  /** Whether *you* have shown them who you are. */
  youRevealed: boolean
  /** Whether *they* have shown you. */
  theyRevealed: boolean
  /** Whether they have asked you to reveal. There is no "declined". */
  revealRequested: boolean
  /** Null for a conversation that was never pseudonymous (a message request). */
  pseudonymous: boolean
  /**
   * Opened from a mutual like rather than an accepted message request.
   *
   * Distinct from `pseudonymous`, which this used to be inferred from: a match
   * that has been revealed is no longer pseudonymous but is still a match. The
   * thread header keys off this, so it survives the reveal.
   */
  fromMatch?: boolean
}

/**
 * What the DM shows about who can see whom (Flow 5 DM #01–#05, RevealBar):
 * the two-sided bar's state (or none), the header's eye line, and the nudge
 * under the bar when they asked you.
 *
 * - Both anonymous: Show them · Ask them. Once you ask (this session — the
 *   server keeps no "you asked"), the Asked state; there is no declined state.
 * - They revealed, you haven't: Show them, and their name.
 * - You revealed, they haven't: no button; they decide.
 * - Both revealed: the bar is gone for good and the header becomes a button, except while the server offers "Add friend":
 *   the bar stays as `both`, the one action left.
 * - An accepted message request was never pseudonymous: no bar, no line.
 */
export type RevealView = {
  bar: 'none' | 'youOnly' | 'theyOnly' | 'asked' | 'both' | null
  line: { seen: boolean; text: string } | null
  nudge: string | null
}

/**
 * What the reveal panel is showing, as a key: its state and whether somebody asked. Folding the panel away
 * is remembered against this key, so a new state (you asked, they revealed) or a new nudge ("{name} asked
 * to know who you are") brings it back, and the same one stays folded. Null when there is no panel.
 */
export function revealPanelKey(view: Pick<RevealView, 'bar' | 'nudge'> | null): string | null {
  return view?.bar ? `${view.bar}:${view.nudge ?? ''}` : null
}

/** The header's line under the name: short enough for one line beside the face at 360 (TG-17, C25), each side said once. */
export const REVEAL_LINE_MAX = 33

/** The anonymous state's line is the one most people see, so it is short enough for one line at 1.3 text on a 360 dp phone ("You’re both ano…", rc9 D2). */
export const ANON_LINE_MAX = 16

export function revealView(state: ConversationRevealState, askedHere = false, friendOffered = false): RevealView {
  if (!state.pseudonymous) return { bar: null, line: null, nudge: null }
  if (state.youRevealed && state.theyRevealed) {
    // Both can see each other: the bar is gone for good, unless the server offers to add them as a friend (SCRUM-750), which is the one
    // thing left to say. It goes again once asked.
    return { bar: friendOffered ? 'both' : null, line: { seen: true, text: 'You see each other' }, nudge: null }
  }
  // Being asked is the only signal the other person can send: surfaced, never a demand, never counted.
  const nudge = !state.youRevealed && state.revealRequested ? `${state.displayName} asked to know who you are` : null
  if (state.youRevealed) return { bar: 'youOnly', line: { seen: false, text: 'They see you · you don’t see them' }, nudge: null }
  if (state.theyRevealed) return { bar: 'theyOnly', line: { seen: false, text: 'You see them · they don’t see you' }, nudge }
  return askedHere
    ? { bar: 'asked', line: { seen: false, text: 'Both anonymous · asked' }, nudge }
    : { bar: 'none', line: { seen: false, text: 'Both anonymous' }, nudge }
}

/**
 * What the confirmation says before somebody reveals.
 *
 * The irreversibility is the whole message. A control that reads like a toggle
 * implies it can be toggled back, and nothing can unsee a name and a face — so
 * the copy has to say so *before* the tap rather than explaining afterwards.
 */
export function revealConfirmation(displayName: string): {
  title: string
  body: string
  confirm: string
} {
  return {
    title: `Show ${displayName} who you are?`,
    body: 'They’ll see your name and photos. This can’t be undone — you can block them, but you can’t take it back.',
    confirm: 'Show them',
  }
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
      ? `The conversation closes for both of you and you won’t see each other in rooms again. They already know your name and photos — ${fromMatch ? 'unmatching' : 'ending it'} doesn’t undo that.`
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

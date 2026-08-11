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
}

export type RevealAction =
  /** Nothing to do — this conversation never hid anything. */
  | { kind: 'none' }
  /** You are anonymous to them. Offer to reveal. */
  | { kind: 'reveal'; label: string; nudge: string | null }
  /** You have revealed and they have not. Offer to ask. */
  | { kind: 'ask'; label: string }
  /** Both sides are visible. */
  | { kind: 'done'; label: string }

/**
 * The single control at the top of a conversation.
 *
 * One control, not two: at any moment there is exactly one thing worth
 * offering, and a screen with both "Reveal" and "Ask them to reveal" makes the
 * person work out which applies to them.
 */
export function revealAction(state: ConversationRevealState): RevealAction {
  if (!state.pseudonymous) return { kind: 'none' }

  if (!state.youRevealed) {
    return {
      kind: 'reveal',
      label: 'Show them who you are',
      /*
       * Being asked is worth surfacing, because it is the only signal the
       * other person can send. It is deliberately not a demand and carries no
       * count -- asking twice writes the same flag, so there is nothing to
       * escalate and nothing to feel nagged by.
       */
      nudge: state.revealRequested ? `${state.displayName} asked to know who you are` : null,
    }
  }

  if (!state.theyRevealed) {
    return { kind: 'ask', label: `Ask ${state.displayName} to reveal` }
  }

  return { kind: 'done', label: 'You both revealed' }
}

/**
 * The line under the name.
 *
 * Somebody has to be able to tell, at a glance, whether the person they are
 * talking to knows who they are. Not knowing is the state that makes people
 * close the app — and unlike the room chip, this one describes a pair, so it
 * has to say both halves without turning either into a status to be judged.
 */
export function revealSubtitle(state: ConversationRevealState): string | null {
  if (!state.pseudonymous) return null
  if (state.youRevealed && state.theyRevealed) return null
  if (state.youRevealed) return "They can see your name. You can't see theirs yet."
  if (state.theyRevealed) return "You can see their name. They can't see yours."
  return "You're both anonymous here"
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
    body: "They'll see your name and photos. This can't be undone — you can block them, but you can't take it back.",
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
  youRevealed: boolean
): { title: string; body: string } {
  return {
    title: `Unmatch ${displayName}?`,
    body: youRevealed
      ? "The conversation closes for both of you and you won't see each other in rooms again. They already know your name and photos — unmatching doesn't undo that."
      : "The conversation closes for both of you and you won't see each other in rooms again. They never saw your name.",
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

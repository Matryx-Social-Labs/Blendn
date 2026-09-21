/*
 * Whether the room knows who you are, and how the app says so.
 *
 * Pure — no storage, no navigation, no fetch — for the same reason
 * `lib/onboarding.ts` is: this is the logic worth testing, and AsyncStorage
 * cannot be imported under `testEnvironment: node`.
 *
 * ## Why this file exists at all
 *
 * `profiles.reveal_by_default` was unwritable until now, on the reasoning that
 * "being named has to be something a person did in a room, not a profile
 * setting they flipped once". That reasoning is right, and locking the field
 * was the wrong way to hold it: someone happy to be seen re-answered at every
 * door, and someone who wanted to stay anonymous was told nothing about which
 * state they were in.
 *
 * The rule now lives in three places instead. The server holds the first — a
 * check-in row is created `revealed: false` whatever the profile says, so being
 * named is always a tap. This file holds the other two: the warning before the
 * first public entry, and the banner that runs for as long as you are inside.
 */

/**
 * What the room currently knows.
 *
 * `hidden` is "Show online status" off (SCRUM-141): counted in the room's
 * numbers and listed nowhere — not on the roster, not on the grid, so nobody
 * can like you either. It outranks reveal: a name nobody is shown is not a
 * state worth describing.
 */
export type RoomVisibility = 'anonymous' | 'named' | 'hidden'

export function roomVisibility(revealed: boolean, listed = true): RoomVisibility {
  if (!listed) return 'hidden'
  return revealed ? 'named' : 'anonymous'
}

/**
 * The banner copy, in the second person and in the present tense.
 *
 * Present tense on purpose: "You are anonymous" is a fact about right now,
 * where "Anonymous mode" is a label that could equally be a button. The whole
 * job of the banner is that someone glancing at it knows their state without
 * reading twice.
 *
 * The anonymous line names the pseudonym rather than saying "anonymous",
 * because a person can see their pseudonym on their own messages and the two
 * need to obviously be the same thing.
 */
export function bannerText(
  visibility: RoomVisibility,
  pseudonym?: string | null
): { title: string; action: string } {
  if (visibility === 'hidden') {
    return {
      title: "You're not listed here — Show online status is off",
      action: 'Turn it on',
    }
  }
  if (visibility === 'named') {
    return {
      title: 'People here can see your name and photo',
      action: 'Go anonymous',
    }
  }
  return {
    title: pseudonym ? `You're in this room as ${pseudonym}` : "You're anonymous in this room",
    action: 'Show who I am',
  }
}

/**
 * Warn before the first public check-in, and only the first.
 *
 * Three conditions, and all of them matter:
 *
 *  - **`revealByDefault`** — someone entering anonymously has nothing to be
 *    warned about, and a dialog on the safe path teaches people to dismiss
 *    dialogs.
 *  - **`hasSeenWarning`** — once. A warning on every check-in is a speed bump,
 *    and the banner is what carries the message from then on.
 *  - **`canReveal`** — with no name and no photo there is nothing to show, so
 *    the warning would describe an exposure that cannot happen. `lib/reveal.ts`
 *    already computes this for the reveal switch; the same answer applies here.
 */
export function shouldWarnBeforePublicCheckIn(input: {
  revealByDefault: boolean
  hasSeenWarning: boolean
  canReveal: boolean
}): boolean {
  return input.revealByDefault && !input.hasSeenWarning && input.canReveal
}

/**
 * What the warning says.
 *
 * Names the two things that actually become visible, because "your profile will
 * be public" is vague enough that people agree to it without picturing it. It
 * also says the room is the scope — this is not a global switch, and someone
 * who thinks it is will either refuse it or be surprised later.
 */
export const PUBLIC_CHECKIN_WARNING = {
  title: 'Everyone here will see your name and photo',
  body:
    "You chose to enter events as yourself. In this room, that means your real name and your first photo, to everyone who is here — not just people you match with.\n\nYou can switch to anonymous at any time from the banner at the top.",
  confirm: 'Enter as myself',
  cancel: 'Stay anonymous',
} as const

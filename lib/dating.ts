/**
 * When the app has to ask "interested in" directly, and when it must not.
 *
 * The server owns compatibility — `blendn-admin/lib/dating.ts` derives
 * `interested_in` from gender and orientation and stores it. This is the client
 * half of one specific decision: **whether to show the direct picker**.
 *
 * The reason it exists at all is that orientation labels do not compose with
 * every gender. "Straight" plus "non-binary" has no defined target set; neither
 * does "queer" or "pansexual", which are identities rather than tables. The
 * server returns `null` for those and leaves the column alone — so if the app
 * did not ask, the person would silently end up with no dating tag anywhere and
 * no idea why.
 *
 * ## This is a duplicate, and the duplication is bounded
 *
 * Only the *ambiguity* is mirrored, never the target sets. The app never
 * computes who someone is compatible with, never sends a derived
 * `interested_in` it invented, and never sees anyone else's. If the two ever
 * disagree the failure is a picker shown unnecessarily, or a picker missing and
 * the tag quietly absent — annoying, and not wrong about anybody.
 *
 * Sending the answer explicitly is also the safe side of the server's
 * precedence rule: a client-supplied `interested_in` always wins over
 * derivation, so asking and sending can only make the stored value more
 * accurate.
 */

export const GENDERS = ['woman', 'man', 'non_binary', 'prefer_not_to_say'] as const
export type Gender = (typeof GENDERS)[number]

export const ORIENTATIONS = [
  'straight',
  'gay',
  'lesbian',
  'bisexual',
  'pansexual',
  'queer',
  'asexual',
  'prefer_not_to_say',
] as const
export type Orientation = (typeof ORIENTATIONS)[number]

export const GENDER_LABELS: Record<Gender, string> = {
  woman: 'Woman',
  man: 'Man',
  non_binary: 'Non-binary',
  prefer_not_to_say: 'Prefer not to say',
}

export const ORIENTATION_LABELS: Record<Orientation, string> = {
  straight: 'Straight',
  gay: 'Gay',
  lesbian: 'Lesbian',
  bisexual: 'Bisexual',
  pansexual: 'Pansexual',
  queer: 'Queer',
  asexual: 'Asexual',
  prefer_not_to_say: 'Prefer not to say',
}

/**
 * Does this pair tell the server who to match them with?
 *
 * `false` means **ask** — show the "interested in" picker. Not "assume", and
 * not "skip the question": an unanswered pair means no dating tag on any card,
 * which is a feature quietly doing nothing.
 *
 * `asexual` returns `true` even though it implies an empty set. That is a
 * complete answer, and asking somebody who has just said they are asexual to
 * pick who they want to date would be a strange thing to do.
 */
export function orientationImpliesInterest(
  gender: Gender | null,
  orientation: Orientation | null
): boolean {
  if (!gender || !orientation) return false
  if (orientation === 'asexual') return true
  if (orientation === 'pansexual' || orientation === 'queer') return false
  if (orientation === 'prefer_not_to_say') return false
  // "Straight" and "gay" are defined relative to a binary the other two gender
  // values are not in, so only "bisexual" carries over.
  if (gender === 'non_binary' || gender === 'prefer_not_to_say') {
    return orientation === 'bisexual'
  }
  return true
}

/**
 * The same question for every label somebody holds.
 *
 * **All of them, not any of them**, which mirrors the server exactly: one label
 * it cannot read makes the whole derivation `null`, so if the app asked only
 * when *every* label was unreadable it would skip the picker on sets the server
 * is about to leave underived — and the person ends up with no dating tag and
 * nothing on screen to explain it.
 *
 * An empty set implies nothing, same as a missing single label did.
 */
export function orientationsImplyInterest(
  gender: Gender | null,
  orientations: readonly Orientation[]
): boolean {
  if (!orientations.length) return false
  return orientations.every((o) => orientationImpliesInterest(gender, o))
}

/** Show the direct "interested in" picker? The inverse, named for the caller. */
export function needsInterestedInPicker(
  gender: Gender | null,
  orientations: readonly Orientation[],
  intents: readonly string[]
): boolean {
  if (!intents.includes('dating')) return false
  return !orientationsImplyInterest(gender, orientations)
}

/**
 * Three. Enough for the combinations people actually hold — "queer" plus
 * "bisexual", or "asexual" plus a romantic orientation — and few enough that
 * the field stays a set of labels rather than a paragraph.
 */
export const MAX_ORIENTATIONS = 3

/**
 * Tapping a chip, with the two rules the server also enforces.
 *
 * Here as a function rather than inline in each screen because there are two
 * screens — onboarding and the Settings editor — and a cap enforced in one of
 * them is a 400 from the other.
 *
 * Deselecting is always allowed, including from a full set and including
 * "prefer not to say". A rule that can trap somebody in a state is worse than
 * no rule.
 */
export function toggleOrientation(
  current: readonly Orientation[],
  value: Orientation
): Orientation[] {
  if (current.includes(value)) return current.filter((o) => o !== value)

  // Exclusive in both directions: picking it clears the rest, and picking
  // anything else clears it. Declining to answer is not a fourth thing you are,
  // so "prefer not to say" beside "gay" is two contradictory statements.
  if (value === 'prefer_not_to_say') return [value]
  const kept = current.filter((o) => o !== 'prefer_not_to_say')

  // At the cap this is a no-op, and the screen dims the chips it would refuse
  // so the refusal is visible before the tap rather than after it.
  if (kept.length >= MAX_ORIENTATIONS) return kept
  return [...kept, value]
}

/**
 * Would tapping this chip do nothing? Drives the dimmed state.
 *
 * "Prefer not to say" is never disabled — it replaces the set rather than
 * joining it, so the cap does not apply to it.
 */
export function orientationDisabled(
  current: readonly Orientation[],
  value: Orientation
): boolean {
  if (current.includes(value) || value === 'prefer_not_to_say') return false
  return current.filter((o) => o !== 'prefer_not_to_say').length >= MAX_ORIENTATIONS
}

/**
 * Dating is 18+, as on the server (`blendn-admin lib/age.ts mayDate`). An
 * unknown age is not old enough: the server refuses it with "Add your age…",
 * so offering the choice would only lead to that refusal.
 *
 * Every screen that offers dating asks this. Two did not — onboarding's
 * "Looking for" and Edit profile's "What are you open to?" — and a
 * 17-year-old was offered Dating and then the orientation questions (SCRUM-294).
 */
export const DATING_MIN_AGE = 18

export function mayDate(years: number | null | undefined): boolean {
  return typeof years === 'number' && years >= DATING_MIN_AGE
}

/** "Looking for" without the dating choice, however it was written. */
export function withoutDatingChoice(values: readonly string[]): string[] {
  return values.filter((v) => v.trim().toLowerCase() !== 'dating')
}

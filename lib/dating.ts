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

/** Show the direct "interested in" picker? The inverse, named for the caller. */
export function needsInterestedInPicker(
  gender: Gender | null,
  orientation: Orientation | null,
  intents: readonly string[]
): boolean {
  if (!intents.includes('dating')) return false
  return !orientationImpliesInterest(gender, orientation)
}

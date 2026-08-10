/**
 * Whether someone can meaningfully reveal, and what it says if they cannot.
 *
 * `matching.ts` on the server shows exactly two things when `revealed` is true:
 *
 *     displayName: candidate.revealed && candidate.name ? candidate.name : candidate.pseudonym
 *     photo:       candidate.revealed ? candidate.photo : null
 *
 * A real name and a photo. So with neither, turning the switch on shows
 * *nothing* — the card is byte-for-byte what it was — and the person reasonably
 * concludes the feature is broken rather than that their profile is empty.
 *
 * This is a **capability gate**, not a completeness meter. It names one missing
 * input, for one feature, at the moment somebody reaches for it.
 * `PLACEHOLDER_SCREENS.md` bans profile-strength framing outright, and the
 * distinction is the whole reason: a percentage everywhere pressures the people
 * the pseudonym exists to protect, whereas "add a photo first — that's what
 * others would see" is a fact about this one switch.
 */

export interface RevealReadiness {
  ok: boolean
  /** What to add, phrased to drop into "Add ___ to your profile first". */
  missing: string
}

export function revealReadiness(input: {
  name?: string | null
  photos?: readonly string[] | null
}): RevealReadiness {
  const hasName = typeof input.name === 'string' && input.name.trim().length > 0
  const hasPhoto = Array.isArray(input.photos) && input.photos.length > 0

  if (hasName && hasPhoto) return { ok: true, missing: '' }
  if (!hasName && !hasPhoto) return { ok: false, missing: 'a name and a photo' }
  return { ok: false, missing: hasName ? 'a photo' : 'a name' }
}

/**
 * What the chip says while you are in a room.
 *
 * Your **own** state, which is a different thing from showing anyone else's.
 * `PLACEHOLDER_SCREENS.md` forbids displaying who else has revealed — that
 * turns a personal choice into a count and makes the last holdout visible — but
 * a person is entitled to know, at a glance, whether the room can see their
 * name. Not knowing is the state that makes people close the app.
 */
export function revealChipLabel(revealed: boolean, name?: string | null): string {
  if (!revealed) return "You're anonymous here"
  const trimmed = typeof name === 'string' ? name.trim() : ''
  // Falls back rather than rendering "You're visible as " with nothing after
  // it. Someone revealed with no name still sees a true sentence.
  return trimmed ? `You're visible as ${trimmed}` : "You're visible here"
}

/**
 * The suggestion offered after check-in, when `reveal_by_default` is set.
 *
 * Phrased as a question about *this* room, because that is what it is. The
 * server no longer applies the default — check-in always creates
 * `revealed: false` — so nothing has happened yet and declining writes nothing
 * at all.
 */
export function revealPromptText(name?: string | null): string {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  return trimmed
    ? `You usually join as ${trimmed}. Do that here?`
    : 'You usually show your name. Do that here?'
}

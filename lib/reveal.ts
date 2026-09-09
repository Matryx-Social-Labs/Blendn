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
